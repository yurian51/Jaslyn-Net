import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import { lookup as dnsLookup, type LookupFunction } from 'node:dns';
import { lookup as lookupAddress } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditService } from '../audit/audit.service';
import { NotificationsService, SmsCategory } from '../notifications/notifications.service';
import { SecretsVaultService } from '../secrets-vault/secrets-vault.service';
import { CreateIntegrationDto, CreateWorkflowDto } from './workflows.dto';

type Step = { type: 'CONDITION'|'TRANSFORM'|'NOTIFY'|'HTTP_REQUEST'|'APPROVAL'|'EMIT_WEBHOOK'|'WAIT'|'LOG'|'CREATE_ALERT'; [key: string]: unknown };
type WorkflowRow = { id:string; tenant_id:string; trigger_payload?:Record<string,unknown>; steps_snapshot?:unknown[]; current_step:number; attempts:number; run_id:string };

@Injectable()
export class WorkflowsService {
  constructor(@Inject(PG_POOL) private readonly db:Pool, private readonly audit:AuditService, private readonly notifications:NotificationsService, private readonly secrets:SecretsVaultService) {}

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
        const onFalse=String(s.onFalse??'STOP').toUpperCase();
        if(!['STOP','SKIP'].includes(onFalse)) throw new BadRequestException('Condition onFalse must be STOP or SKIP');
        const skipSteps=Number(s.skipSteps??1);
        if(onFalse==='SKIP'&&(!Number.isInteger(skipSteps)||skipSteps<1||skipSteps>29)) throw new BadRequestException('Condition skipSteps must be 1–29 when onFalse is SKIP');
        return {type:'CONDITION',path,op,value:s.value,onFalse,skipSteps};
      }
      if(type==='TRANSFORM'){
        const mappings=s.mappings;
        if(!Array.isArray(mappings)||mappings.length<1||mappings.length>30) throw new BadRequestException('TRANSFORM requires 1–30 field mappings');
        const safePath=(raw:unknown,label:string)=>{const path=String(raw??'');if(!/^[A-Za-z0-9_-]{1,80}(\.[A-Za-z0-9_-]{1,80})*$/.test(path)||path.split('.').some(p=>['__proto__','prototype','constructor'].includes(p)))throw new BadRequestException(`TRANSFORM ${label} path is invalid`);return path;};
        const normalized=mappings.map((raw)=>{if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new BadRequestException('Each TRANSFORM mapping must be an object');const m=raw as Record<string,unknown>;return {from:safePath(m.from,'source'),to:safePath(m.to,'target')};});
        return {type:'TRANSFORM',mappings:normalized};
      }
      if(type==='HTTP_REQUEST'){
        const integrationId=String(s.integrationId??'');
        if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(integrationId)) throw new BadRequestException('HTTP_REQUEST requires an integration UUID');
        const method=String(s.method??'GET').toUpperCase();
        if(!['GET','POST','PUT','PATCH','DELETE'].includes(method)) throw new BadRequestException('HTTP_REQUEST method is unsupported');
        const path=String(s.path??'');
        if(!path.startsWith('/')||path.startsWith('//')||path.split(/[?#]/,1)[0].split('/').some(part=>part==='..')) throw new BadRequestException('HTTP_REQUEST path must be a safe relative path beginning with /');
        const body=s.body===undefined?{}:s.body;
        if(!body||typeof body!=='object'||Array.isArray(body)||JSON.stringify(body).length>16384) throw new BadRequestException('HTTP_REQUEST body must be a JSON object no larger than 16 KB');
        const outputKey=String(s.outputKey??'');
        if(outputKey&&!/^[A-Za-z0-9_-]{1,80}$/.test(outputKey)) throw new BadRequestException('HTTP_REQUEST outputKey is invalid');
        return {type:'HTTP_REQUEST',integrationId,method,path,body,outputKey};
      }
      if(type==='NOTIFY'){
        const channel=String(s.channel??'').toUpperCase();
        if(!['SMS','EMAIL','WHATSAPP','WEBHOOK'].includes(channel)) throw new BadRequestException('NOTIFY channel is unsupported');
        const recipientPath=String(s.recipientPath??'');
        if(!/^[A-Za-z0-9_-]{1,80}(\.[A-Za-z0-9_-]{1,80})*$/.test(recipientPath)||recipientPath.split('.').some(p=>['__proto__','prototype','constructor'].includes(p))) throw new BadRequestException('NOTIFY recipientPath is invalid');
        const eventType=String(s.eventType??'WORKFLOW.NOTIFICATION').trim().toUpperCase();
        if(!/^[A-Z][A-Z0-9_.-]{1,119}$/.test(eventType)) throw new BadRequestException('NOTIFY eventType is invalid');
        const message=String(s.message??'').trim();
        if(!message||message.length>1600) throw new BadRequestException('NOTIFY message must be 1–1600 characters');
        const category=String(s.category??'TRANSACTIONAL').toUpperCase();
        if(!['TRANSACTIONAL','EXPIRY','PAYMENT','PURCHASE','MARKETING'].includes(category)) throw new BadRequestException('NOTIFY SMS category is unsupported');
        return {type:'NOTIFY',channel,recipientPath,eventType,message,category};
      }
      if(type==='CREATE_ALERT'){
        const severity=String(s.severity??'HIGH').toUpperCase(); const title=String(s.title??'').trim();
        if(!['CRITICAL','HIGH','MEDIUM','LOW','INFO'].includes(severity)||title.length<3||title.length>180) throw new BadRequestException('CREATE_ALERT requires a valid severity and 3–180 character title');
        return {type:'CREATE_ALERT',severity,title,details:s.details&&typeof s.details==='object'&&!Array.isArray(s.details)?s.details:{}};
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
      throw new BadRequestException('Allowed workflow steps: CONDITION, TRANSFORM, HTTP_REQUEST, NOTIFY, CREATE_ALERT, APPROVAL, EMIT_WEBHOOK, WAIT, LOG');
    });
  }

  async list(tenantId:string) {
    const r=await this.db.query(`SELECT id,name,description,trigger_type AS "triggerType",trigger_config AS "triggerConfig",steps,enabled,version,next_run_at AS "nextRunAt",created_at AS "createdAt",updated_at AS "updatedAt" FROM automation_workflows WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 500`,[tenantId]);
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
      await this.db.query(`INSERT INTO automation_workflow_versions(tenant_id,workflow_id,version,definition,created_by)
        VALUES($1,$2,1,$3::jsonb,$4) ON CONFLICT(tenant_id,workflow_id,version) DO NOTHING`,
        [tenantId,r.rows[0].id,JSON.stringify({name:d.name.trim(),description:(d.description??'').trim(),triggerType:d.triggerType,triggerConfig:config,steps}),actorId]);
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
    const normalizedKey=key?.trim();
    if(normalizedKey!==undefined&&(!normalizedKey||normalizedKey.length>180)) throw new BadRequestException('Idempotency key must contain 1–180 characters');
    const run=await this.enqueue(tenantId,id,'MANUAL',normalizedKey??`manual:${randomBytes(16).toString('hex')}`,payload);
    await this.audit.record(tenantId,'TRIGGER','automation_workflow',id,{runId:run.id},{userId:actorId});
    return run;
  }

  async triggerWebhook(id:string,token:string,payload:Record<string,unknown>) {
    const found=await this.db.query('SELECT id,tenant_id,webhook_token_hash FROM automation_workflows WHERE id=$1 AND trigger_type=\'WEBHOOK\' AND enabled=true',[id]);
    if(!found.rowCount||!token||!found.rows[0].webhook_token_hash) throw new NotFoundException('Webhook workflow not found');
    const actual=createHash('sha256').update(token).digest(); const expected=Buffer.from(found.rows[0].webhook_token_hash,'hex');
    if(actual.length!==expected.length||!timingSafeEqual(actual,expected)) throw new ForbiddenException('Invalid workflow webhook token');
    const suppliedEventId=payload.eventId;
    if(typeof suppliedEventId==='string'&&suppliedEventId.length>180) throw new BadRequestException('Webhook eventId must not exceed 180 characters');
    const eventId=typeof suppliedEventId==='string'&&suppliedEventId.trim()?suppliedEventId.trim():randomBytes(16).toString('hex');
    return this.enqueue(found.rows[0].tenant_id,id,'WEBHOOK',`webhook:${eventId}`,payload);
  }

  private async enqueue(tenantId:string,workflowId:string,triggerType:string,key:string,payload:Record<string,unknown>) {
    const r=await this.db.query(`INSERT INTO automation_workflow_runs(tenant_id,workflow_id,idempotency_key,trigger_type,trigger_payload,steps_snapshot)
      SELECT $1,$2,$3,$4,$5::jsonb,w.steps FROM automation_workflows w WHERE w.tenant_id=$1 AND w.id=$2
      ON CONFLICT(tenant_id,workflow_id,idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key
      RETURNING id,status,workflow_id AS "workflowId",created_at AS "createdAt"`,[tenantId,workflowId,key,triggerType,JSON.stringify(payload)]);
    return r.rows[0];
  }

  async listVersions(tenantId:string,id:string) {
    const exists=await this.db.query('SELECT id FROM automation_workflows WHERE tenant_id=$1 AND id=$2',[tenantId,id]);
    if(!exists.rowCount) throw new NotFoundException('Workflow not found');
    const r=await this.db.query(`SELECT version,definition,created_by AS "createdBy",created_at AS "createdAt"
      FROM automation_workflow_versions WHERE tenant_id=$1 AND workflow_id=$2 ORDER BY version DESC LIMIT 100`,[tenantId,id]);
    return {data:r.rows};
  }

  async updateDefinition(tenantId:string,actorId:string,id:string,d:CreateWorkflowDto) {
    const steps=this.validateSteps(d.steps);
    const config=d.triggerConfig??{};
    if(d.triggerType==='EVENT'&&!/^[A-Z][A-Z0-9_.-]{1,119}$/.test(String(config.eventType??''))) throw new BadRequestException('EVENT trigger requires triggerConfig.eventType');
    if(d.triggerType==='SCHEDULE'){
      const interval=Number(config.intervalSeconds);
      if(!Number.isInteger(interval)||interval<60||interval>86400) throw new BadRequestException('SCHEDULE intervalSeconds must be 60–86400');
    }
    if(d.triggerType==='WEBHOOK'&&Object.keys(config).length) throw new BadRequestException('WEBHOOK trigger configuration is managed by Jaslyn Net');
    const client=await this.db.connect();
    let updated:Record<string,unknown>;
    try{
      await client.query('BEGIN');
      const current=await client.query('SELECT trigger_type FROM automation_workflows WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,id]);
      if(!current.rowCount) throw new NotFoundException('Workflow not found');
      if(current.rows[0].trigger_type!==d.triggerType) throw new ConflictException('Changing a workflow trigger type requires creating a new workflow');
      const result=await client.query(`UPDATE automation_workflows SET name=$3,description=$4,trigger_config=$5::jsonb,steps=$6::jsonb,version=version+1,
        updated_by=$7,updated_at=now(),next_run_at=CASE WHEN trigger_type='SCHEDULE' AND enabled THEN now()+make_interval(secs=>COALESCE(NULLIF($5::jsonb->>'intervalSeconds','')::int,3600)) ELSE NULL END
        WHERE tenant_id=$1 AND id=$2 RETURNING id,name,description,trigger_type AS "triggerType",trigger_config AS "triggerConfig",steps,enabled,version,updated_at AS "updatedAt"`,
        [tenantId,id,d.name.trim(),(d.description??'').trim(),JSON.stringify(config),JSON.stringify(steps),actorId]);
      updated=result.rows[0];
      await client.query(`INSERT INTO automation_workflow_versions(tenant_id,workflow_id,version,definition,created_by)
        VALUES($1,$2,$3,$4::jsonb,$5)`,
        [tenantId,id,updated.version,JSON.stringify({name:d.name.trim(),description:(d.description??'').trim(),triggerType:d.triggerType,triggerConfig:config,steps}),actorId]);
      await client.query('COMMIT');
    }catch(e){await client.query('ROLLBACK').catch(()=>undefined);throw e;}finally{client.release();}
    await this.audit.record(tenantId,'UPDATE_DEFINITION','automation_workflow',id,{version:updated.version,name:d.name},{userId:actorId});
    return updated;
  }

  async exportDefinition(tenantId:string,id:string) {
    const r=await this.db.query(`SELECT name,description,trigger_type AS "triggerType",trigger_config AS "triggerConfig",steps
      FROM automation_workflows WHERE tenant_id=$1 AND id=$2`,[tenantId,id]);
    if(!r.rowCount) throw new NotFoundException('Workflow not found');
    return {schemaVersion:1,kind:'jaslyn-workflow',exportedAt:new Date().toISOString(),definition:r.rows[0]};
  }

  async importDefinition(tenantId:string,actorId:string,d:CreateWorkflowDto) {
    // Imports are always disabled; operators must review and explicitly enable them.
    return this.create(tenantId,actorId,{...d,enabled:false});
  }

  async getRun(tenantId:string,id:string) {
    const r=await this.db.query(`SELECT id,workflow_id AS "workflowId",idempotency_key AS "idempotencyKey",trigger_type AS "triggerType",status,current_step AS "currentStep",step_results AS "stepResults",attempts,last_error AS "lastError",started_at AS "startedAt",completed_at AS "completedAt",created_at AS "createdAt"
      FROM automation_workflow_runs WHERE tenant_id=$1 AND id=$2`,[tenantId,id]);
    if(!r.rowCount) throw new NotFoundException('Workflow run not found');
    return r.rows[0];
  }

  async replayRun(tenantId:string,actorId:string,id:string) {
    const r=await this.db.query(`SELECT r.workflow_id,r.trigger_type,r.trigger_payload,r.status,r.current_step,w.enabled
      FROM automation_workflow_runs r JOIN automation_workflows w ON w.tenant_id=r.tenant_id AND w.id=r.workflow_id
      WHERE r.tenant_id=$1 AND r.id=$2`,[tenantId,id]);
    if(!r.rowCount) throw new NotFoundException('Workflow run not found');
    if(!r.rows[0].enabled) throw new ConflictException('Enable the workflow before replaying this run');
    // A full replay can repeat completed side effects. Until checkpoint-resume is implemented,
    // only permit replay when no step has completed and the run failed before progress.
    if(r.rows[0].status!=='FAILED'||Number(r.rows[0].current_step)!==0) throw new ConflictException('Safe replay is only available for failed runs that have not advanced beyond step zero');
    const run=await this.enqueue(tenantId,r.rows[0].workflow_id,'REPLAY',`replay:${id}:${randomBytes(12).toString('hex')}`,r.rows[0].trigger_payload??{});
    await this.audit.record(tenantId,'REPLAY','automation_workflow_run',id,{newRunId:run.id},{userId:actorId});
    return run;
  }

  async cancelRun(tenantId:string,actorId:string,id:string) {
    const r=await this.db.query(`UPDATE automation_workflow_runs SET status='CANCELLED',completed_at=now(),locked_at=NULL,last_error='CANCELLED_BY_OPERATOR'
      WHERE tenant_id=$1 AND id=$2 AND status IN ('QUEUED','WAITING_APPROVAL') RETURNING id,status`,[tenantId,id]);
    if(!r.rowCount) {
      const found=await this.db.query('SELECT status FROM automation_workflow_runs WHERE tenant_id=$1 AND id=$2',[tenantId,id]);
      if(!found.rowCount) throw new NotFoundException('Workflow run not found');
      throw new ConflictException('Only queued or approval-waiting runs can be cancelled safely');
    }
    await this.audit.record(tenantId,'CANCEL','automation_workflow_run',id,{status:r.rows[0].status},{userId:actorId});
    return r.rows[0];
  }

  async listRuns(tenantId:string) {
    const r=await this.db.query(`SELECT id,workflow_id AS "workflowId",idempotency_key AS "idempotencyKey",trigger_type AS "triggerType",status,current_step AS "currentStep",step_results AS "stepResults",attempts,last_error AS "lastError",started_at AS "startedAt",completed_at AS "completedAt",created_at AS "createdAt" FROM automation_workflow_runs WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 500`,[tenantId]);
    return {data:r.rows};
  }

  async listAlerts(tenantId:string) {
    const r=await this.db.query(`SELECT id,run_id AS "runId",step_index AS "stepIndex",severity,title,details,status,resolution_note AS "resolutionNote",created_at AS "createdAt",resolved_at AS "resolvedAt" FROM automation_workflow_alerts WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 500`,[tenantId]);
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

  async setIntegrationEnabled(tenantId:string,actorId:string,id:string,enabled:boolean) {
    const found=await this.db.query('SELECT id,name,provider_type,base_url,secret_ref FROM automation_integrations WHERE tenant_id=$1 AND id=$2',[tenantId,id]);
    if(!found.rowCount) throw new NotFoundException('Integration not found');
    const item=found.rows[0];
    if(enabled&&['WEBHOOK','REST_API'].includes(item.provider_type)&&!item.base_url) throw new BadRequestException('Configure an HTTPS base URL before enabling this integration');
    if(enabled&&['SMS','PAYMENT','NETWORK_CONTROLLER'].includes(item.provider_type)&&!item.secret_ref) throw new BadRequestException('Attach a tenant-owned secret in Secrets Vault before enabling this integration');
    const updated=await this.db.query('UPDATE automation_integrations SET enabled=$3,updated_by=$4,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,name,provider_type AS "providerType",enabled,updated_at AS "updatedAt"',[tenantId,id,enabled,actorId]);
    await this.audit.record(tenantId,enabled?'ENABLE':'DISABLE','automation_integration',id,{name:item.name,providerType:item.provider_type},{userId:actorId});
    return updated.rows[0];
  }

  async createIntegration(tenantId:string,actorId:string,d:CreateIntegrationDto) {
    let url:string|null=null;
    if(d.baseUrl){
      try { const parsed=new URL(d.baseUrl); if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.hostname==='localhost'||parsed.hostname.endsWith('.local')) throw new Error('unsafe'); url=parsed.toString(); }
      catch { throw new BadRequestException('Integration baseUrl must be a valid HTTPS URL without embedded credentials or local hostnames'); }
    }
    if(['WEBHOOK','REST_API'].includes(d.providerType)&&!url) throw new BadRequestException('This integration type requires an HTTPS baseUrl');
    if(d.secretRef){
      if(!/^[0-9a-f-]{36}$/i.test(d.secretRef)) throw new BadRequestException('secretRef must reference a credential in the tenant secrets vault');
      const secret=await this.db.query('SELECT id FROM tenant_secrets WHERE tenant_id=$1 AND id=$2',[tenantId,d.secretRef]);
      if(!secret.rowCount) throw new BadRequestException('Secret reference does not exist in this tenant');
    }
    const r=await this.db.query(`INSERT INTO automation_integrations(tenant_id,name,provider_type,base_url,secret_ref,config,enabled,created_by,updated_by)
      VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$8)
      RETURNING id,name,provider_type AS "providerType",base_url AS "baseUrl",secret_ref AS "secretRef",config,enabled,created_at AS "createdAt"`,
      [tenantId,d.name.trim(),d.providerType,url,d.secretRef??null,JSON.stringify(d.config??{}),d.enabled===true,actorId]);
    await this.audit.record(tenantId,'CREATE','automation_integration',r.rows[0].id,{name:d.name,providerType:d.providerType,enabled:d.enabled===true},{userId:actorId});
    return r.rows[0];
  }

  private isPublicAddress(address:string,family:number) {
    if(family===4){
      const parts=address.split('.').map(Number);
      if(parts.length!==4||parts.some(n=>!Number.isInteger(n)||n<0||n>255)) return false;
      const [a,b]=parts;
      if(a===0||a===10||a===127||a>=224) return false;
      if(a===100&&b>=64&&b<=127) return false;
      if(a===169&&b===254) return false;
      if(a===172&&b>=16&&b<=31) return false;
      if(a===192&&(b===0||b===168)) return false;
      if(a===198&&(b===18||b===19||b===51)) return false;
      if(a===203&&b===0) return false;
      if(a===192&&b===0) return false;
      return true;
    }
    if(family===6){
      const normalized=address.toLowerCase().split('%')[0];
      // Only global-unicast IPv6 is allowed; reject mapped, loopback, link-local,
      // unique-local, multicast, unspecified and documentation ranges.
      if(!/^[23]/.test(normalized)||normalized==='::1'||normalized==='::'||normalized.startsWith('2001:db8:')) return false;
      return !normalized.startsWith('::ffff:');
    }
    return false;
  }

  private async executeIntegrationRequest(tenantId:string,workflowId:string,runId:string,stepIndex:number,step:Step) {
    const integration=await this.db.query(`SELECT id,base_url,secret_ref FROM automation_integrations
      WHERE tenant_id=$1 AND id=$2 AND enabled=true AND provider_type='REST_API'`,[tenantId,step.integrationId]);
    if(!integration.rowCount||!integration.rows[0].base_url) throw new BadRequestException('HTTP_REQUEST requires an enabled tenant-owned REST_API integration');
    const base=new URL(integration.rows[0].base_url);
    if(base.protocol!=='https:'||base.username||base.password||isIP(base.hostname)) throw new BadRequestException('Integration URL is not an approved HTTPS hostname');
    const url=new URL(String(step.path),base);
    if(url.origin!==base.origin||url.username||url.password||url.hash) throw new BadRequestException('HTTP_REQUEST path escapes its configured integration origin');
    const records=await lookupAddress(url.hostname,{all:true,verbatim:true});
    if(!records.length||records.some(record=>!this.isPublicAddress(record.address,record.family))) throw new BadRequestException('Integration hostname resolves to a non-public address and was blocked');
    const selected=records[0];
    const pinnedLookup:LookupFunction=(_hostname,options,callback)=>{
      if(typeof options==='object'&&options!==null&&'all'in options&&options.all) callback(null,[{address:selected.address,family:selected.family}]);
      else callback(null,selected.address,selected.family);
    };
    const headers:Record<string,string>={'accept':'application/json','user-agent':'Jaslyn-Net-Workflow/1.0'};
    if(step.method!=='GET'&&step.method!=='DELETE') headers['content-type']='application/json';
    if(integration.rows[0].secret_ref){
      const secret=await this.db.query('SELECT secret_key FROM tenant_secrets WHERE tenant_id=$1 AND id=$2',[tenantId,integration.rows[0].secret_ref]);
      if(!secret.rowCount) throw new BadRequestException('Integration secret is no longer available in this tenant');
      const value=await this.secrets.getSecretValue(tenantId,secret.rows[0].secret_key);
      headers.authorization=`Bearer ${value}`;
    }
    const body=step.method==='GET'||step.method==='DELETE'?undefined:JSON.stringify(step.body??{});
    const result=await new Promise<{statusCode:number;responseBytes:number;json?:unknown}>((resolve,reject)=>{
      const request=httpsRequest(url,{method:String(step.method),headers,servername:url.hostname,lookup:pinnedLookup},response=>{
        const chunks:Buffer[]=[];let size=0;
        response.on('data',(chunk:Buffer|string)=>{
          const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=bytes.length;
          if(size>65536){request.destroy(new Error('Integration response exceeds 64 KB'));return;}
          chunks.push(bytes);
        });
        response.on('error',reject);
        response.on('end',()=>{
          const statusCode=response.statusCode??0;
          if(statusCode<200||statusCode>=300){reject(new Error(`Integration returned HTTP ${statusCode}`));return;}
          const raw=Buffer.concat(chunks).toString('utf8');
          const contentType=String(response.headers['content-type']??'').toLowerCase();
          let json:unknown=undefined;
          if(raw&&contentType.includes('application/json')){try{json=JSON.parse(raw);}catch{reject(new Error('Integration returned invalid JSON'));return;}}
          resolve({statusCode,responseBytes:size,...(json!==undefined?{json}:{})});
        });
      });
      request.setTimeout(10000,()=>request.destroy(new Error('Integration request timed out')));
      request.on('error',reject);
      if(body)request.write(body);
      request.end();
    });
    return result;
  }

  private valueAt(payload:Record<string,unknown>,path:string) {
    let v:unknown=payload;
    for(const part of path.split('.')) { if(!v||typeof v!=='object'||Array.isArray(v)||!Object.prototype.hasOwnProperty.call(v,part)) return {exists:false,value:undefined}; v=(v as Record<string,unknown>)[part]; }
    return {exists:true,value:v};
  }
  private setValueAt(payload:Record<string,unknown>,path:string,value:unknown) {
    const parts=path.split('.');
    let target:Record<string,unknown>=payload;
    for(const part of parts.slice(0,-1)){
      const current=target[part];
      if(!current||typeof current!=='object'||Array.isArray(current)) target[part]={};
      target=target[part] as Record<string,unknown>;
    }
    target[parts[parts.length-1]]=value;
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
      FROM due WHERE r.id=due.id RETURNING r.id AS run_id,r.tenant_id,r.workflow_id AS id,r.current_step,r.attempts,r.trigger_payload,r.steps_snapshot`);
    for(const run of claimed.rows) {
      try {
        const w=await this.db.query('SELECT steps FROM automation_workflows WHERE tenant_id=$1 AND id=$2 AND enabled=true',[run.tenant_id,run.id]);
        if(!w.rowCount) { await this.finish(run.tenant_id,run.run_id,'CANCELLED',run.current_step,[],'WORKFLOW_DISABLED_OR_MISSING'); continue; }
        const steps=this.validateSteps(run.steps_snapshot??w.rows[0].steps);
        const payload=run.trigger_payload??{}; const results:Record<string,unknown>[]=[];
        let index=run.current_step; let waiting=false; let completed=false;
        while(index<steps.length) {
          const step=steps[index];
          if(step.type==='TRANSFORM') {
            const changed:string[]=[];
            for(const mapping of step.mappings as Array<{from:string;to:string}>){
              const source=this.valueAt(payload,mapping.from);
              if(source.exists){this.setValueAt(payload,mapping.to,source.value);changed.push(mapping.to);}
            }
            results.push({index,type:step.type,changedFields:changed});
          } else if(step.type==='CONDITION') {
            const matched=this.condition(payload,step); results.push({index,type:step.type,matched,onFalse:step.onFalse??'STOP'});
            if(!matched) {
              if(step.onFalse==='SKIP') { index+=Number(step.skipSteps??1); }
              else { completed=true; index=steps.length; break; }
            }
          } else if(step.type==='HTTP_REQUEST') {
            const response=await this.executeIntegrationRequest(run.tenant_id,run.id,run.run_id,index,step);
            if(response.json!==undefined){
              const existing=payload.integrationResponses;
              if(!existing||typeof existing!=='object'||Array.isArray(existing)) payload.integrationResponses={};
              (payload.integrationResponses as Record<string,unknown>)[String(step.outputKey||`step${index}`)]=response.json;
            }
            results.push({index,type:step.type,statusCode:response.statusCode,responseBytes:response.responseBytes,outputKey:String(step.outputKey||`step${index}`)});
          } else if(step.type==='NOTIFY') {
            const target=this.valueAt(payload,String(step.recipientPath));
            if(!target.exists||typeof target.value!=='string'||!target.value.trim()) throw new BadRequestException('NOTIFY recipient path must resolve to a non-empty string');
            const recipient=target.value.trim();
            const dedupeKey=`workflow:${run.run_id}:${index}`;
            const notification=step.channel==='SMS'
              ? await this.notifications.enqueueSms(run.tenant_id,{recipient,message:String(step.message),category:String(step.category) as SmsCategory,idempotencyKey:dedupeKey})
              : await this.notifications.enqueue(run.tenant_id,String(step.channel) as 'EMAIL'|'WHATSAPP'|'WEBHOOK',recipient,String(step.eventType),{message:String(step.message),workflowId:run.id,runId:run.run_id,stepIndex:index},undefined,dedupeKey);
            results.push({index,type:step.type,channel:step.channel,status:notification.status,notificationId:notification.id});
          } else if(step.type==='CREATE_ALERT') {
            const alert=await this.db.query(`INSERT INTO automation_workflow_alerts(tenant_id,run_id,step_index,severity,title,details)
              VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(tenant_id,run_id,step_index) DO UPDATE SET run_id=EXCLUDED.run_id RETURNING id,status`,
              [run.tenant_id,run.run_id,index,step.severity??'HIGH',step.title,JSON.stringify(step.details??{})]);
            results.push({index,type:step.type,status:alert.rows[0].status,alertId:alert.rows[0].id,title:step.title,severity:step.severity??'HIGH'});
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
            const emitted=await this.emitWebhook(run.tenant_id,run.id,run.run_id,index,String(step.eventType),payload,step.payload??{});
            results.push({index,type:step.type,status:emitted.status,deliveries:emitted.deliveries,eventType:step.eventType});
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

  private async emitWebhook(tenantId:string,workflowId:string,runId:string,stepIndex:number,eventType:string,triggerPayload:Record<string,unknown>,data:unknown) {
    const client=await this.db.connect();
    try {
      await client.query('BEGIN');
      const receipt=await client.query(`INSERT INTO automation_workflow_action_receipts(tenant_id,run_id,step_index,status)
        VALUES($1,$2,$3,'QUEUED') ON CONFLICT(tenant_id,run_id,step_index) DO NOTHING RETURNING run_id`,[tenantId,runId,stepIndex]);
      if(!receipt.rowCount) {
        const prior=await client.query('SELECT result FROM automation_workflow_action_receipts WHERE tenant_id=$1 AND run_id=$2 AND step_index=$3',[tenantId,runId,stepIndex]);
        await client.query('COMMIT');
        return {status:'ALREADY_QUEUED',deliveries:Number(prior.rows[0]?.result?.deliveries??0)};
      }
      const emitted=await client.query(`INSERT INTO webhook_delivery_outbox(tenant_id,endpoint_id,event_id,event_type,payload)
        SELECT e.tenant_id,e.id,md5($4::text || ':' || $7::text || ':' || e.id::text)::uuid,$2,
          jsonb_build_object('workflowId',$3,'runId',$4,'triggerPayload',$5::jsonb,'data',$6::jsonb)
        FROM tenant_webhook_endpoints e WHERE e.tenant_id=$1 AND e.enabled=true AND $2=ANY(e.event_types)`,
        [tenantId,eventType,workflowId,runId,JSON.stringify(triggerPayload),JSON.stringify(data),stepIndex]);
      const deliveries=emitted.rowCount??0;
      await client.query('UPDATE automation_workflow_action_receipts SET result=$4::jsonb WHERE tenant_id=$1 AND run_id=$2 AND step_index=$3',[tenantId,runId,stepIndex,JSON.stringify({deliveries,eventType})]);
      await client.query('COMMIT');
      return {status:'QUEUED',deliveries};
    } catch(e) {
      await client.query('ROLLBACK').catch(()=>undefined);
      throw e;
    } finally { client.release(); }
  }

  private async finish(tenantId:string,runId:string,status:string,index:number,results:Record<string,unknown>[],error:string|null) {
    await this.db.query(`UPDATE automation_workflow_runs SET status=$3,current_step=$4,step_results=step_results||$5::jsonb,last_error=$6,completed_at=now(),locked_at=NULL WHERE tenant_id=$1 AND id=$2`,[tenantId,runId,status,index,JSON.stringify(results),error]);
  }
}
