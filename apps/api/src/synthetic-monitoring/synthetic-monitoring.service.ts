import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditContext, AuditService } from '../audit/audit.service';
import { CreateSyntheticMonitorDto } from './synthetic-monitoring.dto';

type Monitor={id:string;tenant_id:string;name:string;check_type:'HTTP'|'DNS'|'CAPTIVE_PORTAL';target:string;expected_status:number;interval_seconds:number;timeout_ms:number};
type CheckResult={status:'PASS'|'FAIL'|'UNKNOWN';latencyMs:number|null;responseCode:number|null;error:string|null};

@Injectable()
export class SyntheticMonitoringService {
  constructor(@Inject(PG_POOL) private readonly db:Pool,private readonly config:ConfigService,private readonly audit:AuditService){}

  private allowedPrivateHosts(){return new Set((this.config.get<string>('SYNTHETIC_ALLOWED_PRIVATE_HOSTS','')||'').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean));}
  private isPublicAddress(address:string){
    if(isIP(address)===4){
      const p=address.split('.').map(Number);if(p.length!==4||p.some(n=>n<0||n>255))return false;
      const [a,b]=p;
      if(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===192&&b===0||a===192&&b===2||a===198&&(b===18||b===19||b===51)||a===203&&b===0||a===100&&b>=64&&b<=127)return false;
      return true;
    }
    if(isIP(address)===6){
      const value=address.toLowerCase();
      if(value.startsWith('::ffff:')||value==='::1'||value==='::'||value.startsWith('fc')||value.startsWith('fd')||value.startsWith('fe80:')||value.startsWith('2001:db8:'))return false;
      return value.startsWith('2')||value.startsWith('3');
    }
    return false;
  }
  private validateTarget(type:CreateSyntheticMonitorDto['checkType'],target:string){
    const value=target.trim();
    if(type==='DNS'){
      if(!/^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/.test(value)||/\.(local|localhost|internal|lan)$/i.test(value))throw new BadRequestException('DNS monitor target must be a fully qualified public hostname or an explicitly allowlisted private hostname');
      return value.toLowerCase();
    }
    let url:URL;try{url=new URL(value);}catch{throw new BadRequestException('HTTP monitor target must be a valid HTTPS URL');}
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||(url.port&&url.port!=='443')||isIP(url.hostname.replace(/^\[|\]$/g,''))||url.hostname==='localhost'||url.hostname.endsWith('.local'))throw new BadRequestException('Monitor URLs must use HTTPS, contain no credentials/query/fragment, and use a hostname rather than an IP literal');
    return url.toString();
  }
  private async resolveAllowed(host:string){
    const allowed=this.allowedPrivateHosts().has(host.toLowerCase());
    const records=await lookup(host,{all:true,verbatim:true});
    if(!records.length)throw new Error('Hostname did not resolve');
    if(!allowed&&records.some(record=>!this.isPublicAddress(record.address)))throw new Error('Target resolves to a non-public address and is not explicitly allowlisted');
    return records;
  }

  async list(tenantId:string){
    const r=await this.db.query(`SELECT id,name,check_type AS "checkType",target,expected_status AS "expectedStatus",interval_seconds AS "intervalSeconds",enabled,last_status AS "lastStatus",last_latency_ms AS "lastLatencyMs",last_response_code AS "lastResponseCode",last_error AS "lastError",last_checked_at AS "lastCheckedAt",next_check_at AS "nextCheckAt",created_at AS "createdAt" FROM synthetic_monitors WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 200`,[tenantId]);return {data:r.rows,count:r.rowCount??0};
  }
  async create(tenantId:string,actorUserId:string,input:CreateSyntheticMonitorDto,context:AuditContext={}){
    const target=this.validateTarget(input.checkType,input.target);
    const r=await this.db.query(`INSERT INTO synthetic_monitors(tenant_id,name,check_type,target,expected_status,interval_seconds,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,name,check_type AS "checkType",target,expected_status AS "expectedStatus",interval_seconds AS "intervalSeconds",enabled,next_check_at AS "nextCheckAt",created_at AS "createdAt"`,[tenantId,input.name.trim(),input.checkType,target,input.expectedStatus??200,input.intervalSeconds??300,actorUserId]);
    await this.audit.record(tenantId,'SYNTHETIC_MONITOR_CREATED','synthetic_monitor',r.rows[0].id,{checkType:input.checkType,intervalSeconds:input.intervalSeconds??300},context);return r.rows[0];
  }
  async setEnabled(tenantId:string,id:string,enabled:boolean,context:AuditContext={}){
    const r=await this.db.query(`UPDATE synthetic_monitors SET enabled=$3,next_check_at=CASE WHEN $3 THEN now() ELSE next_check_at END,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,enabled`,[tenantId,id,enabled]);
    if(!r.rowCount)throw new NotFoundException('Synthetic monitor not found');await this.audit.record(tenantId,enabled?'SYNTHETIC_MONITOR_ENABLED':'SYNTHETIC_MONITOR_DISABLED','synthetic_monitor',id,{},context);return r.rows[0];
  }
  async history(tenantId:string,id:string){
    const exists=await this.db.query('SELECT 1 FROM synthetic_monitors WHERE tenant_id=$1 AND id=$2',[tenantId,id]);if(!exists.rowCount)throw new NotFoundException('Synthetic monitor not found');
    const r=await this.db.query(`SELECT id,status,latency_ms AS "latencyMs",response_code AS "responseCode",error,checked_at AS "checkedAt" FROM synthetic_check_results WHERE tenant_id=$1 AND monitor_id=$2 ORDER BY checked_at DESC LIMIT 500`,[tenantId,id]);return {data:r.rows,count:r.rowCount??0};
  }
  async checkNow(tenantId:string,id:string){
    const r=await this.db.query<Monitor>(`SELECT id,tenant_id,name,check_type,target,expected_status,interval_seconds,timeout_ms FROM synthetic_monitors WHERE tenant_id=$1 AND id=$2`,[tenantId,id]);
    if(!r.rowCount)throw new NotFoundException('Synthetic monitor not found');return this.checkAndRecord(r.rows[0]);
  }
  async runDueChecks(){
    const client=await this.db.connect();let monitors:Monitor[]=[];
    try{
      await client.query('BEGIN');
      const due=await client.query<Monitor>(`WITH due AS (SELECT id FROM synthetic_monitors WHERE enabled=true AND next_check_at<=now() ORDER BY next_check_at LIMIT 20 FOR UPDATE SKIP LOCKED) UPDATE synthetic_monitors m SET next_check_at=now()+(m.interval_seconds*interval '1 second'),updated_at=now() FROM due WHERE m.id=due.id RETURNING m.id,m.tenant_id,m.name,m.check_type,m.target,m.expected_status,m.interval_seconds,m.timeout_ms`);
      monitors=due.rows;await client.query('COMMIT');
    }catch(e){await client.query('ROLLBACK').catch(()=>undefined);throw e;}finally{client.release();}
    return Promise.all(monitors.map(m=>this.checkAndRecord(m)));
  }
  private async checkAndRecord(monitor:Monitor){
    const started=Date.now();let result:CheckResult;let responseCode:number|null=null;
    try{
      if(monitor.check_type==='DNS'){
        await this.resolveAllowed(monitor.target);
      }else{
        const url=new URL(monitor.target);await this.resolveAllowed(url.hostname);
        const response=await fetch(url,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(monitor.timeout_ms),headers:{'User-Agent':'Jaslyn-Net-SyntheticMonitor/1.0'}});
        responseCode=response.status;await response.body?.cancel().catch(()=>undefined);
        if(response.status!==monitor.expected_status)throw new Error('Expected HTTP '+monitor.expected_status+' but received '+response.status);
      }
      result={status:'PASS',latencyMs:Date.now()-started,responseCode,error:null};
    }catch(e){
      const message=e instanceof Error?e.message:'Synthetic check failed';
      result={status:'FAIL',latencyMs:Date.now()-started,responseCode,error:message.slice(0,500)};
    }
    const client=await this.db.connect();
    try{
      await client.query('BEGIN');
      const saved=await client.query(`INSERT INTO synthetic_check_results(tenant_id,monitor_id,status,latency_ms,response_code,error) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,checked_at AS "checkedAt"`,[monitor.tenant_id,monitor.id,result.status,result.latencyMs,result.responseCode,result.error]);
      await client.query(`UPDATE synthetic_monitors SET last_status=$3,last_latency_ms=$4,last_response_code=$5,last_error=$6,last_checked_at=now(),updated_at=now() WHERE tenant_id=$1 AND id=$2`,[monitor.tenant_id,monitor.id,result.status,result.latencyMs,result.responseCode,result.error]);
      await client.query('COMMIT');return {monitorId:monitor.id,monitorName:monitor.name,...result,checkedAt:saved.rows[0].checkedAt};
    }catch(e){await client.query('ROLLBACK').catch(()=>undefined);throw e;}finally{client.release();}
  }
}
