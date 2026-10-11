import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditService } from '../audit/audit.service';
import { CreateAutomationRuleDto } from './automation.dto';

type Condition={path:string;op:string;value?:unknown};
type Action={type:string;severity?:string;title?:string};
type EventRecord={tenant_id:string;event_id:string;event_type:string;payload:Record<string,unknown>;attempts:number};

@Injectable()
export class AutomationService {
  constructor(@Inject(PG_POOL) private readonly db:Pool,private readonly audit:AuditService){}
  async listRules(tenantId:string){const r=await this.db.query(`SELECT id,name,event_type AS "eventType",conditions,actions,enabled,created_at AS "createdAt",updated_at AS "updatedAt" FROM automation_rules WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 500`,[tenantId]);return {data:r.rows};}
  async createRule(tenantId:string,actorId:string,d:CreateAutomationRuleDto){
    const conditions=d.conditions.map((raw):Condition=>{
      if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new BadRequestException('Each condition must be an object');
      const c=raw as Record<string,unknown>;const path=String(c.path??'');const op=String(c.op??'');
      if(!/^[A-Za-z0-9_.-]{1,120}$/.test(path)||path.split('.').some(part=>['__proto__','prototype','constructor'].includes(part)))throw new BadRequestException('Condition path is invalid');
      if(!['eq','neq','gt','gte','lt','lte','contains','exists'].includes(op))throw new BadRequestException('Condition operator is unsupported');
      if(op!=='exists'&&!Object.prototype.hasOwnProperty.call(c,'value'))throw new BadRequestException('Condition value is required');
      return {path,op,value:c.value};
    });
    const actions=d.actions.map((raw):Action=>{
      if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new BadRequestException('Each action must be an object');
      const a=raw as Record<string,unknown>;const type=String(a.type??'');
      if(type==='CREATE_ALERT'){
        const severity=String(a.severity??'HIGH').toUpperCase();const title=String(a.title??'').trim();
        if(!['CRITICAL','HIGH','MEDIUM','LOW','INFO'].includes(severity)||title.length<3||title.length>180)throw new BadRequestException('CREATE_ALERT requires a valid severity and title');
        return {type,severity,title};
      }
      if(type==='EMIT_WEBHOOK')return {type};
      throw new BadRequestException('Allowed actions are CREATE_ALERT and EMIT_WEBHOOK');
    });
    if(!actions.length)throw new BadRequestException('At least one action is required');
    try{
      const r=await this.db.query(`INSERT INTO automation_rules(tenant_id,name,event_type,conditions,actions,enabled,created_by,updated_by)
        VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$7)
        RETURNING id,name,event_type AS "eventType",conditions,actions,enabled,created_at AS "createdAt"`,
        [tenantId,d.name.trim(),d.eventType.trim().toUpperCase(),JSON.stringify(conditions),JSON.stringify(actions),d.enabled===true,actorId]);
      await this.audit.record(tenantId,'CREATE','automation_rule',r.rows[0].id,{name:d.name,eventType:d.eventType,enabled:d.enabled===true},{userId:actorId});
      return r.rows[0];
    }catch(e:unknown){if(typeof e==='object'&&e!==null&&'code'in e&&(e as {code?:string}).code==='23505')throw new ConflictException('Rule name already exists in this tenant');throw e;}
  }
  async setEnabled(tenantId:string,actorId:string,id:string,enabled:boolean){
    const r=await this.db.query(`UPDATE automation_rules SET enabled=$3,updated_by=$4,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,name,enabled`,[tenantId,id,enabled,actorId]);
    if(!r.rowCount)throw new NotFoundException('Automation rule not found');
    await this.audit.record(tenantId,enabled?'ENABLE':'DISABLE','automation_rule',id,{name:r.rows[0].name},{userId:actorId});return r.rows[0];
  }
  async listRuns(tenantId:string){const r=await this.db.query(`SELECT id,rule_id AS "ruleId",event_id AS "eventId",event_type AS "eventType",status,condition_results AS "conditionResults",action_results AS "actionResults",error_code AS "errorCode",started_at AS "startedAt",completed_at AS "completedAt" FROM automation_rule_runs WHERE tenant_id=$1 ORDER BY started_at DESC LIMIT 500`,[tenantId]);return {data:r.rows};}
  async listAlerts(tenantId:string){const r=await this.db.query(`SELECT id,rule_id AS "ruleId",event_id AS "eventId",severity,title,details,status,resolution_note AS "resolutionNote",created_at AS "createdAt",resolved_at AS "resolvedAt" FROM automation_alerts WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 500`,[tenantId]);return {data:r.rows};}
  async resolveAlert(tenantId:string,actorId:string,id:string,note:string){
    const r=await this.db.query(`UPDATE automation_alerts SET status='RESOLVED',resolved_at=now(),resolved_by=$3,resolution_note=$4 WHERE tenant_id=$1 AND id=$2 AND status IN ('OPEN','ACKNOWLEDGED') RETURNING id,status`,[tenantId,id,actorId,note.trim()]);
    if(!r.rowCount)throw new NotFoundException('Open automation alert not found');
    await this.audit.record(tenantId,'RESOLVE','automation_alert',id,{note:note.trim()},{userId:actorId});return r.rows[0];
  }
  private valueAt(payload:Record<string,unknown>,path:string):{exists:boolean;value:unknown}{
    let current:unknown=payload;
    for(const part of path.split('.')){
      if(!current||typeof current!=='object'||Array.isArray(current)||!Object.prototype.hasOwnProperty.call(current,part))return {exists:false,value:undefined};
      current=(current as Record<string,unknown>)[part];
    }
    return {exists:true,value:current};
  }
  private matches(payload:Record<string,unknown>,conditions:Condition[]):{matched:boolean;results:Record<string,unknown>[]}{
    const results=conditions.map(c=>{const actual=this.valueAt(payload,c.path);let ok=false;
      switch(c.op){
        case 'exists':ok=actual.exists===(c.value!==false);break;
        case 'eq':ok=actual.exists&&JSON.stringify(actual.value)===JSON.stringify(c.value);break;
        case 'neq':ok=!actual.exists||JSON.stringify(actual.value)!==JSON.stringify(c.value);break;
        case 'gt':ok=actual.exists&&Number(actual.value)>Number(c.value);break;
        case 'gte':ok=actual.exists&&Number(actual.value)>=Number(c.value);break;
        case 'lt':ok=actual.exists&&Number(actual.value)<Number(c.value);break;
        case 'lte':ok=actual.exists&&Number(actual.value)<=Number(c.value);break;
        case 'contains':ok=actual.exists&&(Array.isArray(actual.value)?actual.value.some(v=>JSON.stringify(v)===JSON.stringify(c.value)):typeof actual.value==='string'&&actual.value.includes(String(c.value)));break;
      }
      return {path:c.path,op:c.op,matched:ok};
    });
    return {matched:results.every(r=>r.matched),results};
  }
  async runDueEvents(){
    await this.db.query(`INSERT INTO automation_event_receipts(tenant_id,event_id,event_type)
      SELECT e.tenant_id,e.id,e.event_type FROM communication_domain_events e
      WHERE e.status='PROCESSED' AND e.created_at>=now()-interval '7 days'
        AND EXISTS(SELECT 1 FROM automation_rules r WHERE r.tenant_id=e.tenant_id AND r.enabled=true AND (r.event_type=e.event_type OR r.event_type='*'))
      ORDER BY e.created_at DESC LIMIT 5000 ON CONFLICT(tenant_id,event_id) DO NOTHING`);
    const claimed=await this.db.query<EventRecord>(`WITH due AS (
      SELECT tenant_id,event_id FROM automation_event_receipts
      WHERE ((status IN ('PENDING','FAILED') AND attempts<8 AND next_attempt_at<=now())
        OR (status='PROCESSING' AND attempts<8 AND locked_at<now()-interval '15 minutes'))
      ORDER BY next_attempt_at,created_at FOR UPDATE SKIP LOCKED LIMIT 50
    )
    UPDATE automation_event_receipts r SET status='PROCESSING',attempts=r.attempts+1,locked_at=now()
    FROM due,communication_domain_events e WHERE r.tenant_id=due.tenant_id AND r.event_id=due.event_id
      AND e.tenant_id=r.tenant_id AND e.id=r.event_id
    RETURNING r.tenant_id,r.event_id,r.event_type,e.payload,r.attempts`,[]);
    for(const event of claimed.rows){
      try{
        const rules=await this.db.query(`SELECT id,conditions,actions FROM automation_rules WHERE tenant_id=$1 AND enabled=true AND (event_type=$2 OR event_type='*') ORDER BY created_at`,[event.tenant_id,event.event_type]);
        for(const rule of rules.rows){
          const existing=await this.db.query('SELECT id FROM automation_rule_runs WHERE tenant_id=$1 AND rule_id=$2 AND event_id=$3',[event.tenant_id,rule.id,event.event_id]);
          if(existing.rowCount)continue;
          const condition=this.matches(event.payload??{},Array.isArray(rule.conditions)?rule.conditions as Condition[]:[]);
          const actionResults:Record<string,unknown>[]=[];
          if(condition.matched){
            for(const action of (Array.isArray(rule.actions)?rule.actions as Action[]:[])){
              if(action.type==='CREATE_ALERT'){
                const alert=await this.db.query(`INSERT INTO automation_alerts(tenant_id,rule_id,event_id,severity,title,details)
                  VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(tenant_id,rule_id,event_id) DO NOTHING RETURNING id`,
                  [event.tenant_id,rule.id,event.event_id,action.severity??'HIGH',action.title??'Automation alert',JSON.stringify({eventType:event.event_type,eventId:event.event_id,ruleId:rule.id})]);
                actionResults.push({type:action.type,status:alert.rowCount?'CREATED':'ALREADY_EXISTS',alertId:alert.rows[0]?.id??null});
              }else if(action.type==='EMIT_WEBHOOK'){
                const emitted=await this.db.query(`INSERT INTO webhook_delivery_outbox(tenant_id,endpoint_id,event_id,event_type,payload)
                  SELECT e.tenant_id,e.id,gen_random_uuid(),'automation.rule.matched',jsonb_build_object('ruleId',$2,'eventId',$3,'eventType',$4)
                  FROM tenant_webhook_endpoints e WHERE e.tenant_id=$1 AND e.enabled=true AND 'automation.rule.matched'=ANY(e.event_types)`,
                  [event.tenant_id,rule.id,event.event_id,event.event_type]);
                actionResults.push({type:action.type,status:'QUEUED',endpointCount:emitted.rowCount??0});
              }
            }
          }
          await this.db.query(`INSERT INTO automation_rule_runs(tenant_id,rule_id,event_id,event_type,status,condition_results,action_results,completed_at)
            VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,now()) ON CONFLICT(tenant_id,rule_id,event_id) DO NOTHING`,
            [event.tenant_id,rule.id,event.event_id,event.event_type,condition.matched?'SUCCEEDED':'NO_MATCH',JSON.stringify(condition.results),JSON.stringify(actionResults)]);
        }
        await this.db.query(`UPDATE automation_event_receipts SET status='COMPLETED',completed_at=now(),locked_at=NULL,last_error=NULL WHERE tenant_id=$1 AND event_id=$2`,[event.tenant_id,event.event_id]);
      }catch(e){
        const msg=e instanceof Error?e.message:'AUTOMATION_FAILED';
        await this.db.query(`UPDATE automation_event_receipts SET status=CASE WHEN attempts>=8 THEN 'FAILED' ELSE 'FAILED' END,next_attempt_at=now()+make_interval(secs=>$3),locked_at=NULL,last_error=$4 WHERE tenant_id=$1 AND event_id=$2`,[event.tenant_id,event.event_id,Math.min(3600,15*Math.pow(2,Math.min(event.attempts-1,8))),msg.slice(0,1000)]);
      }
    }
    return {claimed:claimed.rowCount??0};
  }
}
