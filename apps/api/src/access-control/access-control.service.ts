import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditContext } from '../audit/audit.service';
import { DEFAULT_PERMISSION_ROLES } from '../auth/permissions.guard';

@Injectable()
export class AccessControlService {
  constructor(@Inject(PG_POOL) private readonly db:Pool){}
  async list(tenantId:string){
    const [catalog,roles,users]=await Promise.all([
      this.db.query('SELECT permission_key AS "permissionKey",description FROM permission_catalog ORDER BY permission_key'),
      this.db.query('SELECT role,permission_key AS "permissionKey",allowed,updated_at AS "updatedAt" FROM tenant_role_permissions WHERE tenant_id=$1 ORDER BY role,permission_key',[tenantId]),
      this.db.query('SELECT user_id AS "userId",permission_key AS "permissionKey",allowed,updated_at AS "updatedAt" FROM user_permission_overrides WHERE tenant_id=$1 ORDER BY user_id,permission_key LIMIT 1000',[tenantId]),
    ]);
    return {catalog:catalog.rows.map(row=>({...row,defaultRoles:DEFAULT_PERMISSION_ROLES[row.permissionKey]??[]})),roleOverrides:roles.rows,userOverrides:users.rows};
  }
  private async assertPermission(permissionKey:string){const r=await this.db.query('SELECT permission_key FROM permission_catalog WHERE permission_key=$1',[permissionKey]);if(!r.rowCount)throw new NotFoundException('Permission key not found');}
  private async audit(client:PoolClient,tenantId:string,actorUserId:string,action:string,resourceType:string,resourceId:string|null,metadata:Record<string,unknown>,context:AuditContext){
    await client.query(`INSERT INTO audit_logs(tenant_id,actor_user_id,action,resource_type,resource_id,request_id,correlation_id,ip_address,user_agent,metadata)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,[tenantId,actorUserId,action,resourceType,resourceId,context.requestId??null,context.correlationId??null,context.ipAddress??null,context.userAgent??null,JSON.stringify(metadata)]);
  }
  async setRolePermission(tenantId:string,actorUserId:string,role:string,permissionKey:string,allowed:boolean,context:AuditContext={}){
    if(!/^[A-Z_]{2,40}$/.test(role))throw new BadRequestException('Invalid role name');await this.assertPermission(permissionKey);const client=await this.db.connect();
    try{await client.query('BEGIN');const r=await client.query(`INSERT INTO tenant_role_permissions(tenant_id,role,permission_key,allowed,updated_by,updated_at) VALUES($1,$2,$3,$4,$5,now()) ON CONFLICT(tenant_id,role,permission_key) DO UPDATE SET allowed=EXCLUDED.allowed,updated_by=EXCLUDED.updated_by,updated_at=now() RETURNING role,permission_key AS "permissionKey",allowed,updated_at AS "updatedAt"`,[tenantId,role,permissionKey,allowed,actorUserId]);await this.audit(client,tenantId,actorUserId,'ROLE_PERMISSION_CHANGED','tenant_role_permission',null,{role,permissionKey,allowed},context);await client.query('COMMIT');return r.rows[0];}
    catch(e){await client.query('ROLLBACK').catch(()=>undefined);throw e;}finally{client.release();}
  }
  async clearRolePermission(tenantId:string,actorUserId:string,role:string,permissionKey:string,context:AuditContext={}){
    const client=await this.db.connect();try{await client.query('BEGIN');const r=await client.query('DELETE FROM tenant_role_permissions WHERE tenant_id=$1 AND role=$2 AND permission_key=$3 RETURNING id',[tenantId,role,permissionKey]);await this.audit(client,tenantId,actorUserId,'ROLE_PERMISSION_RESET','tenant_role_permission',null,{role,permissionKey,removed:Boolean(r.rowCount)},context);await client.query('COMMIT');return {removed:Boolean(r.rowCount)};}catch(e){await client.query('ROLLBACK').catch(()=>undefined);throw e;}finally{client.release();}
  }
  async setUserPermission(tenantId:string,actorUserId:string,userId:string,permissionKey:string,allowed:boolean,context:AuditContext={}){
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId))throw new BadRequestException('Invalid user UUID');await this.assertPermission(permissionKey);const client=await this.db.connect();
    try{await client.query('BEGIN');const user=await client.query('SELECT id FROM users WHERE tenant_id=$1 AND id=$2 AND is_active=true',[tenantId,userId]);if(!user.rowCount)throw new NotFoundException('Active user not found in this tenant');const r=await client.query(`INSERT INTO user_permission_overrides(tenant_id,user_id,permission_key,allowed,updated_by,updated_at) VALUES($1,$2,$3,$4,$5,now()) ON CONFLICT(tenant_id,user_id,permission_key) DO UPDATE SET allowed=EXCLUDED.allowed,updated_by=EXCLUDED.updated_by,updated_at=now() RETURNING user_id AS "userId",permission_key AS "permissionKey",allowed,updated_at AS "updatedAt"`,[tenantId,userId,permissionKey,allowed,actorUserId]);await this.audit(client,tenantId,actorUserId,'USER_PERMISSION_CHANGED','user_permission_override',null,{targetUserId:userId,permissionKey,allowed},context);await client.query('COMMIT');return r.rows[0];}
    catch(e){await client.query('ROLLBACK').catch(()=>undefined);throw e;}finally{client.release();}
  }
  async clearUserPermission(tenantId:string,actorUserId:string,userId:string,permissionKey:string,context:AuditContext={}){
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId))throw new BadRequestException('Invalid user UUID');const client=await this.db.connect();
    try{await client.query('BEGIN');const r=await client.query('DELETE FROM user_permission_overrides WHERE tenant_id=$1 AND user_id=$2 AND permission_key=$3 RETURNING id',[tenantId,userId,permissionKey]);await this.audit(client,tenantId,actorUserId,'USER_PERMISSION_RESET','user_permission_override',null,{targetUserId:userId,permissionKey,removed:Boolean(r.rowCount)},context);await client.query('COMMIT');return {removed:Boolean(r.rowCount)};}
    catch(e){await client.query('ROLLBACK').catch(()=>undefined);throw e;}finally{client.release();}
  }
}
