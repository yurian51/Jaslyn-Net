import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AccessState, ChangeAccessStateDto, ChangeCustomerServiceStateDto, CreateAccessBindingDto, CreateNetworkJobDto, CreateNetworkSiteDto, JobStatus, ListQueryDto, UpdateNetworkJobDto } from './isp-operations.dto';

@Injectable()
export class IspOperationsService {
  readonly moduleName = 'isp-operations';
  constructor(@Inject(PG_POOL) private readonly db: Pool) {}

  async listAccessBindings(tenantId: string, query: ListQueryDto) {
    const { page, limit } = query; const offset = (page - 1) * limit; const search = query.search?.trim() || null;
    const [data, count] = await Promise.all([
      this.db.query(`SELECT b.id,b.customer_id AS "customerId",c.full_name AS "customerName",b.router_id AS "routerId",b.package_id AS "packageId",b.username,b.access_type AS "accessType",b.state,b.external_reference AS "externalReference",b.activated_at AS "activatedAt",b.suspended_at AS "suspendedAt",b.expires_at AS "expiresAt",b.created_at AS "createdAt" FROM customer_access_bindings b JOIN customers c ON c.tenant_id=b.tenant_id AND c.id=b.customer_id WHERE b.tenant_id=$1 AND ($2::text IS NULL OR b.username ILIKE '%'||$2||'%' OR c.full_name ILIKE '%'||$2||'%') ORDER BY b.created_at DESC LIMIT $3 OFFSET $4`, [tenantId, search, limit, offset]),
      this.db.query(`SELECT COUNT(*)::int AS count FROM customer_access_bindings b JOIN customers c ON c.tenant_id=b.tenant_id AND c.id=b.customer_id WHERE b.tenant_id=$1 AND ($2::text IS NULL OR b.username ILIKE '%'||$2||'%' OR c.full_name ILIKE '%'||$2||'%')`, [tenantId, search]),
    ]);
    const total = count.rows[0]?.count ?? 0; return { data: data.rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async createAccessBinding(tenantId: string, input: CreateAccessBindingDto) {
    try {
      const result = await this.db.query(`INSERT INTO customer_access_bindings (tenant_id,customer_id,router_id,package_id,username,access_type,state,external_reference,expires_at) VALUES ($1,$2,$3,$4,$5,$6,'PENDING',$7,$8) RETURNING *`, [tenantId,input.customerId,input.routerId ?? null,input.packageId ?? null,input.username.trim(),input.accessType,input.externalReference?.trim() || null,input.expiresAt ?? null]);
      return this.mapAccess(result.rows[0]);
    } catch (error: any) { if (error?.code === '23505') throw new ConflictException('Access username already exists for this tenant'); if (error?.code === '23503') throw new NotFoundException('Referenced customer, router, or package was not found'); throw error; }
  }

  async changeAccessState(tenantId: string, id: string, input: ChangeAccessStateDto) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query(`SELECT * FROM customer_access_bindings WHERE tenant_id=$1 AND id=$2 FOR UPDATE`, [tenantId,id]);
      if (!current.rowCount) throw new NotFoundException('Access binding not found');
      const row = current.rows[0]; const previous = row.state as AccessState; const now = new Date();
      const activatedAt = input.state === AccessState.ACTIVE && !row.activated_at ? now : row.activated_at;
      const suspendedAt = input.state === AccessState.SUSPENDED ? now : row.suspended_at;
      const updated = await client.query(`UPDATE customer_access_bindings SET state=$3,activated_at=$4,suspended_at=$5,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *`, [tenantId,id,input.state,activatedAt,suspendedAt]);
      await client.query(`INSERT INTO access_state_events (tenant_id,access_binding_id,previous_state,new_state,reason,source,payment_id) VALUES ($1,$2,$3,$4,$5,'API',$6)`, [tenantId,id,previous,input.state,input.reason.trim(),input.paymentId ?? null]);
      await client.query('COMMIT'); return this.mapAccess(updated.rows[0]);
    } catch (error: any) { await client.query('ROLLBACK').catch(() => undefined); if (error?.code === '23503') throw new NotFoundException('Payment was not found for this tenant'); throw error; } finally { client.release(); }
  }

  async getCustomerServiceState(tenantId: string, customerId: string) {
    const result = await this.db.query(`SELECT id,customer_id AS "customerId",state,reason,source,effective_at AS "effectiveAt",expires_at AS "expiresAt",created_at AS "createdAt" FROM customer_service_state WHERE tenant_id=$1 AND customer_id=$2`, [tenantId,customerId]);
    if (!result.rowCount) throw new NotFoundException('Customer service state not found'); return result.rows[0];
  }

  async setCustomerServiceState(tenantId: string, customerId: string, input: ChangeCustomerServiceStateDto) {
    try {
      const result = await this.db.query(`INSERT INTO customer_service_state (tenant_id,customer_id,state,reason,source,effective_at,expires_at) VALUES ($1,$2,$3,$4,$5,COALESCE($6::timestamptz,now()),$7) ON CONFLICT (tenant_id,customer_id) DO UPDATE SET state=EXCLUDED.state,reason=EXCLUDED.reason,source=EXCLUDED.source,effective_at=EXCLUDED.effective_at,expires_at=EXCLUDED.expires_at RETURNING id,customer_id AS "customerId",state,reason,source,effective_at AS "effectiveAt",expires_at AS "expiresAt",created_at AS "createdAt"`, [tenantId,customerId,input.state,input.reason.trim(),input.source?.trim() || 'API',input.effectiveAt ?? null,input.expiresAt ?? null]);
      return result.rows[0];
    } catch (error: any) { if (error?.code === '23503') throw new NotFoundException('Customer not found'); throw error; }
  }

  async listJobs(tenantId: string, query: ListQueryDto) {
    const offset=(query.page-1)*query.limit; const search=query.search?.trim()||null;
    const [data,count]=await Promise.all([
      this.db.query(`SELECT j.id,j.customer_id AS "customerId",c.full_name AS "customerName",j.site_id AS "siteId",s.name AS "siteName",j.assigned_user_id AS "assignedUserId",j.job_type AS "jobType",j.status,j.priority,j.title,j.description,j.scheduled_at AS "scheduledAt",j.completed_at AS "completedAt",j.created_at AS "createdAt" FROM network_jobs j LEFT JOIN customers c ON c.tenant_id=j.tenant_id AND c.id=j.customer_id LEFT JOIN network_sites s ON s.tenant_id=j.tenant_id AND s.id=j.site_id WHERE j.tenant_id=$1 AND ($2::text IS NULL OR j.title ILIKE '%'||$2||'%' OR j.description ILIKE '%'||$2||'%' OR c.full_name ILIKE '%'||$2||'%') ORDER BY CASE j.priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'NORMAL' THEN 3 ELSE 4 END,j.scheduled_at NULLS LAST,j.created_at DESC LIMIT $3 OFFSET $4`, [tenantId,search,query.limit,offset]),
      this.db.query(`SELECT COUNT(*)::int AS count FROM network_jobs j LEFT JOIN customers c ON c.tenant_id=j.tenant_id AND c.id=j.customer_id WHERE j.tenant_id=$1 AND ($2::text IS NULL OR j.title ILIKE '%'||$2||'%' OR j.description ILIKE '%'||$2||'%' OR c.full_name ILIKE '%'||$2||'%')`, [tenantId,search]),
    ]);
    const total=count.rows[0]?.count??0; return {data:data.rows,pagination:{page:query.page,limit:query.limit,total,pages:Math.ceil(total/query.limit)}};
  }

  async createJob(tenantId: string,input: CreateNetworkJobDto,actorUserId:string) {
    const client=await this.db.connect(); try { await client.query('BEGIN');
      const result=await client.query(`INSERT INTO network_jobs (tenant_id,customer_id,site_id,assigned_user_id,job_type,priority,title,description,scheduled_at) VALUES ($1,$2,$3,$4,$5,COALESCE($6,'NORMAL'),$7,$8,$9) RETURNING *`,[tenantId,input.customerId??null,input.siteId??null,input.assignedUserId??null,input.jobType,input.priority??null,input.title.trim(),input.description?.trim()||null,input.scheduledAt??null]);
      const job=result.rows[0]; await client.query(`INSERT INTO network_job_events (tenant_id,job_id,actor_user_id,event_type,to_status,note) VALUES ($1,$2,$3,'CREATED',$4,$5)`,[tenantId,job.id,actorUserId,job.status,input.description?.trim()||null]); await client.query('COMMIT'); return job;
    } catch(error:any){await client.query('ROLLBACK').catch(()=>undefined);if(error?.code==='23503')throw new NotFoundException('Referenced customer, site, or user was not found');throw error;} finally{client.release();}
  }

  async updateJob(tenantId:string,id:string,input:UpdateNetworkJobDto,actorUserId:string){
    const client=await this.db.connect(); try{await client.query('BEGIN'); const current=await client.query(`SELECT * FROM network_jobs WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,[tenantId,id]); if(!current.rowCount)throw new NotFoundException('Network job not found'); const row=current.rows[0]; const status=input.status??row.status; const completedAt=status===JobStatus.COMPLETED?new Date():status===JobStatus.CANCELED?row.completed_at:null;
      const result=await client.query(`UPDATE network_jobs SET assigned_user_id=$3,priority=$4,status=$5,description=$6,scheduled_at=$7,completed_at=$8,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *`,[tenantId,id,input.assignedUserId??row.assigned_user_id,input.priority??row.priority,status,input.description?.trim()??row.description,input.scheduledAt??row.scheduled_at,completedAt]);
      if(status!==row.status||input.note)await client.query(`INSERT INTO network_job_events (tenant_id,job_id,actor_user_id,event_type,from_status,to_status,note) VALUES ($1,$2,$3,$4,$5,$6,$7)`,[tenantId,id,actorUserId,status===row.status?'NOTE':'STATUS_CHANGED',row.status,status,input.note?.trim()||null]); await client.query('COMMIT'); return result.rows[0];
    }catch(error){await client.query('ROLLBACK').catch(()=>undefined);throw error;}finally{client.release();}
  }

  async jobEvents(tenantId:string,jobId:string){const result=await this.db.query(`SELECT e.id,e.event_type AS "eventType",e.from_status AS "fromStatus",e.to_status AS "toStatus",e.note,e.actor_user_id AS "actorUserId",e.created_at AS "createdAt" FROM network_job_events e WHERE e.tenant_id=$1 AND e.job_id=$2 ORDER BY e.created_at DESC`,[tenantId,jobId]);return result.rows;}

  async listSites(tenantId:string,query:ListQueryDto){const offset=(query.page-1)*query.limit;const search=query.search?.trim()||null;const result=await this.db.query(`SELECT id,location_id AS "locationId",name,site_type AS "siteType",status,parent_site_id AS "parentSiteId",latitude,longitude,created_at AS "createdAt",updated_at AS "updatedAt" FROM network_sites WHERE tenant_id=$1 AND ($2::text IS NULL OR name ILIKE '%'||$2||'%') ORDER BY name LIMIT $3 OFFSET $4`,[tenantId,search,query.limit,offset]);return{data:result.rows,pagination:{page:query.page,limit:query.limit}};}

  async createSite(tenantId:string,input:CreateNetworkSiteDto){try{const result=await this.db.query(`INSERT INTO network_sites (tenant_id,location_id,name,site_type,status,parent_site_id,latitude,longitude) VALUES ($1,$2,$3,COALESCE($4,'POP'),COALESCE($5,'ACTIVE'),$6,$7,$8) RETURNING id,location_id AS "locationId",name,site_type AS "siteType",status,parent_site_id AS "parentSiteId",latitude,longitude,created_at AS "createdAt",updated_at AS "updatedAt"`,[tenantId,input.locationId??null,input.name.trim(),input.siteType??null,input.status??null,input.parentSiteId??null,input.latitude??null,input.longitude??null]);return result.rows[0];}catch(error:any){if(error?.code==='23505')throw new ConflictException('Network site name already exists for this tenant');if(error?.code==='23503')throw new NotFoundException('Referenced location or parent site was not found');throw error;}}

  private mapAccess(row:any){return{id:row.id,customerId:row.customer_id,routerId:row.router_id,packageId:row.package_id,username:row.username,accessType:row.access_type,state:row.state,externalReference:row.external_reference,activatedAt:row.activated_at,suspendedAt:row.suspended_at,expiresAt:row.expires_at,createdAt:row.created_at,updatedAt:row.updated_at};}
}
