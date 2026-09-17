import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { SessionsService } from '../sessions/sessions.service';
import {
  AccessState,
  ChangeAccessStateDto,
  CreateAccessBindingDto,
  CreateNetworkJobDto,
  CreateNetworkSiteDto,
  JobStatus,
  ListQueryDto,
  UpdateNetworkJobDto,
} from './isp-operations.dto';

type AccessRow = {
  id: string;
  customer_id: string;
  router_id: string | null;
  package_id: string | null;
  username: string;
  access_type: string;
  state: AccessState;
  external_reference: string | null;
  activated_at: Date | null;
  suspended_at: Date | null;
  expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class IspOperationsService {
  readonly moduleName = 'isp-operations';
  constructor(@Inject(PG_POOL) private readonly db: Pool, private readonly sessions: SessionsService) {}

  async listAccessBindings(tenantId: string, query: ListQueryDto) {
    const offset = (query.page - 1) * query.limit;
    const search = query.search?.trim() || null;
    const [data, count] = await Promise.all([
      this.db.query(`SELECT b.id,b.customer_id AS "customerId",c.full_name AS "customerName",b.router_id AS "routerId",b.package_id AS "packageId",b.username,b.access_type AS "accessType",b.state,b.external_reference AS "externalReference",b.activated_at AS "activatedAt",b.suspended_at AS "suspendedAt",b.expires_at AS "expiresAt",b.created_at AS "createdAt" FROM customer_access_bindings b JOIN customers c ON c.tenant_id=b.tenant_id AND c.id=b.customer_id WHERE b.tenant_id=$1 AND ($2::text IS NULL OR b.username ILIKE '%'||$2||'%' OR c.full_name ILIKE '%'||$2||'%') ORDER BY b.created_at DESC LIMIT $3 OFFSET $4`, [tenantId, search, query.limit, offset]),
      this.db.query(`SELECT COUNT(*)::int AS count FROM customer_access_bindings b JOIN customers c ON c.tenant_id=b.tenant_id AND c.id=b.customer_id WHERE b.tenant_id=$1 AND ($2::text IS NULL OR b.username ILIKE '%'||$2||'%' OR c.full_name ILIKE '%'||$2||'%')`, [tenantId, search]),
    ]);
    const total = count.rows[0]?.count ?? 0;
    return { data: data.rows, pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) } };
  }

  async createAccessBinding(tenantId: string, input: CreateAccessBindingDto) {
    try {
      const result = await this.db.query<AccessRow>(`INSERT INTO customer_access_bindings (tenant_id,customer_id,router_id,package_id,username,access_type,state,external_reference,expires_at) VALUES ($1,$2,$3,$4,$5,$6,'PENDING',$7,$8) RETURNING *`, [tenantId, input.customerId, input.routerId ?? null, input.packageId ?? null, input.username.trim(), input.accessType, input.externalReference?.trim() || null, input.expiresAt ?? null]);
      return this.mapAccess(result.rows[0]);
    } catch (error: unknown) {
      const code = this.pgCode(error);
      if (code === '23505') throw new ConflictException('Access username already exists for this tenant');
      if (code === '23503') throw new NotFoundException('Referenced customer, router, or package was not found');
      throw error;
    }
  }

  async changeAccessState(tenantId: string, id: string, input: ChangeAccessStateDto) {
    const client = await this.db.connect();
    let changed = false;
    try {
      await client.query('BEGIN');
      const current = await client.query<AccessRow>('SELECT * FROM customer_access_bindings WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [tenantId, id]);
      if (!current.rowCount) throw new NotFoundException('Access binding not found');
      const row = current.rows[0];
      if (row.state === input.state) {
        await client.query('COMMIT');
        return this.mapAccess(row);
      }
      const now = new Date();
      const activatedAt = input.state === AccessState.ACTIVE && !row.activated_at ? now : row.activated_at;
      const suspendedAt = input.state === AccessState.SUSPENDED ? now : null;
      const updated = await client.query<AccessRow>(`UPDATE customer_access_bindings SET state=$3,activated_at=$4,suspended_at=$5,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *`, [tenantId, id, input.state, activatedAt, suspendedAt]);
      await client.query(`INSERT INTO access_state_events (tenant_id,access_binding_id,previous_state,new_state,reason,source,payment_id) VALUES ($1,$2,$3,$4,$5,'API',$6)`, [tenantId, id, row.state, input.state, input.reason.trim(), input.paymentId ?? null]);
      await client.query('COMMIT');
      changed = true;
      const reconciliation = await this.sessions.reconcileAccessState(tenantId, { requestId: `access-binding:${id}` });
      return { ...this.mapAccess(updated.rows[0]), reconciliation };
    } catch (error: unknown) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (this.pgCode(error) === '23503') throw new NotFoundException('Payment was not found for this tenant');
      throw error;
    } finally { client.release(); }
  }

  async accessEvents(tenantId: string, accessBindingId: string) {
    const binding = await this.db.query('SELECT 1 FROM customer_access_bindings WHERE tenant_id=$1 AND id=$2', [tenantId, accessBindingId]);
    if (!binding.rowCount) throw new NotFoundException('Access binding not found');
    const result = await this.db.query(`SELECT e.id,e.previous_state AS "previousState",e.new_state AS "newState",e.reason,e.source,e.payment_id AS "paymentId",e.created_at AS "createdAt" FROM access_state_events e WHERE e.tenant_id=$1 AND e.access_binding_id=$2 ORDER BY e.created_at DESC`, [tenantId, accessBindingId]);
    return result.rows;
  }

  async listJobs(tenantId: string, query: ListQueryDto) {
    const offset = (query.page - 1) * query.limit;
    const search = query.search?.trim() || null;
    const [data, count] = await Promise.all([
      this.db.query(`SELECT j.id,j.customer_id AS "customerId",c.full_name AS "customerName",j.site_id AS "siteId",s.name AS "siteName",j.assigned_user_id AS "assignedUserId",j.job_type AS "jobType",j.status,j.priority,j.title,j.description,j.scheduled_at AS "scheduledAt",j.completed_at AS "completedAt",j.created_at AS "createdAt" FROM network_jobs j LEFT JOIN customers c ON c.tenant_id=j.tenant_id AND c.id=j.customer_id LEFT JOIN network_sites s ON s.tenant_id=j.tenant_id AND s.id=j.site_id WHERE j.tenant_id=$1 AND ($2::text IS NULL OR j.title ILIKE '%'||$2||'%' OR j.description ILIKE '%'||$2||'%' OR c.full_name ILIKE '%'||$2||'%') ORDER BY CASE j.priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'NORMAL' THEN 3 ELSE 4 END,j.scheduled_at NULLS LAST,j.created_at DESC LIMIT $3 OFFSET $4`, [tenantId, search, query.limit, offset]),
      this.db.query(`SELECT COUNT(*)::int AS count FROM network_jobs j LEFT JOIN customers c ON c.tenant_id=j.tenant_id AND c.id=j.customer_id WHERE j.tenant_id=$1 AND ($2::text IS NULL OR j.title ILIKE '%'||$2||'%' OR j.description ILIKE '%'||$2||'%' OR c.full_name ILIKE '%'||$2||'%')`, [tenantId, search]),
    ]);
    const total = count.rows[0]?.count ?? 0;
    return { data: data.rows, pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) } };
  }

  async createJob(tenantId: string, input: CreateNetworkJobDto, actorUserId: string) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(`INSERT INTO network_jobs (tenant_id,customer_id,site_id,assigned_user_id,job_type,priority,title,description,scheduled_at) VALUES ($1,$2,$3,$4,$5,COALESCE($6,'NORMAL'),$7,$8,$9) RETURNING *`, [tenantId, input.customerId ?? null, input.siteId ?? null, input.assignedUserId ?? null, input.jobType, input.priority ?? null, input.title.trim(), input.description?.trim() || null, input.scheduledAt ?? null]);
      const job = result.rows[0];
      await client.query(`INSERT INTO network_job_events (tenant_id,job_id,actor_user_id,event_type,to_status,note) VALUES ($1,$2,$3,'CREATED',$4,$5)`, [tenantId, job.id, actorUserId, job.status, input.description?.trim() || null]);
      await client.query('COMMIT');
      return job;
    } catch (error: unknown) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (this.pgCode(error) === '23503') throw new NotFoundException('Referenced customer, site, or user was not found');
      throw error;
    } finally { client.release(); }
  }

  async updateJob(tenantId: string, id: string, input: UpdateNetworkJobDto, actorUserId: string) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query('SELECT * FROM network_jobs WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [tenantId, id]);
      if (!current.rowCount) throw new NotFoundException('Network job not found');
      const row = current.rows[0];
      const status = input.status ?? row.status;
      const completedAt = status === JobStatus.COMPLETED ? row.completed_at ?? new Date() : null;
      const result = await client.query(`UPDATE network_jobs SET assigned_user_id=$3,priority=$4,status=$5,description=$6,scheduled_at=$7,completed_at=$8,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *`, [tenantId, id, input.assignedUserId ?? row.assigned_user_id, input.priority ?? row.priority, status, input.description?.trim() ?? row.description, input.scheduledAt ?? row.scheduled_at, completedAt]);
      if (status !== row.status || input.note) await client.query(`INSERT INTO network_job_events (tenant_id,job_id,actor_user_id,event_type,from_status,to_status,note) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [tenantId, id, actorUserId, status === row.status ? 'NOTE' : 'STATUS_CHANGED', row.status, status, input.note?.trim() || null]);
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  async jobEvents(tenantId: string, jobId: string) {
    const job = await this.db.query('SELECT 1 FROM network_jobs WHERE tenant_id=$1 AND id=$2', [tenantId, jobId]);
    if (!job.rowCount) throw new NotFoundException('Network job not found');
    const result = await this.db.query(`SELECT e.id,e.event_type AS "eventType",e.from_status AS "fromStatus",e.to_status AS "toStatus",e.note,e.actor_user_id AS "actorUserId",e.created_at AS "createdAt" FROM network_job_events e WHERE e.tenant_id=$1 AND e.job_id=$2 ORDER BY e.created_at DESC`, [tenantId, jobId]);
    return result.rows;
  }

  async listSites(tenantId: string, query: ListQueryDto) {
    const offset = (query.page - 1) * query.limit;
    const search = query.search?.trim() || null;
    const [data, count] = await Promise.all([
      this.db.query(`SELECT id,location_id AS "locationId",name,site_type AS "siteType",status,parent_site_id AS "parentSiteId",latitude,longitude,created_at AS "createdAt",updated_at AS "updatedAt" FROM network_sites WHERE tenant_id=$1 AND ($2::text IS NULL OR name ILIKE '%'||$2||'%') ORDER BY name LIMIT $3 OFFSET $4`, [tenantId, search, query.limit, offset]),
      this.db.query(`SELECT COUNT(*)::int AS count FROM network_sites WHERE tenant_id=$1 AND ($2::text IS NULL OR name ILIKE '%'||$2||'%')`, [tenantId, search]),
    ]);
    const total = count.rows[0]?.count ?? 0;
    return { data: data.rows, pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) } };
  }

  async createSite(tenantId: string, input: CreateNetworkSiteDto) {
    if (input.parentSiteId) {
      const parent = await this.db.query('SELECT 1 FROM network_sites WHERE tenant_id=$1 AND id=$2', [tenantId, input.parentSiteId]);
      if (!parent.rowCount) throw new NotFoundException('Parent network site was not found');
    }
    try {
      const result = await this.db.query(`INSERT INTO network_sites (tenant_id,location_id,name,site_type,status,parent_site_id,latitude,longitude) VALUES ($1,$2,$3,COALESCE($4,'POP'),COALESCE($5,'ACTIVE'),$6,$7,$8) RETURNING id,location_id AS "locationId",name,site_type AS "siteType",status,parent_site_id AS "parentSiteId",latitude,longitude,created_at AS "createdAt",updated_at AS "updatedAt"`, [tenantId, input.locationId ?? null, input.name.trim(), input.siteType ?? null, input.status ?? null, input.parentSiteId ?? null, input.latitude ?? null, input.longitude ?? null]);
      return result.rows[0];
    } catch (error: unknown) {
      const code = this.pgCode(error);
      if (code === '23505') throw new ConflictException('Network site name already exists for this tenant');
      if (code === '23503') throw new NotFoundException('Referenced location or parent site was not found');
      throw error;
    }
  }

  private mapAccess(row: AccessRow) {
    return { id: row.id, customerId: row.customer_id, routerId: row.router_id, packageId: row.package_id, username: row.username, accessType: row.access_type, state: row.state, externalReference: row.external_reference, activatedAt: row.activated_at, suspendedAt: row.suspended_at, expiresAt: row.expires_at, createdAt: row.created_at, updatedAt: row.updated_at };
  }

  private pgCode(error: unknown): string | undefined {
    if (typeof error === 'object' && error !== null && 'code' in error) return (error as { code?: string }).code;
    return undefined;
  }
}
