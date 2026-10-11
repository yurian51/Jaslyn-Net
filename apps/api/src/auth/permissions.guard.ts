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
 'procurement.read':['OWNER','ADMIN','CASHIER','AGENT','READ_ONLY'],'procurement.manage':['OWNER','ADMIN','CASHIER'],
 'inventory.read':['OWNER','ADMIN','CASHIER','AGENT','READ_ONLY'],'inventory.manage':['OWNER','ADMIN','CASHIER'],
 'msp.branding.manage':['OWNER','ADMIN'],'msp.hierarchy.read':['OWNER','ADMIN'],'msp.hierarchy.manage':['OWNER','ADMIN'],
 'platform.api.manage':['OWNER','ADMIN'],'platform.audit.read':['OWNER','ADMIN'],
 'network.experience.read':['OWNER','ADMIN','AGENT','READ_ONLY'],'network.experience.ingest':['OWNER','ADMIN','AGENT'],
 'network.capacity.read':['OWNER','ADMIN','AGENT','READ_ONLY'],'device.lifecycle.read':['OWNER','ADMIN','AGENT','READ_ONLY'],'device.lifecycle.manage':['OWNER','ADMIN'],
 'power.read':['OWNER','ADMIN','AGENT','READ_ONLY'],'power.ingest':['OWNER','ADMIN','AGENT'],'sla.read':['OWNER','ADMIN','AGENT','READ_ONLY'],'sla.manage':['OWNER','ADMIN'],
 'automation.read':['OWNER','ADMIN','AGENT','READ_ONLY'],'automation.manage':['OWNER','ADMIN'],
 'automation.workflow.read':['OWNER','ADMIN','AGENT','READ_ONLY'],'automation.workflow.manage':['OWNER','ADMIN'],'automation.workflow.approve':['OWNER','ADMIN'],
 'msp.usage.read':['OWNER','ADMIN','READ_ONLY'],'msp.usage.manage':['OWNER','ADMIN'],
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
