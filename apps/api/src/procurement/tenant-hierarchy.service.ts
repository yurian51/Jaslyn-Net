import { ConflictException, Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditService } from '../audit/audit.service';
import { CreateTenantRelationshipDto } from './procurement.dto';

@Injectable()
export class TenantHierarchyService {
  constructor(@Inject(PG_POOL) private readonly db:Pool,private readonly audit:AuditService){}
  async list(tenantId:string){
    const r=await this.db.query(`SELECT tenant_id AS "tenantId",parent_tenant_id AS "parentTenantId",relationship_type AS "relationshipType",status,created_at AS "createdAt"
      FROM tenant_reseller_relationships WHERE tenant_id=$1 OR parent_tenant_id=$1 ORDER BY created_at DESC`,[tenantId]);
    return {data:r.rows};
  }
  async request(tenantId:string,actorId:string,d:CreateTenantRelationshipDto){
    if(tenantId===d.parentTenantId)throw new BadRequestException('A tenant cannot be its own parent');
    const parent=await this.db.query('SELECT id FROM tenants WHERE id=$1',[d.parentTenantId]);
    if(!parent.rowCount)throw new NotFoundException('Parent tenant not found');
    const cycle=await this.db.query(`WITH RECURSIVE chain(id) AS (
      SELECT $2::uuid UNION SELECT r.parent_tenant_id FROM tenant_reseller_relationships r
      JOIN chain c ON r.tenant_id=c.id WHERE r.status IN ('ACTIVE','PENDING')
    ) SELECT EXISTS(SELECT 1 FROM chain WHERE id=$1) AS cycle`,[tenantId,d.parentTenantId]);
    if(cycle.rows[0]?.cycle===true)throw new ConflictException('Tenant hierarchy would create a cycle');
    try{
      const r=await this.db.query(`INSERT INTO tenant_reseller_relationships(tenant_id,parent_tenant_id,relationship_type,status,created_by)
        VALUES($1,$2,$3,'PENDING',$4) RETURNING tenant_id AS "tenantId",parent_tenant_id AS "parentTenantId",relationship_type AS "relationshipType",status,created_at AS "createdAt"`,[tenantId,d.parentTenantId,d.relationshipType,actorId]);
      await this.audit.record(tenantId,'REQUEST','tenant_relationship',tenantId,{parentTenantId:d.parentTenantId,relationshipType:d.relationshipType},{userId:actorId});
      return r.rows[0];
    }catch(e:unknown){if(typeof e==='object'&&e!==null&&'code' in e&&(e as {code?:string}).code==='23505')throw new ConflictException('This tenant already has a parent relationship');throw e;}
  }
  async approve(parentTenantId:string,actorId:string,childTenantId:string){
    const r=await this.db.query(`UPDATE tenant_reseller_relationships SET status='ACTIVE'
      WHERE parent_tenant_id=$1 AND tenant_id=$2 AND status='PENDING'
      RETURNING tenant_id AS "tenantId",parent_tenant_id AS "parentTenantId",relationship_type AS "relationshipType",status`,[parentTenantId,childTenantId]);
    if(!r.rowCount)throw new NotFoundException('Pending relationship not found under this parent tenant');
    await this.audit.record(parentTenantId,'APPROVE','tenant_relationship',childTenantId,{childTenantId},{userId:actorId});
    return r.rows[0];
  }
}
