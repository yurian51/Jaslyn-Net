import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditService } from '../audit/audit.service';

const object = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException(`${label} must be an object`);
  return value as Record<string, unknown>;
};
const text = (value: unknown, label: string, max = 180): string => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new BadRequestException(`${label} is required and must be at most ${max} characters`);
  return value.trim();
};
const json = (value: unknown, fallback: unknown = {}): string => JSON.stringify(value ?? fallback);

@Injectable()
export class OperationsHubService {
  constructor(@Inject(PG_POOL) private readonly db: Pool, private readonly audit: AuditService) {}

  async listArtifacts(tenantId: string, actorId: string) {
    const r = await this.db.query(`SELECT a.id,a.title,a.artifact_type AS "artifactType",a.description,a.visibility,a.current_version AS "currentVersion",a.created_at AS "createdAt",a.updated_at AS "updatedAt",v.content,v.content_sha256 AS "contentSha256" FROM operational_artifacts a JOIN operational_artifact_versions v ON v.tenant_id=a.tenant_id AND v.artifact_id=a.id AND v.version=a.current_version WHERE a.tenant_id=$1 AND a.archived_at IS NULL AND (a.visibility='TENANT' OR a.owner_user_id=$2) ORDER BY a.updated_at DESC LIMIT 200`, [tenantId, actorId]);
    return { data: r.rows };
  }

  async createArtifact(tenantId: string, actorId: string, body: unknown) {
    const b = object(body, 'body'); const title = text(b.title, 'title'); const content = b.content ?? {};
    const type = String(b.artifactType ?? 'DOCUMENT').toUpperCase();
    if (!['DASHBOARD','REPORT','SNAPSHOT','PLAYBOOK','DOCUMENT'].includes(type)) throw new BadRequestException('Unsupported artifactType');
    const visibility = b.visibility === 'TENANT' ? 'TENANT' : 'PRIVATE';
    const serialized = json(content); const hash = createHash('sha256').update(serialized).digest('hex');
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const a = await client.query(`INSERT INTO operational_artifacts(tenant_id,owner_user_id,title,artifact_type,description,visibility) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`, [tenantId,actorId,title,type,typeof b.description==='string'?b.description.slice(0,2000):'',visibility]);
      await client.query(`INSERT INTO operational_artifact_versions(tenant_id,artifact_id,version,content,content_sha256,created_by,change_note) VALUES($1,$2,1,$3::jsonb,$4,$5,$6)`, [tenantId,a.rows[0].id,serialized,hash,actorId,typeof b.changeNote==='string'?b.changeNote.slice(0,1000):'Initial version']);
      await client.query('COMMIT');
      await this.audit.record(tenantId,'CREATE','operational_artifact',a.rows[0].id,{title,artifactType:type,visibility},{userId:actorId});
      return { id:a.rows[0].id, version:1, contentSha256:hash };
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  }

  async versionArtifact(tenantId: string, actorId: string, id: string, body: unknown) {
    const b=object(body,'body'); const content=b.content; if(content===undefined) throw new BadRequestException('content is required');
    const serialized=json(content); const hash=createHash('sha256').update(serialized).digest('hex'); const client=await this.db.connect();
    try {
      await client.query('BEGIN');
      const a=await client.query(`SELECT current_version,owner_user_id,visibility FROM operational_artifacts WHERE tenant_id=$1 AND id=$2 AND archived_at IS NULL FOR UPDATE`,[tenantId,id]);
      if(!a.rowCount || (a.rows[0].visibility!=='TENANT' && a.rows[0].owner_user_id!==actorId)) throw new NotFoundException('Artifact not found');
      const version=Number(a.rows[0].current_version)+1;
      await client.query(`INSERT INTO operational_artifact_versions(tenant_id,artifact_id,version,content,content_sha256,created_by,change_note) VALUES($1,$2,$3,$4::jsonb,$5,$6,$7)`,[tenantId,id,version,serialized,hash,actorId,typeof b.changeNote==='string'?b.changeNote.slice(0,1000):'']);
      await client.query('UPDATE operational_artifacts SET current_version=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2',[tenantId,id,version]);
      await client.query('COMMIT'); await this.audit.record(tenantId,'VERSION','operational_artifact',id,{version,contentSha256:hash},{userId:actorId}); return {id,version,contentSha256:hash};
    } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  }

  async artifactHistory(tenantId:string,actorId:string,id:string) {
    const owner=await this.db.query(`SELECT id FROM operational_artifacts WHERE tenant_id=$1 AND id=$2 AND archived_at IS NULL AND (visibility='TENANT' OR owner_user_id=$3)`,[tenantId,id,actorId]);
    if(!owner.rowCount) throw new NotFoundException('Artifact not found');
    const r=await this.db.query(`SELECT version,content,content_sha256 AS "contentSha256",created_by AS "createdBy",created_at AS "createdAt",change_note AS "changeNote" FROM operational_artifact_versions WHERE tenant_id=$1 AND artifact_id=$2 ORDER BY version DESC`,[tenantId,id]); return {data:r.rows};
  }

  async listWorkspaces(tenantId:string,actorId:string) {
    const r=await this.db.query(`SELECT id,name,layout,pinned_routes AS "pinnedRoutes",preferences,"is_default" AS "isDefault",created_at AS "createdAt",updated_at AS "updatedAt" FROM operator_workspaces WHERE tenant_id=$1 AND user_id=$2 ORDER BY is_default DESC,updated_at DESC`,[tenantId,actorId]); return {data:r.rows};
  }
  async saveWorkspace(tenantId:string,actorId:string,body:unknown) {
    const b=object(body,'body'); const name=text(b.name,'name',100); const isDefault=b.isDefault===true;
    const client=await this.db.connect();
    try {
      await client.query('BEGIN');
      if(isDefault) await client.query('UPDATE operator_workspaces SET is_default=false,updated_at=now() WHERE tenant_id=$1 AND user_id=$2',[tenantId,actorId]);
      const r=await client.query(`INSERT INTO operator_workspaces(tenant_id,user_id,name,layout,pinned_routes,preferences,is_default) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7) ON CONFLICT(tenant_id,user_id,name) DO UPDATE SET layout=EXCLUDED.layout,pinned_routes=EXCLUDED.pinned_routes,preferences=EXCLUDED.preferences,is_default=EXCLUDED.is_default,updated_at=now() RETURNING id,name,layout,pinned_routes AS "pinnedRoutes",preferences,is_default AS "isDefault",updated_at AS "updatedAt"`,[tenantId,actorId,name,json(b.layout),json(Array.isArray(b.pinnedRoutes)?b.pinnedRoutes.filter(v=>typeof v==='string').slice(0,100):[]),json(b.preferences),isDefault]);
      await client.query('COMMIT'); await this.audit.record(tenantId,'SAVE','operator_workspace',r.rows[0].id,{name,isDefault},{userId:actorId}); return r.rows[0];
    } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  }

  async listRunbooks(tenantId:string) {
    const r=await this.db.query(`SELECT r.id,r.name,r.description,r.category,r.severity,r.status,r.current_version AS "currentVersion",v.steps,v.preconditions,v.rollback_steps AS "rollbackSteps",r.updated_at AS "updatedAt" FROM operational_runbooks r LEFT JOIN operational_runbook_versions v ON v.tenant_id=r.tenant_id AND v.runbook_id=r.id AND v.version=r.current_version WHERE r.tenant_id=$1 ORDER BY r.updated_at DESC LIMIT 200`,[tenantId]); return {data:r.rows};
  }
  async createRunbook(tenantId:string,actorId:string,body:unknown) {
    const b=object(body,'body'); const name=text(b.name,'name'); const steps=Array.isArray(b.steps)?b.steps: null;
    if(!steps || steps.length<1 || steps.length>100) throw new BadRequestException('steps must be an array with 1-100 entries');
    const rollback=Array.isArray(b.rollbackSteps)?b.rollbackSteps:[]; const severity=String(b.severity??'MEDIUM').toUpperCase();
    if(!['CRITICAL','HIGH','MEDIUM','LOW','INFO'].includes(severity)) throw new BadRequestException('Invalid severity');
    const client=await this.db.connect();
    try { await client.query('BEGIN');
      const r=await client.query(`INSERT INTO operational_runbooks(tenant_id,name,description,category,severity,status,current_version,created_by,updated_by) VALUES($1,$2,$3,$4,$5,'DRAFT',1,$6,$6) RETURNING id`,[tenantId,name,typeof b.description==='string'?b.description.slice(0,2000):'',typeof b.category==='string'?b.category.slice(0,80):'GENERAL',severity,actorId]);
      await client.query(`INSERT INTO operational_runbook_versions(tenant_id,runbook_id,version,steps,preconditions,rollback_steps,created_by,change_note) VALUES($1,$2,1,$3::jsonb,$4::jsonb,$5::jsonb,$6,$7)`,[tenantId,r.rows[0].id,json(steps),json(Array.isArray(b.preconditions)?b.preconditions:[]),json(rollback),actorId,typeof b.changeNote==='string'?b.changeNote.slice(0,1000):'Initial version']);
      await client.query('COMMIT'); await this.audit.record(tenantId,'CREATE','operational_runbook',r.rows[0].id,{name,version:1,stepCount:steps.length},{userId:actorId}); return {id:r.rows[0].id,version:1,status:'DRAFT'};
    } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  }

  async executeRunbook(tenantId:string,actorId:string,id:string,body:unknown) {
    const b=object(body,'body'); const key=text(b.idempotencyKey,'idempotencyKey',200);
    if(key.length<8) throw new BadRequestException('idempotencyKey must contain at least 8 characters');
    const r=await this.db.query(`INSERT INTO operational_runbook_executions(tenant_id,runbook_id,runbook_version,requested_by,status,idempotency_key,input_snapshot) SELECT $1,id,current_version,$3,'PENDING_APPROVAL',$4,$5::jsonb FROM operational_runbooks WHERE tenant_id=$1 AND id=$2 AND status='ACTIVE' ON CONFLICT(tenant_id,idempotency_key) DO NOTHING RETURNING id,status,runbook_version AS "runbookVersion",created_at AS "createdAt"`,[tenantId,id,actorId,key,json(b.input)]);
    if(!r.rowCount) {
      const existing=await this.db.query(`SELECT id,status,runbook_version AS "runbookVersion",created_at AS "createdAt" FROM operational_runbook_executions WHERE tenant_id=$1 AND idempotency_key=$2`,[tenantId,key]);
      if(existing.rowCount) return {...existing.rows[0],idempotentReplay:true};
      throw new NotFoundException('Active runbook not found');
    }
    await this.audit.record(tenantId,'REQUEST_EXECUTION','operational_runbook',id,{executionId:r.rows[0].id,status:'PENDING_APPROVAL'},{userId:actorId}); return r.rows[0];
  }

  async listIntegrations(tenantId:string) {
    const r=await this.db.query(`SELECT id,provider_key AS "providerKey",display_name AS "displayName",status,config,last_checked_at AS "lastCheckedAt",last_success_at AS "lastSuccessAt",last_error_code AS "lastErrorCode",last_error_summary AS "lastErrorSummary",updated_at AS "updatedAt" FROM integration_connections WHERE tenant_id=$1 ORDER BY display_name LIMIT 200`,[tenantId]); return {data:r.rows};
  }
  async saveIntegration(tenantId:string,actorId:string,body:unknown) {
    const b=object(body,'body'); const provider=text(b.providerKey,'providerKey',100).toLowerCase(); if(!/^[a-z0-9][a-z0-9_.-]{1,99}$/.test(provider)) throw new BadRequestException('Invalid providerKey');
    const name=text(b.displayName,'displayName',160); const config=object(b.config??{},'config');
    if(Object.keys(config).some(k=>/(password|secret|token|api[-_]?key|credential|authorization|private[-_]?key)/i.test(k))) throw new BadRequestException('Secrets must be stored in the secrets vault, not integration config');
    const r=await this.db.query(`INSERT INTO integration_connections(tenant_id,provider_key,display_name,config,credential_reference,created_by,updated_by) VALUES($1,$2,$3,$4::jsonb,$5,$6,$6) ON CONFLICT(tenant_id,provider_key) DO UPDATE SET display_name=EXCLUDED.display_name,config=EXCLUDED.config,credential_reference=EXCLUDED.credential_reference,updated_by=EXCLUDED.updated_by,updated_at=now() RETURNING id,provider_key AS "providerKey",display_name AS "displayName",status,config,updated_at AS "updatedAt"`,[tenantId,provider,name,json(config),typeof b.credentialReference==='string'?b.credentialReference.slice(0,240):null,actorId]);
    await this.audit.record(tenantId,'UPSERT','integration_connection',r.rows[0].id,{providerKey:provider,displayName:name},{userId:actorId}); return r.rows[0];
  }

  async listChanges(tenantId:string) {
    const r=await this.db.query(`SELECT id,change_type AS "changeType",target_type AS "targetType",target_id AS "targetId",title,proposed_change AS "proposedChange",before_snapshot AS "beforeSnapshot",after_snapshot AS "afterSnapshot",diff_summary AS "diffSummary",backup_reference AS "backupReference",rollback_plan AS "rollbackPlan",status,risk_level AS "riskLevel",requested_by AS "requestedBy",reviewed_by AS "reviewedBy",review_note AS "reviewNote",created_at AS "createdAt",reviewed_at AS "reviewedAt",applied_at AS "appliedAt",rolled_back_at AS "rolledBackAt" FROM operational_change_reviews WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 300`,[tenantId]); return {data:r.rows};
  }
  async createChange(tenantId:string,actorId:string,body:unknown) {
    const b=object(body,'body'); const type=String(b.changeType??'').toUpperCase(); const risk=String(b.riskLevel??'MEDIUM').toUpperCase();
    if(!['NETWORK_CONFIG','WORKFLOW','INTEGRATION','POLICY','RELEASE'].includes(type)) throw new BadRequestException('Invalid changeType');
    if(!['CRITICAL','HIGH','MEDIUM','LOW'].includes(risk)) throw new BadRequestException('Invalid riskLevel');
    const key=text(b.idempotencyKey,'idempotencyKey',200); if(key.length<8) throw new BadRequestException('idempotencyKey must contain at least 8 characters');
    const r=await this.db.query(`INSERT INTO operational_change_reviews(tenant_id,change_type,target_type,target_id,title,proposed_change,before_snapshot,after_snapshot,diff_summary,backup_reference,rollback_plan,risk_level,requested_by,idempotency_key) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11::jsonb,$12,$13,$14) ON CONFLICT(tenant_id,idempotency_key) DO NOTHING RETURNING id,status,risk_level AS "riskLevel",created_at AS "createdAt"`,[tenantId,type,text(b.targetType,'targetType',100),text(b.targetId,'targetId',180),text(b.title,'title'),json(object(b.proposedChange,'proposedChange')),b.beforeSnapshot===undefined?null:json(b.beforeSnapshot),b.afterSnapshot===undefined?null:json(b.afterSnapshot),json(b.diffSummary),typeof b.backupReference==='string'?b.backupReference.slice(0,500):null,json(Array.isArray(b.rollbackPlan)?b.rollbackPlan:[]),risk,actorId,key]);
    if(!r.rowCount) { const existing=await this.db.query(`SELECT id,status,risk_level AS "riskLevel",created_at AS "createdAt" FROM operational_change_reviews WHERE tenant_id=$1 AND idempotency_key=$2`,[tenantId,key]); return {...existing.rows[0],idempotentReplay:true}; }
    await this.audit.record(tenantId,'REQUEST_REVIEW','operational_change_review',r.rows[0].id,{changeType:type,riskLevel:risk,title:b.title},{userId:actorId}); return r.rows[0];
  }
  async reviewChange(tenantId:string,actorId:string,id:string,body:unknown) {
    const b=object(body,'body'); const status=String(b.status??'').toUpperCase();
    if(!['APPROVED','REJECTED'].includes(status)) throw new BadRequestException('Review status must be APPROVED or REJECTED');
    const r=await this.db.query(`UPDATE operational_change_reviews SET status=$3,reviewed_by=$4,review_note=$5,reviewed_at=now() WHERE tenant_id=$1 AND id=$2 AND status='PENDING' AND requested_by<>$4 RETURNING id,status,risk_level AS "riskLevel",reviewed_at AS "reviewedAt"`,[tenantId,id,status,actorId,typeof b.note==='string'?b.note.slice(0,2000):null]);
    if(!r.rowCount) throw new NotFoundException('Pending change review not found or requester cannot approve own change');
    await this.audit.record(tenantId,status,'operational_change_review',id,{note:typeof b.note==='string'?b.note.slice(0,500):''},{userId:actorId}); return r.rows[0];
  }
}
