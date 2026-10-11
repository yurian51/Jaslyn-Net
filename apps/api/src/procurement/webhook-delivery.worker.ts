import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Inject } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { lookup as dnsLookup } from 'node:dns/promises';
import type { LookupAddress, LookupFunction } from 'node:dns';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { SecretsVaultService } from '../secrets-vault/secrets-vault.service';

type Delivery={id:string;tenant_id:string;endpoint_id:string;event_id:string;event_type:string;payload:Record<string,unknown>;attempt_count:number;endpoint_url:string;secret_key:string};
@Injectable()
export class WebhookDeliveryWorker implements OnModuleInit,OnModuleDestroy {
  private readonly logger=new Logger(WebhookDeliveryWorker.name);
  private timer?:NodeJS.Timeout;
  private running=false;
  constructor(@Inject(PG_POOL) private readonly db:Pool,private readonly secrets:SecretsVaultService){}
  onModuleInit(){this.timer=setInterval(()=>{void this.tick();},5000);void this.tick();}
  onModuleDestroy(){if(this.timer)clearInterval(this.timer);}
  async tick(){if(this.running)return;this.running=true;try{await this.deliverDue();}catch(e){this.logger.error('Webhook delivery cycle failed',e instanceof Error?e.stack:undefined);}finally{this.running=false;}}
  private isPublic(address:string):boolean{
    if(isIP(address)===4){const p=address.split('.').map(Number);if(p.length!==4)return false;const a=p[0]??0,b=p[1]??0;return !(a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===0||b===2||b===168))||(a===100&&b>=64&&b<=127)||(a===198&&(b===18||b===19||b===51))||(a===203&&b===0&&o[2]===113)||(a===192&&b===88&&o[2]===99));}
    if(isIP(address)===6){const x=address.toLowerCase();if(x==='::'||x==='::1'||x.startsWith('::ffff:')||x.startsWith('fe80:')||x.startsWith('fc')||x.startsWith('fd')||x.startsWith('ff')||x.startsWith('2001:db8:')||x.startsWith('2001:10:')||x.startsWith('2001:20:'))return false;return x.startsWith('2')||x.startsWith('3');}
    return false;
  }
  private async resolvePublic(url:URL):Promise<LookupAddress[]>{
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||(url.port&&url.port!=='443'))throw new Error('TARGET_POLICY_REJECTED');
    const host=url.hostname.toLowerCase();if(!host||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||isIP(host))throw new Error('TARGET_POLICY_REJECTED');
    const records=await dnsLookup(host,{all:true,verbatim:true});
    if(!records.length||records.some(x=>!this.isPublic(x.address)))throw new Error('TARGET_POLICY_REJECTED');
    return records;
  }
  private post(url:URL,addresses:LookupAddress[],body:string,secret:string,eventId:string,eventType:string):Promise<number>{
    const first=addresses[0];if(!first)return Promise.reject(new Error('DNS_EMPTY'));
    const timestamp=String(Date.now());const signature=createHmac('sha256',secret).update(timestamp+'.'+body).digest('hex');
    const pinnedLookup=((_hostname:string,_options:unknown,callback:(err:NodeJS.ErrnoException|null,address:string,family:number)=>void)=>callback(null,first.address,first.family)) as unknown as LookupFunction;
    return new Promise((resolve,reject)=>{
      const request=httpsRequest(url,{method:'POST',lookup:pinnedLookup,servername:url.hostname,timeout:8000,maxHeaderSize:8192,headers:{
        'content-type':'application/json','content-length':String(Buffer.byteLength(body)),'user-agent':'Jaslyn-Net-Webhooks/1.0',
        'x-jaslyn-event-id':eventId,'x-jaslyn-event-type':eventType,'x-jaslyn-timestamp':timestamp,'x-jaslyn-signature':'sha256='+signature,
      }},response=>{
        let size=0;response.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>4096)response.destroy(new Error('RESPONSE_TOO_LARGE'));});
        response.on('end',()=>resolve(response.statusCode??0));response.on('error',reject);
      });
      request.on('timeout',()=>request.destroy(new Error('WEBHOOK_TIMEOUT')));request.on('error',reject);request.end(body);
    });
  }
  async deliverDue(){
    const claimed=await this.db.query<Delivery>(`WITH due AS (
      SELECT o.tenant_id,o.id FROM webhook_delivery_outbox o
      JOIN tenant_webhook_endpoints e ON e.tenant_id=o.tenant_id AND e.id=o.endpoint_id
      WHERE o.status IN ('PENDING','RETRY') AND o.next_attempt_at<=now() AND e.enabled=true
      ORDER BY o.next_attempt_at,o.created_at FOR UPDATE OF o SKIP LOCKED LIMIT 20
    )
    UPDATE webhook_delivery_outbox o SET status='DELIVERING',attempt_count=o.attempt_count+1
    FROM due,tenant_webhook_endpoints e,tenant_secrets s
    WHERE o.tenant_id=due.tenant_id AND o.id=due.id AND e.tenant_id=o.tenant_id AND e.id=o.endpoint_id
      AND s.tenant_id=e.tenant_id AND s.id=e.secret_reference
    RETURNING o.id,o.tenant_id,o.endpoint_id,o.event_id,o.event_type,o.payload,o.attempt_count,e.endpoint_url,s.secret_key`,[]);
    for(const row of claimed.rows){
      try{
        const url=new URL(row.endpoint_url);const addresses=await this.resolvePublic(url);
        const secret=await this.secrets.getSecretValue(row.tenant_id,row.secret_key);
        const body=JSON.stringify({id:row.event_id,type:row.event_type,createdAt:new Date().toISOString(),data:row.payload});
        const status=await this.post(url,addresses,body,secret,row.event_id,row.event_type);
        if(status<200||status>=300)throw new Error('HTTP_'+status);
        await this.db.query(`UPDATE webhook_delivery_outbox SET status='DELIVERED',delivered_at=now(),last_http_status=$3,last_error_code=NULL WHERE tenant_id=$1 AND id=$2`,[row.tenant_id,row.id,status]);
      }catch(e){
        const message=e instanceof Error?e.message:'DELIVERY_FAILED';const terminal=row.attempt_count>=8;
        const delay=Math.min(3600,15*Math.pow(2,Math.min(row.attempt_count-1,8)));
        await this.db.query(`UPDATE webhook_delivery_outbox SET status=$3,next_attempt_at=now()+make_interval(secs=>$4),last_error_code=$5 WHERE tenant_id=$1 AND id=$2`,
          [row.tenant_id,row.id,terminal?'DEAD':'RETRY',delay,message.startsWith('HTTP_')?message.slice(0,40):message==='TARGET_POLICY_REJECTED'?message:'DELIVERY_FAILED']);
        if(terminal)this.logger.warn('Webhook delivery moved to DEAD after bounded retries');
      }
    }
    return {claimed:claimed.rowCount??0};
  }
}
