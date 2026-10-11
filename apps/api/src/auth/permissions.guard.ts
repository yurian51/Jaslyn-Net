import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { AuthenticatedRequest } from './auth.guard';

export const DEFAULT_PERMISSION_ROLES:Record<string,string[]>={
 'sessions.read':['OWNER','ADMIN','CASHIER','AGENT','READ_ONLY'],'sessions.revoke':['OWNER','ADMIN','CASHIER','AGENT','READ_ONLY'],
 'secrets.read':['OWNER','ADMIN'],'secrets.write':['OWNER','ADMIN'],
 'network.policy.read':['OWNER','ADMIN','AGENT','READ_ONLY'],
 'network.policy.write':['OWNER','ADMIN'],'network.policy.evaluate':['OWNER','ADMIN','AGENT'],
 'compliance.read':['OWNER','ADMIN','AGENT','READ_ONLY'],'compliance.scan':['OWNER','ADMIN'],'compliance.manage':['OWNER','ADMIN'],
 'synthetic.read':['OWNER','ADMIN','AGENT','READ_ONLY'],'synthetic.write':['OWNER','ADMIN'],'synthetic.check':['OWNER','ADMIN','AGENT'],
 'revenue.read':['OWNER','ADMIN','CASHIER','READ_ONLY'],'revenue.reconcile':['OWNER','ADMIN'],'revenue.manage':['OWNER','ADMIN'],
 'incident.read':['OWNER','ADMIN','CASHIER','AGENT','READ_ONLY'],'incident.manage':['OWNER','ADMIN','AGENT'],
 'status.manage':['OWNER','ADMIN'],'maintenance.read':['OWNER','ADMIN','AGENT','READ_ONLY'],'maintenance.manage':['OWNER','ADMIN'],
 'field.read':['OWNER','ADMIN','AGENT','READ_ONLY'],'field.write':['OWNER','ADMIN','AGENT'],'field.sync':['OWNER','ADMIN','AGENT'],
 'network.changes.read':['OWNER','ADMIN','AGENT','READ_ONLY'],'audit.read':['OWNER','ADMIN'],
};

@Injectable()
export class PermissionsGuard implements CanActivate {
 constructor(private readonly reflector:Reflector,@Inject(PG_POOL) private readonly db:Pool){}
 async canActivate(context:ExecutionContext):Promise<boolean>{
  const permissions=this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY,[context.getHandler(),context.getClass()]);
  if(!permissions?.length)return true;
  const request=context.switchToHttp().getRequest<AuthenticatedRequest>();const user=request.user;
  if(!user?.tenantId||!user.id||!user.role)return false;
  for(const permission of permissions){
   const userOverride=await this.db.query('SELECT allowed FROM user_permission_overrides WHERE tenant_id=$1 AND user_id=$2 AND permission_key=$3',[user.tenantId,user.id,permission]);
   if(userOverride.rowCount){if(userOverride.rows[0].allowed!==true)return false;continue;}
   const roleOverride=await this.db.query('SELECT allowed FROM tenant_role_permissions WHERE tenant_id=$1 AND role=$2 AND permission_key=$3',[user.tenantId,user.role,permission]);
   if(roleOverride.rowCount){if(roleOverride.rows[0].allowed!==true)return false;continue;}
   if(!(DEFAULT_PERMISSION_ROLES[permission]??[]).includes(user.role))return false;
  }
  return true;
 }
}
