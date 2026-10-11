import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditService } from '../audit/audit.service';
import { CreateIntegrationDto, CreateWorkflowDto } from './workflows.dto';

type Step = { type: 'CONDITION'|'APPROVAL'|'EMIT_WEBHOOK'|'WAIT'|'LOG'; [key: string]: unknown };
type WorkflowRow = { id:string; tenant_id:string; steps:Step[]; trigger_payload?:Record<string,unknown>; current_step:number; attempts:number; run_id?:string };

@Injectable()
export class WorkflowsService {
  constructor(@Inject(PG_POOL) private readonly db:Pool, private readonly audit:AuditService) {}

  private validateSteps(raw:unknown[]):Step[] {
    if(!Array.isArray(raw)||raw.length<1||raw.length>30) throw new BadRequestException('Workflow must contain 1–30 steps');
    return raw.map((item,index)=>{
      if(!item||typeof item!=='object'||Array.isArray(item)) throw new BadRequestException(`Step ${index+1} must be an object`);
      const s=item as Record<string,unknown>; const type=String(s.type??'').toUpperCase();
      if(type==='CONDITION'){
        const path=String(s.path??''); const op=String(s.op??'');
        if(!/^[A-Za-z0-9_.-]{1,120}$/.test(path)||path.split('.').some(p=>['__proto__','prototype','constructor'].includes(p))) throw new BadRequestException('Condition path is invalid');
        if(!['eq','neq','gt','gte','lt','lte','exists','contains'].includes(op)) throw new BadRequestException('Condition operator is unsupported');
        if(op!=='exists'&&!Object.prototype.hasOwnProperty.call(s,'value')) throw new BadRequestException('Condition value is required');
        return {type:'CONDITION',path,op,value:s.value};
      }
      if(type==='APPROVAL'){
        const title=String(s.title??'').trim();
        if(title.length<3||title.length>180) throw new BadRequestException('APPROVAL requires a title of 3–180 characters');
        return {type:'APPROVAL',title,details:s.details&&typeof s.details==='object'&&!Array.isArray(s.details)?s.details:{}};
      }
      if(type==='EMIT_WEBHOOK'){
        const eventType=String(s.eventType??'').trim().toUpperCase();
        if(!/^[A-Z][A-Z0-9_.-]{1,119}$/.test(eventType)) throw new BadRequestException('EMIT_WEBHOOK requires a valid eventType');
        const payload=s.payload&&typeof s.payload==='object'&&!Array.isArray(s.payload)?s.payload:{};
        return {type:'EMIT_WEBHOOK',eventType,payload};
      }
      if(type==='WAIT'){
        const seconds=Number(s.seconds);
        if(!Number.isInteger(seconds)||seconds<1||seconds>86400) throw new BadRequestException('WAIT seconds must be between 1 and 86400');
        return {type:'WAIT',seconds};
      }
      if(type==='LOG'){
        const message=String(s.message??'').trim();
        if(message.length<1||message.length>500) throw new BadRequestException('LOG message must be 1–500 characters');
        return {type:'LOG',message};
      }
      throw new BadRequestException('Allowed workflow steps: CONDITION, APPROVAL, EMIT_WEBHOOK, WAIT, LOG');
    });
  }

  async list(tenantId:string) {
    const r=await this.db.query(`SELECT id,name,description,trigger_type AS "triggerType",trigger_config AS "triggerConfig",steps,enabled,next_run_at AS "nextRunAt",created_at AS "createdAt",updated_at AS "updatedAt" FROM automation_workflows WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 500`,[tenantId]);
    return {data:r.rows};
  }

  async create(tenantId:string,actorId:string,d:CreateWorkflowDto) {
    const steps=this.validateSteps(d.steps);
    const config=d.triggerConfig??{};
    if(d.triggerType==='EVENT'&& !/^[A-Z][A-Z0-9_.-]{1,119}$/.test(String(config.eventType??''))) throw new BadRequestException('EVENT trigger requires triggerConfig.eventType');
    if(d.triggerType==='SCHEDULE'){
      const interval=Number(config.intervalSeconds);
      if(!Number.isInteger(interval)||interval<60||interval>86400) throw new BadRequestException('SCHEDULE intervalSeconds must be 60–86400');
    }
    if(d.triggerType==='WEBHOOK'&&Object.keys(config).length) throw new BadRequestException('WEBHOOK trigger configuration is managed by Jaslyn Net');
    const rawToken=d.triggerType==='WEBHOOK'?randomBytes(32).toString('base64url'):null;
    const tokenHash=rawToken?createHash('sha256').update(rawToken).digest('hex'):null;
    try {
      const r=await this.db.query(`INSERT INTO automation_workflows(tenant_id,name,description,trigger_type,trigger_config,steps,enabled,webhook_token_hash,next_run_at,created_by,updated_by)
        VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,CASE WHEN $4='SCHEDULE' AND $7 THEN now()+make_interval(secs=>$9::int) ELSE NULL END,$10,$10)
        RETURNING id,name,description,trigger_type AS "triggerType",trigger_config AS "triggerConfig",steps,enabled,next_run_at AS "nextRunAt",created_at AS "createdAt"`,
        [tenantId,d.name.trim(),(d.description??'').trim(),d.triggerType,JSON.stringify(config),JSON.stringify(steps),d.enabled===true,tokenHash,d.triggerType==='SCHEDULE'?Number(config.intervalSeconds):null,actorId]);
      await this.audit.record(tenantId,'CREATE','automation_workflow',r.rows[0].id,{name:d.name,triggerType:d.triggerType,enabled:d.enabled===true},{userId:actorId});
      return {...r.rows[0],...(rawToken?{webhookToken:rawToken,webhookPath:`/api/v1/automation/workflows/${r.rows[0].id}/webhook`}:{})};
    } catch(e:unknown) {
      if(typeof e==='object'&&e!==null&&'code'in e&&(e as {code?:string}).code==='23505') throw new ConflictException('Workflow name already exists in this tenant');
      throw e;
    }
  }

  async setEnabled(tenantId:string,actorId:string,id:string,enabled:boolean) {
    const r=await this.db.query(`UPDATE automation_workflows SET enabled=$3,updated_by=$4,updated_at=now(),next_run_at=CASE WHEN $3 AND trigger_type='SCHEDULE' THEN now()+make_interval(secs=>COALESCE(NULLIF(trigger_config->>'intervalSeconds','')::int,3600)) ELSE NULL END WHERE tenant_id=$1 AND id=$2 RETURNING id,name,enabled,next_run_at AS "nextRunAt"`,[tenantId,id,enabled,actorId]);
    if(!r.rowCount) throw new NotFoundException('Workflow not found');
    await this.audit.record(tenantId,enabled?'ENABLE':'DISABLE','automation_workflow',id,{name:r.rows[0].name},{userId:actorId});
    return r.rows[0];
  }

  async triggerManual(tenantId:string,actorId:string,id:string,payload:Record<string,unknown>={},key?:string) {
    const w=await this.db.query('SELECT id,enabled,trigger_type FROM automation_workflows WHERE tenant_id=$1 AND id=$2',[tenantId,id]);
    if(!w.rowCount) throw new NotFoundException('Workflow not found');
    if(!w.rows[0].enabled) throw new ConflictException('Enable this workflow before running it');
    if(!['MANUAL','EVENT','SCHEDULE','WEBHOOK'].includes(w.rows[0].trigger_type)) throw new BadRequestException('Unsupported workflow trigger');
    const run=await this.enqueue(tenantId,id,'MANUAL',key??`manual:${randomBytes(16).toString('hex')}`,payload);
    await this.audit.record(tenantId,'TRIGGER','automation_workflow',id,{runId:run.id},{userId:actorId});
    return run;
  }

  async triggerWebhook(id:string,token:string,payload:Record<string,unknown>) {
    const found=await this.db.query('SELECT id,tenant_id,webhook_token_hash FROM automation_workflows WHERE id=$1 AND trigger_type=\'WEBHOOK\' AND enabled=true',[id]);
    if(!found.rowCount||!token||!found.rows[0].webhook_token_hash) throw new NotFoundException('Webhook workflow not found');
    const actual=createHash('sha256').update(token).digest(); const expected=Buffer.from(found.rows[0].webhook_token_hash,'hex');
    if(actual.length!==expected.length||!timingSafeEqual(actual,expected)) throw new ForbiddenException('Invalid workflow webhook token');
    const eventId=typeof payload.eventId==='string'?payload.eventId:randomBytes(16).toString('hex');
    return this.enqueue(found.rows[0].tenant_id,id,'WEBHOOK',`webhook:${eventId}`,payload);
  }

  private async enqueue(tenantId:string,workflowId:string,triggerType:string,key:string,payload:Record<string,unknown>) {
    const r=await this.db.query(`INSERT INTO automation_workflow_runs(tenant_id,workflow_id,idempotency_key,trigger_type,trigger_payload)
      VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(tenant_id,workflow_id,idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key
      RETURNING id,status,workflow_id AS "workflowId",created_at AS "createdAt"`,[tenantId,workflowId,key,triggerType,JSON.stringify(payload)]);
    return r.rows[0];
  }

  async listRuns(tenantId:string) {
    const r=await this.db.query(`SELECT id,workflow_id AS "workflowId",idempotency_key AS "idempotencyKey",trigger_type AS "triggerType",status,current_step AS "currentStep",step_results AS "stepResults",attempts,last_error AS "lastError",started_at AS "startedAt",completed_at AS "completedAt",created_at AS "createdAt" FROM automation_workflow_runs WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 500`,[tenantId]);
    return {data:r.rows};
  }

  async listApprovals(tenantId:string) {
    const r=await this.db.query(`SELECT id,run_id AS "runId",step_index AS "stepIndex",title,details,status,requested_at AS "requestedAt",decided_at AS "decidedAt",decision_note AS "decisionNote" FROM automation_workflow_approvals WHERE tenant_id=$1 ORDER BY requested_at DESC LIMIT 500`,[tenantId]);
    return {data:r.rows};
  }

  async decideApproval(tenantId:string,actorId:string,id:string,decision:'APPROVED'|'REJECTED',note:string) {
    const client=await this.db.connect();
    try {
      await client.query('BEGIN');
      const a=await client.query(`UPDATE automation_workflow_approvals SET status=$3,decided_at=now(),decided_by=$4,decision_note=$5 WHERE tenant_id=$1 AND id=$2 AND status='PENDING' RETURNING run_id,step_index`,[tenantId,id,decision,actorId,note.trim()]);
      if(!a.rowCount) throw new NotFoundException('Pending workflow approval not found');
      await client.query(`UPDATE automation_workflow_runs SET status=$3,current_step=CASE WHEN $3='QUEUED' THEN current_step+1 ELSE current_step END,next_attempt_at=now(),locked_at=NULL,last_error=NULL WHERE tenant_id=$1 AND id=$2 AND status='WAITING_APPROVAL'`,[tenantId,a.rows[0].run_id,decision==='APPROVED'?'QUEUED':'CANCELLED']);
      await client.query('COMMIT');
      await this.audit.record(tenantId,decision,'automation_workflow_approval',id,{runId:a.rows[0].run_id,note:note.trim()},{userId:actorId});
      return {id,status:decision};
    } catch(e) { await client.query('ROLLBACK').catch(()=>undefined); throw e; }
    finally { client.release(); }
  }

  async listIntegrations(tenantId:string) {
    const r=await this.db.query(`SELECT id,name,provider_type AS "providerType",base_url AS "baseUrl",secret_ref AS "secretRef",config,enabled,created_at AS "createdAt",updated_at AS "updatedAt" FROM automation_integrations WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 500`,[tenantId]);
    return {data:r.rows};
  }

  async createIntegration(tenantId:string,actorId:string,d:CreateIntegrationDto) {
    let url:string|null=null;
    if(d.baseUrl){
      try { const parsed=new URL(d.baseUrl); if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.hostname==='localhost'||parsed.hostname.endsWith('.local')) throw new Error('unsafe'); url=parsed.toString(); }
      catch { throw new BadRequestException('Integration baseUrl must be a valid HTTPS URL without embedded credentials or local hostnames'); }
    }
    if(['WEBHOOK','REST_API'].includes(d.providerType)&&!url) throw new BadRequestException('This integration type requires an HTTPS baseUrl');
    if(d.secretRef&&!/^[0-9a-f-]{36}$/i.test(d.secretRef)) throw new BadRequestException('secretRef must reference a credential in the tenant secrets vault');
    const r=await this.db.query(`INSERT INTO automation_integrations(tenant_id,name,provider_type,base_url,secret_ref,config,enabled,created_by,updated_by)
      VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$8)
      RETURNING id,name,provider_type AS "providerType",base_url AS "baseUrl",secret_ref AS "secretRef",config,enabled,created_at AS "createdAt"`,
      [tenantId,d.name.trim(),d.providerType,url,d.secretRef??null,JSON.stringify(d.config??{}),d.enabled===true,actorId]);
    await this.audit.record(tenantId,'CREATE','automation_integration',r.rows[0].id,{name:d.name,providerType:d.providerType,enabled:d.enabled===true},{userId:actorId});
    return r.rows[0];
  }

  private valueAt(payload:Record<string,unknown>,path:string) {
    let v:unknown=payload;
    for(const part of path.split('.')) { if(!v||typeof v!=='object'||Array.isArray(v)||!Object.prototype.hasOwnProperty.call(v,part)) return {exists:false,value:undefined}; v=(v as Record<string,unknown>)[part]; }
    return {exists:true,value:v};
  }
  private condition(payload:Record<string,unknown>,step:Step) {
    const actual=this.valueAt(payload,String(step.path));
    switch(step.op){
      case 'exists':return actual.exists===(step.value!==false);
      case 'eq':return actual.exists&&JSON.stringify(actual.value)===JSON.stringify(step.value);
      case 'neq':return !actual.exists||JSON.stringify(actual.value)!==JSON.stringify(step.value);
      case 'gt':return actual.exists&&Number(actual.value)>Number(step.value);
      case 'gte':return actual.exists&&Number(actual.value)>=Number(step.value);
      case 'lt':return actual.exists&&Number(actual.value)<Number(step.value);
      case 'lte':return actual.exists&&Number(actual.value)<=Number(step.value);
      case 'contains':return actual.exists&&(Array.isArray(actual.value)?actual.value.some(v=>JSON.stringify(v)===JSON.stringify(step.value)):typeof actual.value==='string'&&actual.value.includes(String(step.value)));
      default:return false;
    }
  }

  async scheduleAndCollect() {
    const due=await this.db.query(`WITH due AS (
      SELECT id,tenant_id,trigger_config FROM automation_workflows WHERE enabled=true AND trigger_type='SCHEDULE' AND next_run_at<=now()
      ORDER BY next_run_at FOR UPDATE SKIP LOCKED LIMIT 100
    ), advanced AS (
      UPDATE automation_workflows w SET next_run_at=now()+make_interval(secs=>COALESCE(NULLIF(due.trigger_config->>'intervalSeconds','')::int,3600)),updated_at=now()
      FROM due WHERE w.id=due.id RETURNING w.id,w.tenant_id,w.trigger_config
    ) SELECT * FROM advanced`);
    for(const w of due.rows) await this.enqueue(w.tenant_id,w.id,'SCHEDULE',`schedule:${new Date().toISOString().slice(0,16)}`,{scheduledAt:new Date().toISOString(),triggerType:'SCHEDULE'});
    const events=await this.db.query(`SELECT e.id,e.tenant_id,e.event_type,e.payload,r.id AS workflow_id
      FROM communication_domain_events e JOIN automation_workflows r ON r.tenant_id=e.tenant_id AND r.enabled=true AND r.trigger_type='EVENT'
        AND r.trigger_config->>'eventType'=e.event_type
      WHERE e.status='PROCESSED' AND e.created_at>=now()-interval '10 minutes'
      ORDER BY e.created_at DESC LIMIT 500`);
    for(const e of events.rows) await this.enqueue(e.tenant_id,e.workflow_id,'EVENT',`event:${e.id}`,{...(e.payload??{}),eventId:e.id,eventType:e.event_type});
    return {scheduled:due.rowCount??0,events:events.rowCount??0};
  }

  async processQueued() {
    const claimed=await this.db.query<WorkflowRow>(`WITH due AS (
      SELECT id FROM automation_workflow_runs WHERE (status='QUEUED' AND next_attempt_at<=now())
        OR (status='RUNNING' AND locked_at<now()-interval '10 minutes' AND attempts<8)
      ORDER BY next_attempt_at,created_at FOR UPDATE SKIP LOCKED LIMIT 25
    ) UPDATE automation_workflow_runs r SET status='RUNNING',attempts=r.attempts+1,locked_at=now(),started_at=COALESCE(r.started_at,now())
      FROM due WHERE r.id=due.id RETURNING r.id AS run_id,r.tenant_id,r.workflow_id AS id,r.current_step,r.attempts,r.trigger_payload`);
    for(const run of claimed.rows) {
      try {
        const w=await this.db.query('SELECT steps FROM automation_workflows WHERE tenant_id=$1 AND id=$2 AND enabled=true',[run.tenant_id,run.id]);
        if(!w.rowCount) { await this.finish(run.tenant_id,run.run_id,'CANCELLED',run.current_step,[],'WORKFLOW_DISABLED_OR_MISSING'); continue; }
        const steps=this.validateSteps(w.rows[0].steps);
        const payload=run.trigger_payload??{}; const results:Record<string,unknown>[]=[];
        let index=run.current_step; let waiting=false; let completed=false;
        while(index<steps.length) {
          const step=steps[index];
          if(step.type==='CONDITION') {
            const matched=this.condition(payload,step); results.push({index,type:step.type,matched});
            if(!matched) { completed=true; index=steps.length; break; }
          } else if(step.type==='APPROVAL') {
            const a=await this.db.query(`INSERT INTO automation_workflow_approvals(tenant_id,run_id,step_index,title,details) VALUES($1,$2,$3,$4,$5::jsonb)
              ON CONFLICT(tenant_id,run_id,step_index) DO UPDATE SET run_id=EXCLUDED.run_id RETURNING id,status`,
              [run.tenant_id,run.run_id,index,String(step.title),JSON.stringify(step.details??{})]);
            if(a.rows[0].status==='REJECTED') { await this.finish(run.tenant_id,run.run_id,'CANCELLED',index,results,'APPROVAL_REJECTED'); waiting=true; break; }
            if(a.rows[0].status==='PENDING') {
              await this.db.query(`UPDATE automation_workflow_runs SET status='WAITING_APPROVAL',current_step=$3,step_results=step_results||$4::jsonb,locked_at=NULL WHERE tenant_id=$1 AND id=$2`,[run.tenant_id,run.run_id,index,JSON.stringify(results)]);
              waiting=true; break;
            }
            results.push({index,type:step.type,status:'APPROVED',approvalId:a.rows[0].id});
          } else if(step.type==='WAIT') {
            index++;
            await this.db.query(`UPDATE automation_workflow_runs SET status='QUEUED',current_step=$3,next_attempt_at=now()+make_interval(secs=>$4::int),step_results=step_results||$5::jsonb,locked_at=NULL WHERE tenant_id=$1 AND id=$2`,[run.tenant_id,run.run_id,index,Number(step.seconds),JSON.stringify([{index:index-1,type:step.type,seconds:step.seconds,status:'WAITING'}])]);
            waiting=true; break;
          } else if(step.type==='EMIT_WEBHOOK') {
            const emitted=await this.db.query(`INSERT INTO webhook_delivery_outbox(tenant_id,endpoint_id,event_id,event_type,payload)
              SELECT e.tenant_id,e.id,gen_random_uuid(),$2,jsonb_build_object('workflowId',$3,'runId',$4,'triggerPayload',$5::jsonb,'data',$6::jsonb)
              FROM tenant_webhook_endpoints e WHERE e.tenant_id=$1 AND e.enabled=true AND $2=ANY(e.event_types)`,
              [run.tenant_id,step.eventType,run.id,run.run_id,JSON.stringify(payload),JSON.stringify(step.payload??{})]);
            results.push({index,type:step.type,status:'QUEUED',deliveries:emitted.rowCount??0,eventType:step.eventType});
          } else if(step.type==='LOG') results.push({index,type:step.type,message:step.message});
          index++;
        }
        if(!waiting) await this.finish(run.tenant_id,run.run_id,'SUCCEEDED',index,results,completed?'CONDITION_NOT_MET':null);
      } catch(e) {
        const msg=e instanceof Error?e.message:'WORKFLOW_EXECUTION_FAILED';
        const terminal=run.attempts>=8;
        await this.db.query(`UPDATE automation_workflow_runs SET status=$3,last_error=$4,next_attempt_at=now()+make_interval(secs=>$5::int),locked_at=NULL,completed_at=CASE WHEN $3='FAILED' THEN now() ELSE NULL END
          WHERE tenant_id=$1 AND id=$2`,[run.tenant_id,run.run_id,terminal?'FAILED':'QUEUED',msg.slice(0,1000),Math.min(3600,15*Math.pow(2,Math.min(run.attempts-1,8)))]);
      }
    }
    return {claimed:claimed.rowCount??0};
  }

  private async finish(tenantId:string,runId:string,status:string,index:number,results:Record<string,unknown>[],error:string|null) {
    await this.db.query(`UPDATE automation_workflow_runs SET status=$3,current_step=$4,step_results=step_results||$5::jsonb,last_error=$6,completed_at=now(),locked_at=NULL WHERE tenant_id=$1 AND id=$2`,[tenantId,runId,status,index,JSON.stringify(results),error]);
  }
}
