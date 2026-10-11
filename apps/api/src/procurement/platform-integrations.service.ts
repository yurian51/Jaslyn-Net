import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditService } from '../audit/audit.service';
import { CreatePlatformApiKeyDto, CreateWebhookEndpointDto } from './procurement.dto';

@Injectable()
export class PlatformIntegrationsService {
  constructor(@Inject(PG_POOL) private readonly db:Pool,private readonly audit:AuditService){}

  private async auditChange(tenantId:string,actorId:string,action:string,type:string,id:string,metadata:Record<string,unknown>={}){
    await this.audit.record(tenantId,action,type,id,metadata,{userId:actorId});
  }
  private isPublicAddress(address:string):boolean {
    if(isIP(address)===4){
      const o=address.split('.').map(Number);if(o.length!==4)return false;
      const a=o[0]??0,b=o[1]??0;
      return !(a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===0||b===2||b===168))||(a===100&&b>=64&&b<=127)||(a===198&&(b===18||b===19||b===51))||(a===203&&b===0&&o[2]===113)||(a===192&&b===88&&o[2]===99));
    }
    if(isIP(address)===6){
      const x=address.toLowerCase();
      if(x==='::'||x==='::1'||x.startsWith('::ffff:')||x.startsWith('fe80:')||x.startsWith('fc')||x.startsWith('fd')||x.startsWith('ff')||x.startsWith('2001:db8:')||x.startsWith('2001:10:')||x.startsWith('2001:20:'))return false;
      return x.startsWith('2')||x.startsWith('3');
    }
    return false;
  }
  private async validateTarget(raw:string):Promise<URL>{
    let url:URL;try{url=new URL(raw);}catch{throw new BadRequestException('Webhook URL is invalid');}
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||(url.port&&url.port!=='443'))throw new BadRequestException('Webhook URL must use HTTPS port 443 without credentials, query or fragment');
    const host=url.hostname.toLowerCase();
    if(!host||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||isIP(host))throw new BadRequestException('Webhook host must be a public DNS hostname');
    let addresses;try{addresses=await dnsLookup(host,{all:true,verbatim:true});}catch{throw new BadRequestException('Webhook hostname did not resolve');}
    if(!addresses.length||addresses.some(a=>!this.isPublicAddress(a.address)))throw new BadRequestException('Webhook hostname resolves to a private or reserved address');
    return url;
  }
  async listApiKeys(tenantId:string){
    const r=await this.db.query(`SELECT id,name,token_prefix AS "tokenPrefix",scopes,rate_limit_per_minute AS "rateLimitPerMinute",expires_at AS "expiresAt",last_used_at AS "lastUsedAt",revoked_at AS "revokedAt",created_at AS "createdAt" FROM platform_api_keys WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 500`,[tenantId]);
    return {data:r.rows};
  }
  async createApiKey(tenantId:string,actorId:string,d:CreatePlatformApiKeyDto){
    const allowed=new Set(['read','network.read','network.write','finance.read','finance.write','inventory.read','inventory.write','procurement.read','procurement.write','webhooks.manage']);
    const scopes=[...new Set(d.scopes.map(x=>String(x).trim()).filter(Boolean))];
    if(!scopes.length||scopes.some(x=>!allowed.has(x)))throw new BadRequestException('API key scopes contain unsupported values');
    const token='jn_live_'+randomBytes(32).toString('base64url');
    const digest=createHash('sha256').update(token).digest('hex');
    const r=await this.db.query(`INSERT INTO platform_api_keys(tenant_id,name,token_prefix,token_digest,scopes,rate_limit_per_minute,expires_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,name,token_prefix AS "tokenPrefix",scopes,rate_limit_per_minute AS "rateLimitPerMinute",expires_at AS "expiresAt",created_at AS "createdAt"`,[tenantId,d.name.trim(),token.slice(0,16),digest,scopes,d.rateLimitPerMinute??60,d.expiresAt??null,actorId]);
    await this.auditChange(tenantId,actorId,'CREATE','platform_api_key',r.rows[0].id,{name:d.name,scopes,tokenPrefix:token.slice(0,16)});
    return {...r.rows[0],token};
  }
  async revokeApiKey(tenantId:string,actorId:string,id:string){
    const r=await this.db.query(`UPDATE platform_api_keys SET revoked_at=now() WHERE tenant_id=$1 AND id=$2 AND revoked_at IS NULL RETURNING id,name,token_prefix AS "tokenPrefix"`,[tenantId,id]);
    if(!r.rowCount)throw new NotFoundException('Active API key not found');
    await this.auditChange(tenantId,actorId,'REVOKE','platform_api_key',id,{name:r.rows[0].name});
    return {revoked:true,id};
  }
  async listWebhooks(tenantId:string){
    const r=await this.db.query(`SELECT id,name,endpoint_url AS "endpointUrl",secret_reference AS "secretReference",event_types AS "eventTypes",enabled,created_at AS "createdAt",updated_at AS "updatedAt" FROM tenant_webhook_endpoints WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 500`,[tenantId]);
    return {data:r.rows};
  }
  async createWebhook(tenantId:string,actorId:string,d:CreateWebhookEndpointDto){
    const target=await this.validateTarget(d.endpointUrl);
    const secret=await this.db.query('SELECT id FROM tenant_secrets WHERE tenant_id=$1 AND id=$2',[tenantId,d.secretReference]);
    if(!secret.rowCount)throw new NotFoundException('Webhook signing secret must exist in this tenant vault');
    const allowed=new Set(['payment.settled','invoice.issued','refund.updated','purchase_order.created','supplier_invoice.created','supplier_invoice.payment_recorded','inventory.movement','incident.updated','network.device.updated','automation.rule.matched']);
    const events=[...new Set(d.eventTypes.map(x=>String(x).trim()).filter(Boolean))];
    if(!events.length||events.some(x=>!allowed.has(x)))throw new BadRequestException('Webhook event list contains unsupported event types');
    const r=await this.db.query(`INSERT INTO tenant_webhook_endpoints(tenant_id,name,endpoint_url,secret_reference,event_types,enabled,created_by) VALUES($1,$2,$3,$4,$5,false,$6) RETURNING id,name,endpoint_url AS "endpointUrl",secret_reference AS "secretReference",event_types AS "eventTypes",enabled,created_at AS "createdAt"`,[tenantId,d.name.trim(),target.toString(),d.secretReference,events,actorId]);
    await this.auditChange(tenantId,actorId,'CREATE','webhook_endpoint',r.rows[0].id,{name:d.name,eventTypes:events,enabled:false});
    return r.rows[0];
  }
  async setWebhookEnabled(tenantId:string,actorId:string,id:string,enabled:boolean){
    const existing=await this.db.query('SELECT endpoint_url,secret_reference FROM tenant_webhook_endpoints WHERE tenant_id=$1 AND id=$2',[tenantId,id]);
    if(!existing.rowCount)throw new NotFoundException('Webhook endpoint not found');
    if(enabled){
      await this.validateTarget(existing.rows[0].endpoint_url);
      const secret=await this.db.query('SELECT id FROM tenant_secrets WHERE tenant_id=$1 AND id=$2',[tenantId,existing.rows[0].secret_reference]);
      if(!secret.rowCount)throw new ConflictException('Signing secret is missing from this tenant vault');
    }
    const r=await this.db.query('UPDATE tenant_webhook_endpoints SET enabled=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,enabled',[tenantId,id,enabled]);
    await this.auditChange(tenantId,actorId,enabled?'ENABLE':'DISABLE','webhook_endpoint',id,{});
    return r.rows[0];
  }
}
