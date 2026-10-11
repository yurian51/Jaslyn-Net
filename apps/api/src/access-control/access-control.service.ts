import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditContext, AuditService } from '../audit/audit.service';
import { DEFAULT_PERMISSION_ROLES } from '../auth/permissions.guard';

@Injectable()
export class AccessControlService {
  constructor(@Inject(PG_POOL) private readonly db:Pool,private readonly audit:AuditService){}
  async list(tenantId:string){
    const [catalog,roles,users]=await Promise.all([
      this.db.query('SELECT permission_key AS "permissionKey",description FROM permission_catalog ORDER BY permission_key'),
      this.db.query('SELECT role,permission_key AS "permissionKey",allowed,updated_at AS "updatedAt" FROM tenant_role_permissions WHERE tenant_id=$1 ORDER BY role,permission_key',[tenantId]),
      this.db.query('SELECT user_id AS "userId",permission_key AS "permissionKey",allowed,updated_at AS "updatedAt" FROM user_permission_overrides WHERE tenant_id=$1 ORDER BY user_id,permission_key LIMIT 1000',[tenantId]),
    ]);
    return {catalog:catalog.rows.map(row=>({...row,defaultRoles:DEFAULT_PERMISSION_ROLES[row.permissionKey]??[]})),roleOverrides:roles.rows,userOverrides:users.rows};
  }
  private async assertPermission(permissionKey:string){const r=await this.db.query('SELECT permission_key FROM permission_catalog WHERE permission_key=$1',[permissionKey]);if(!r.rowCount)throw new NotFoundException('Permission key not found');}
  async setRolePermission(tenantId:string,actorUserId:string,role:string,permissionKey:string,allowed:boolean,context:AuditContext={}){
    if(!/^[A-Z_]{2,40}$/.test(role))throw new BadRequestException('Invalid role name');await this.assertPermission(permissionKey);
    const r=await this.db.query(`INSERT INTO tenant_role_permissions(tenant_id,role,permission_key,allowed,updated_by,updated_at) VALUES($1,$2,$3,$4,$5,now()) ON CONFLICT(tenant_id,role,permission_key) DO UPDATE SET allowed=EXCLUDED.allowed,updated_by=EXCLUDED.updated_by,updated_at=now() RETURNING role,permission_key AS "permissionKey",allowed,updated_at AS "updatedAt"`,[tenantId,role,permissionKey,allowed,actorUserId]);
    await this.audit.record(tenantId,'ROLE_PERMISSION_CHANGED','tenant_role_permission',undefined,{role,permissionKey,allowed},context);return r.rows[0];
  }
  async clearRolePermission(tenantId:string,actorUserId:string,role:string,permissionKey:string,context:AuditContext={}){
    const r=await this.db.query('DELETE FROM tenant_role_permissions WHERE tenant_id=$1 AND role=$2 AND permission_key=$3 RETURNING id',[tenantId,role,permissionKey]);await this.audit.record(tenantId,'ROLE_PERMISSION_RESET','tenant_role_permission',undefined,{role,permissionKey,removed:Boolean(r.rowCount)},context);return {removed:Boolean(r.rowCount)};
  }
  async setUserPermission(tenantId:string,actorUserId:string,userId:string,permissionKey:string,allowed:boolean,context:AuditContext={}){
    await this.assertPermission(permissionKey);const user=await this.db.query('SELECT id FROM users WHERE tenant_id=$1 AND id=$2 AND is_active=true',[tenantId,userId]);if(!user.rowCount)throw new NotFoundException('Active user not found in this tenant');
    const r=await this.db.query(`INSERT INTO user_permission_overrides(tenant_id,user_id,permission_key,allowed,updated_by,updated_at) VALUES($1,$2,$3,$4,$5,now()) ON CONFLICT(tenant_id,user_id,permission_key) DO UPDATE SET allowed=EXCLUDED.allowed,updated_by=EXCLUDED.updated_by,updated_at=now() RETURNING user_id AS "userId",permission_key AS "permissionKey",allowed,updated_at AS "updatedAt"`,[tenantId,userId,permissionKey,allowed,actorUserId]);
    await this.audit.record(tenantId,'USER_PERMISSION_CHANGED','user_permission_override',undefined,{targetUserId:userId,permissionKey,allowed},context);return r.rows[0];
  }
  async clearUserPermission(tenantId:string,actorUserId:string,userId:string,permissionKey:string,context:AuditContext={}){
    const r=await this.db.query('DELETE FROM user_permission_overrides WHERE tenant_id=$1 AND user_id=$2 AND permission_key=$3 RETURNING id',[tenantId,userId,permissionKey]);await this.audit.record(tenantId,'USER_PERMISSION_RESET','user_permission_override',undefined,{targetUserId:userId,permissionKey,removed:Boolean(r.rowCount)},context);return {removed:Boolean(r.rowCount)};
  }
}
