import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { AuthenticatedRequest } from './auth.guard';
import { hasPermission } from './permission-resolver';

export { DEFAULT_PERMISSION_ROLES } from './permission-defaults';

@Injectable()
export class PermissionsGuard implements CanActivate {
 constructor(private readonly reflector:Reflector,@Inject(PG_POOL) private readonly db:Pool){}
 async canActivate(context:ExecutionContext):Promise<boolean>{
  const permissions=this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY,[context.getHandler(),context.getClass()]);
  if(!permissions?.length)return true;
  const request=context.switchToHttp().getRequest<AuthenticatedRequest>();const user=request.user;
  if(!user?.tenantId||!user.id||!user.role)return false;
  for(const permission of permissions){
   if(!(await hasPermission(this.db,{tenantId:user.tenantId,userId:user.id,role:user.role},permission)))return false;
  }
  return true;
 }
}
