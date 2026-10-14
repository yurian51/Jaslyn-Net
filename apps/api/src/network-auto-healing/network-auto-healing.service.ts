import { ConflictException, Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditContext, AuditService } from '../audit/audit.service';
import { UpdateNetworkAutoHealingPolicyDto } from './network-auto-healing.dto';

type Candidate={tenant_id:string;id:string;attempts:number;command_type:'BANDWIDTH_ENFORCEMENT'|'DISCONNECT_SESSION';router_id:string|null;actor:string|null;provider:string|null};

@Injectable()
export class NetworkAutoHealingService implements OnModuleInit,OnModuleDestroy {
  private readonly logger=new Logger(NetworkAutoHealingService.name);
  private timer?:NodeJS.Timeout;
  private running=false;
  constructor(@Inject(PG_POOL) private readonly db:Pool,private readonly audit:AuditService){}

  onModuleInit(){this.timer=setInterval(()=>void this.runDueRetries(),15000);this.timer.unref?.();void this.runDueRetries();}
  onModuleDestroy(){if(this.timer)clearInterval(this.timer);}

  async getPolicy(tenantId:string){
    await this.db.query('INSERT INTO network_auto_heal_policies(tenant_id) VALUES($1) ON CONFLICT(tenant_id) DO NOTHING',[tenantId]);
    const r=await this.db.query('SELECT enabled,"max_auto_retries" AS "maxAutoRetries",cooldown_seconds AS "cooldownSeconds",updated_at AS "updatedAt" FROM network_auto_heal_policies WHERE tenant_id=$1',[tenantId]);
    return r.rows[0];
  }

  async updatePolicy(tenantId:string,actorId:string,d:UpdateNetworkAutoHealingPolicyDto,context:AuditContext={}){
    if(!Number.isInteger(d.maxAutoRetries)||d.maxAutoRetries<1||d.maxAutoRetries>3)throw new ConflictException('Auto-healing retries must be between 1 and 3');
    if(!Number.isInteger(d.cooldownSeconds)||d.cooldownSeconds<30||d.cooldownSeconds>3600)throw new ConflictException('Auto-healing cooldown must be between 30 and 3600 seconds');
    const r=await this.db.query(`INSERT INTO network_auto_heal_policies(tenant_id,enabled,max_auto_retries,cooldown_seconds,updated_by)
      VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(tenant_id) DO UPDATE SET enabled=EXCLUDED.enabled,max_auto_retries=EXCLUDED.max_auto_retries,
        cooldown_seconds=EXCLUDED.cooldown_seconds,updated_by=EXCLUDED.updated_by,updated_at=now()
      RETURNING enabled,max_auto_retries AS "maxAutoRetries",cooldown_seconds AS "cooldownSeconds",updated_at AS "updatedAt"`,
      [tenantId,d.enabled,d.maxAutoRetries,d.cooldownSeconds,actorId]);
    await this.audit.record(tenantId,'NETWORK_AUTO_HEAL_POLICY_UPDATED','network_auto_heal_policy',tenantId,
      {enabled:d.enabled,maxAutoRetries:d.maxAutoRetries,cooldownSeconds:d.cooldownSeconds},{...context,userId:actorId});
    return r.rows[0];
  }

  async listRuns(tenantId:string){
    const r=await this.db.query(`SELECT h.id,h.command_id AS "commandId",h.command_type AS "commandType",
      h.failed_attempt_number AS "failedAttemptNumber",
      CASE WHEN c.status='VERIFIED' THEN 'VERIFIED' WHEN c.status='FAILED' THEN 'FAILED' ELSE h.status END AS status,
      c.status AS "networkCommandStatus",c.router_id AS "routerId",CASE WHEN c.error IS NULL THEN NULL ELSE 'Command failed; inspect protected command details.' END AS "lastError",
      h.reason,h.created_at AS "createdAt",h.completed_at AS "completedAt"
      FROM network_auto_heal_runs h JOIN network_commands c ON c.id=h.command_id
      WHERE h.tenant_id=$1 ORDER BY h.created_at DESC LIMIT 300`,[tenantId]);
    return {data:r.rows};
  }

  async runDueRetries():Promise<{claimed:number;requeued:number;skipped:number}>{
    if(this.running)return {claimed:0,requeued:0,skipped:0};
    this.running=true;let claimed=0,requeued=0,skipped=0;
    try{
      const client=await this.db.connect();
      const auditEvents:{tenantId:string;commandId:string;attempt:number;status:string;routerId:string|null;commandType:string}[]=[];
      try{
        await client.query('BEGIN');
        await client.query(`UPDATE network_auto_heal_runs SET status='FAILED',reason='Recovered stale auto-healing lock',completed_at=now()
          WHERE status='PROCESSING' AND created_at<now()-interval '5 minutes'`);
        const candidates=await client.query<Candidate>(`SELECT c.tenant_id,c.id,c.attempts,c.command_type,c.router_id,c.actor,c.provider
          FROM network_commands c JOIN network_auto_heal_policies p ON p.tenant_id=c.tenant_id
          WHERE p.enabled=true AND c.status='FAILED'
            AND c.command_type IN ('BANDWIDTH_ENFORCEMENT','DISCONNECT_SESSION')
            AND c.attempts BETWEEN 1 AND p.max_auto_retries
            AND c.updated_at<=now()-(p.cooldown_seconds*interval '1 second')
          ORDER BY c.updated_at FOR UPDATE OF c SKIP LOCKED LIMIT 25`);
        for(const c of candidates.rows){
          const existing=await client.query(`SELECT id,status FROM network_auto_heal_runs
            WHERE tenant_id=$1 AND command_id=$2 AND failed_attempt_number=$3 FOR UPDATE`,[c.tenant_id,c.id,c.attempts]);
          let runId:string;
          if(existing.rowCount){
            const row=existing.rows[0];
            if(row.status!=='FAILED'&&row.status!=='SKIPPED'){skipped++;continue;}
            const reset=await client.query(`UPDATE network_auto_heal_runs SET status='PROCESSING',reason=NULL,completed_at=NULL
              WHERE tenant_id=$1 AND command_id=$2 AND failed_attempt_number=$3 AND status IN ('FAILED','SKIPPED') RETURNING id`,[c.tenant_id,c.id,c.attempts]);
            if(!reset.rowCount){skipped++;continue;}runId=reset.rows[0].id;
          }else{
            const inserted=await client.query(`INSERT INTO network_auto_heal_runs(tenant_id,command_id,failed_attempt_number,command_type,status)
              VALUES($1,$2,$3,$4,'PROCESSING') ON CONFLICT(tenant_id,command_id,failed_attempt_number) DO NOTHING RETURNING id`,[c.tenant_id,c.id,c.attempts,c.command_type]);
            if(!inserted.rowCount){skipped++;continue;}runId=inserted.rows[0].id;
          }
          claimed++;
          const changed=await client.query(`UPDATE network_commands SET status='RETRYING',error=NULL,response=NULL,verification=NULL,
            sent_at=NULL,completed_at=NULL,verified_at=NULL,updated_at=now()
            WHERE tenant_id=$1 AND id=$2 AND status='FAILED' AND attempts=$3 RETURNING id`,[c.tenant_id,c.id,c.attempts]);
          if(changed.rowCount){
            await client.query(`UPDATE network_auto_heal_runs SET status='REQUEUED',reason='Bounded retry queued through network command worker'
              WHERE id=$1`,[runId]);
            requeued++;auditEvents.push({tenantId:c.tenant_id,commandId:c.id,attempt:c.attempts,status:'REQUEUED',routerId:c.router_id,commandType:c.command_type});
          }else{
            await client.query(`UPDATE network_auto_heal_runs SET status='SKIPPED',reason='Command state changed before retry',completed_at=now() WHERE id=$1`,[runId]);
            skipped++;
          }
        }
        await client.query('COMMIT');
      }catch(error){await client.query('ROLLBACK').catch(()=>undefined);throw error;}
      finally{client.release();}
      for(const event of auditEvents){
        await this.audit.record(event.tenantId,'NETWORK_AUTO_HEAL_RETRY_QUEUED','network_command',event.commandId,
          {attempt:event.attempt,commandType:event.commandType,routerId:event.routerId,status:event.status});
      }
      return {claimed,requeued,skipped};
    }catch(error){this.logger.error('Network auto-healing cycle failed',error instanceof Error?error.stack:undefined);return {claimed,requeued,skipped};}
    finally{this.running=false;}
  }
}
