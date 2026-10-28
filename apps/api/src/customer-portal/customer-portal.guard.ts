import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verifyAccessToken } from '../auth/jwt';
import type { Request } from 'express';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

export type CustomerPortalRequest=Request&{
  headers:{authorization?:string};
  customerPortal?:{customerId:string;tenantId:string;sessionId:string;username:string};
};
@Injectable()
export class CustomerPortalGuard implements CanActivate {
  constructor(private readonly config:ConfigService,@Inject(PG_POOL) private readonly db:Pool){}
  async canActivate(context:ExecutionContext){
    const req=context.switchToHttp().getRequest<CustomerPortalRequest>();
    const authorization=req.headers.authorization;
    if(!authorization?.startsWith('Bearer '))throw new UnauthorizedException('Customer portal login required');
    const secret=this.config.get<string>('JWT_SECRET');
    if(!secret||secret.length<32)throw new UnauthorizedException('Customer portal authentication is not configured');
    let payload;
    try{payload=verifyAccessToken(authorization.slice(7).trim(),secret,undefined,'jaslyn-customer-portal');}
    catch{throw new UnauthorizedException('Customer portal session is invalid or expired');}
    if(typeof payload.sub!=='string'||typeof payload.tenantId!=='string'||typeof payload.sid!=='string'||payload.role!=='CUSTOMER'||typeof payload.username!=='string')
      throw new UnauthorizedException('Customer portal session claims are incomplete');
    const session=await this.db.query(`SELECT s.id FROM customer_portal_sessions s
      JOIN customers c ON c.tenant_id=s.tenant_id AND c.id=s.customer_id
      WHERE s.id=$1 AND s.tenant_id=$2 AND s.customer_id=$3 AND s.revoked_at IS NULL
        AND s.expires_at>now() AND c.is_active=true`,[payload.sid,payload.tenantId,payload.sub]);
    if(!session.rowCount)throw new UnauthorizedException('Customer portal session was revoked or expired');
    await this.db.query("UPDATE customer_portal_sessions SET last_seen_at=now() WHERE id=$1 AND last_seen_at<now()-interval '5 minutes'",[payload.sid]);
    req.customerPortal={customerId:payload.sub,tenantId:payload.tenantId,sessionId:payload.sid,username:payload.username};
    return true;
  }
}
