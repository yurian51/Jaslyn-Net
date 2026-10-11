import { CanActivate, ExecutionContext, Injectable, Inject, TooManyRequestsException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

export const API_KEY_SCOPES='jaslyn:api-key-scopes';
export type ApiKeyRequest=Request & {headers:{authorization?:string};apiKey?:{id:string;tenantId:string;scopes:string[]}};
export const ApiKeyScopes=(...scopes:string[])=>Reflector.createDecorator<string[]>({key:API_KEY_SCOPES})();

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly reflector:Reflector,@Inject(PG_POOL) private readonly db:Pool){}
  async canActivate(context:ExecutionContext):Promise<boolean>{
    const request=context.switchToHttp().getRequest<ApiKeyRequest>();
    const authorization=request.headers.authorization;
    if(!authorization?.startsWith('Bearer '))throw new UnauthorizedException('API key required');
    const token=authorization.slice(7).trim();
    if(!token.startsWith('jn_live_'))throw new UnauthorizedException('Invalid API key');
    const digest=createHash('sha256').update(token).digest('hex');
    const found=await this.db.query<{id:string;tenant_id:string;scopes:string[];rate_limit_per_minute:number}>(
      `SELECT id,tenant_id,scopes,rate_limit_per_minute FROM platform_api_keys
       WHERE token_digest=$1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now()) LIMIT 1`,[digest]);
    if(!found.rowCount)throw new UnauthorizedException('API key is revoked, expired or invalid');
    const key=found.rows[0];
    const usage=await this.db.query(
      `INSERT INTO platform_api_key_usage_windows(tenant_id,api_key_id,window_start,request_count)
       VALUES($1,$2,date_trunc('minute',now()),1)
       ON CONFLICT(tenant_id,api_key_id,window_start) DO UPDATE SET request_count=platform_api_key_usage_windows.request_count+1
       WHERE platform_api_key_usage_windows.request_count<$3 RETURNING request_count`,
      [key.tenant_id,key.id,key.rate_limit_per_minute]);
    if(!usage.rowCount)throw new TooManyRequestsException('API key rate limit exceeded');
    await this.db.query('UPDATE platform_api_keys SET last_used_at=now() WHERE tenant_id=$1 AND id=$2',[key.tenant_id,key.id]);
    const required=this.reflector.getAllAndOverride<string[]>(API_KEY_SCOPES,[context.getHandler(),context.getClass()])??[];
    const scopes=key.scopes??[];
    if(required.some(scope=>!scopes.includes(scope)&&!scopes.includes('read')))throw new UnauthorizedException('API key does not grant the required scope');
    request.apiKey={id:key.id,tenantId:key.tenant_id,scopes};
    return true;
  }
}
