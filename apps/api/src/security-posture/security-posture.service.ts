import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditContext, AuditService } from '../audit/audit.service';
import { CreateNetworkPolicyDto, UpdateComplianceFindingDto } from './security-posture.dto';

type RouterState={id:string;name:string;vendor:string|null;model:string|null;os_version:string|null;status:string;management_protocol:string;management_enabled:boolean;controller_endpoint:string|null;capabilities:Record<string,unknown>;management_credentials_encrypted:string|null};

@Injectable()
export class SecurityPostureService {
  constructor(@Inject(PG_POOL) private readonly db:Pool,private readonly audit:AuditService){}

  async listPolicies(tenantId:string){
    const r=await this.db.query(`SELECT p.id,p.policy_key AS "policyKey",p.name,p.description,p.scope_type AS "scopeType",p.scope_id AS "scopeId",p.desired_state AS "desiredState",p.enforcement_mode AS "enforcementMode",p.status,p.created_at AS "createdAt",p.updated_at AS "updatedAt",(SELECT jsonb_build_object('result',e.result,'evaluatedAt',e.evaluated_at) FROM network_policy_evaluations e WHERE e.tenant_id=p.tenant_id AND e.policy_id=p.id ORDER BY e.evaluated_at DESC LIMIT 1) AS "lastEvaluation" FROM network_policy_definitions p WHERE p.tenant_id=$1 ORDER BY p.updated_at DESC LIMIT 200`,[tenantId]);
    return {data:r.rows,count:r.rowCount??0};
  }

  async createPolicy(tenantId:string,actorUserId:string,input:CreateNetworkPolicyDto,context:AuditContext={}){
    if(input.scopeType==='ROUTER'&&!input.scopeId)throw new BadRequestException('Router-scoped policies require a router ID');
    if(input.scopeType==='TENANT'&&input.scopeId)throw new BadRequestException('Tenant-scoped policies must not include a router ID');
    if(input.scopeType==='ROUTER'){
      const router=await this.db.query('SELECT id FROM routers WHERE tenant_id=$1 AND id=$2',[tenantId,input.scopeId]);
      if(!router.rowCount)throw new NotFoundException('Policy router not found in this tenant');
    }
    try{
      const r=await this.db.query(`INSERT INTO network_policy_definitions(tenant_id,policy_key,name,description,scope_type,scope_id,desired_state,enforcement_mode,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$9) RETURNING id,policy_key AS "policyKey",name,description,scope_type AS "scopeType",scope_id AS "scopeId",desired_state AS "desiredState",enforcement_mode AS "enforcementMode",status,created_at AS "createdAt"`,[tenantId,input.policyKey,input.name.trim(),input.description?.trim()||null,input.scopeType,input.scopeId??null,JSON.stringify(input.desiredState),input.enforcementMode,actorUserId]);
      await this.audit.record(tenantId,'NETWORK_POLICY_CREATED','network_policy',r.rows[0].id,{policyKey:input.policyKey,scopeType:input.scopeType,enforcementMode:input.enforcementMode},context);return r.rows[0];
    }catch(e){if(typeof e==='object'&&e!==null&&'code'in e&&(e as {code?:string}).code==='23505')throw new ConflictException('Policy key already exists for this tenant');throw e;}
  }

  async evaluatePolicy(tenantId:string,policyId:string,context:AuditContext={}){
    const p=await this.db.query('SELECT id,policy_key,scope_type,scope_id,desired_state,status FROM network_policy_definitions WHERE tenant_id=$1 AND id=$2',[tenantId,policyId]);
    if(!p.rowCount)throw new NotFoundException('Network policy not found');
    if(p.rows[0].status!=='ACTIVE')throw new ConflictException('Paused policies cannot be evaluated');
    const policy=p.rows[0];
    const routers=await this.db.query<RouterState>(`SELECT id,name,vendor,model,os_version,status,management_protocol,management_enabled,controller_endpoint,capabilities,management_credentials_encrypted FROM routers WHERE tenant_id=$1 AND ($2::uuid IS NULL OR id=$2) ORDER BY name`,[tenantId,policy.scope_type==='ROUTER'?policy.scope_id:null]);
    const desired=policy.desired_state as Record<string,unknown>;
    const readers:Record<string,(r:RouterState)=>unknown>={vendor:r=>r.vendor,model:r=>r.model,osVersion:r=>r.os_version,status:r=>r.status,managementProtocol:r=>r.management_protocol,managementEnabled:r=>r.management_enabled,controllerEndpoint:r=>r.controller_endpoint,capabilities:r=>r.capabilities,credentialsConfigured:r=>r.management_credentials_encrypted!==null};
    const evaluations=[];
    for(const router of routers.rows){
      const observed:Record<string,unknown>={},drift:Record<string,{desired:unknown;observed:unknown}>={};let unverified=false;
      for(const [key,wanted] of Object.entries(desired)){const read=readers[key];if(!read){unverified=true;continue;}const actual=read(router);observed[key]=actual;if(JSON.stringify(actual??null)!==JSON.stringify(wanted??null))drift[key]={desired:wanted,observed:actual};}
      const result=unverified?'UNVERIFIED':Object.keys(drift).length?'DRIFT':'IN_SYNC';
      const e=await this.db.query(`INSERT INTO network_policy_evaluations(tenant_id,policy_id,router_id,result,observed_state,drift,source,live_device_verified) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,'DATABASE_CONFIGURATION',false) RETURNING id,router_id AS "routerId",result,observed_state AS "observedState",drift,evaluated_at AS "evaluatedAt"`,[tenantId,policyId,router.id,result,JSON.stringify(observed),JSON.stringify(drift)]);
      evaluations.push({routerName:router.name,...e.rows[0]});
    }
    await this.audit.record(tenantId,'NETWORK_POLICY_EVALUATED','network_policy',policyId,{routerCount:evaluations.length,driftCount:evaluations.filter(e=>e.result==='DRIFT').length,unverifiedCount:evaluations.filter(e=>e.result==='UNVERIFIED').length},context);
    return {policyId,policyKey:policy.policy_key,count:evaluations.length,evaluations,source:'DATABASE_CONFIGURATION',liveDeviceVerified:false,note:'This compares stored Jaslyn-Net configuration only; it is not proof of live device state.'};
  }

  async listPolicyEvaluations(tenantId:string,policyId:string){
    const exists=await this.db.query('SELECT 1 FROM network_policy_definitions WHERE tenant_id=$1 AND id=$2',[tenantId,policyId]);if(!exists.rowCount)throw new NotFoundException('Network policy not found');
    const r=await this.db.query(`SELECT e.id,e.router_id AS "routerId",r.name AS "routerName",e.result,e.observed_state AS "observedState",e.drift,e.source,e.live_device_verified AS "liveDeviceVerified",e.error,e.evaluated_at AS "evaluatedAt" FROM network_policy_evaluations e JOIN routers r ON r.tenant_id=e.tenant_id AND r.id=e.router_id WHERE e.tenant_id=$1 AND e.policy_id=$2 ORDER BY e.evaluated_at DESC LIMIT 500`,[tenantId,policyId]);return {data:r.rows,count:r.rowCount??0};
  }

  async runComplianceScan(tenantId:string,actorUserId?:string,context:AuditContext={}){
    const client=await this.db.connect();
    try{
      await client.query('BEGIN');
      const s=await client.query(`INSERT INTO compliance_scans(tenant_id,status,created_by) VALUES($1,'RUNNING',$2) RETURNING id`,[tenantId,actorUserId??null]);const scanId=s.rows[0].id as string;
      const routers=await client.query<RouterState>(`SELECT id,name,vendor,model,os_version,status,management_protocol,management_enabled,controller_endpoint,capabilities,management_credentials_encrypted FROM routers WHERE tenant_id=$1 ORDER BY name`,[tenantId]);
      let high=0,medium=0,low=0,unverified=0;
      for(const r of routers.rows){
        const findings:Array<{rule:string;severity:'HIGH'|'MEDIUM'|'LOW';title:string;details:string;evidence:Record<string,unknown>}>= [];
        if(r.management_enabled&&!r.management_credentials_encrypted)findings.push({rule:'MANAGEMENT_WITHOUT_ENCRYPTED_CREDENTIALS',severity:'HIGH',title:'Management enabled without encrypted credentials',details:'Management is enabled but Jaslyn-Net has no encrypted management credential for this router.',evidence:{managementProtocol:r.management_protocol}});
        if(r.management_enabled&&r.controller_endpoint?.trim().toLowerCase().startsWith('http://'))findings.push({rule:'INSECURE_CONTROLLER_ENDPOINT',severity:'HIGH',title:'Controller endpoint uses unencrypted HTTP',details:'The configured controller endpoint uses HTTP. Verify HTTPS support or document and isolate an approved exception.',evidence:{scheme:'http'}});
        if(!r.os_version?.trim())unverified++;
        for(const f of findings){if(f.severity==='HIGH')high++;else if(f.severity==='MEDIUM')medium++;else low++;
          await client.query(`INSERT INTO compliance_findings(tenant_id,scan_id,rule_key,severity,status,resource_type,resource_id,title,details,evidence) VALUES($1,$2,$3,$4,'OPEN','ROUTER',$5,$6,$7,$8::jsonb)`,[tenantId,scanId,f.rule,f.severity,r.id,f.title,f.details,JSON.stringify({routerName:r.name,vendor:r.vendor,model:r.model,...f.evidence})]);
        }
      }
      const done=await client.query(`UPDATE compliance_scans SET status='COMPLETED',scanned_resources=$2,high_findings=$3,medium_findings=$4,low_findings=$5,unverified_resources=$6,completed_at=now() WHERE tenant_id=$1 AND id=$7 RETURNING id,status,scanned_resources AS "scannedResources",high_findings AS "highFindings",medium_findings AS "mediumFindings",low_findings AS "lowFindings",unverified_resources AS "unverifiedResources",started_at AS "startedAt",completed_at AS "completedAt"`,[tenantId,routers.rowCount??0,high,medium,low,unverified,scanId]);
      await client.query(`INSERT INTO audit_logs(tenant_id,actor_user_id,action,resource_type,resource_id,request_id,correlation_id,ip_address,user_agent,metadata) VALUES($1,$2,'COMPLIANCE_SCAN_COMPLETED','compliance_scan',$3,$4,$5,$6,$7,$8::jsonb)`,[tenantId,actorUserId??null,scanId,context.requestId??null,context.correlationId??null,context.ipAddress??null,context.userAgent??null,JSON.stringify({scannedResources:routers.rowCount??0,highFindings:high,mediumFindings:medium,lowFindings:low,unverifiedResources:unverified})]);
      await client.query('COMMIT');return done.rows[0];
    }catch(e){await client.query('ROLLBACK').catch(()=>undefined);throw e;}finally{client.release();}
  }

  async runAllTenantScans(){const tenants=await this.db.query("SELECT id FROM tenants WHERE status NOT IN ('ARCHIVED','SUSPENDED') ORDER BY id");const results=[];for(const t of tenants.rows){try{results.push(await this.runComplianceScan(t.id));}catch(e){results.push({tenantId:t.id,status:'FAILED',error:e instanceof Error?e.message:'Unknown error'});}}return results;}

  async listComplianceScans(tenantId:string){const r=await this.db.query(`SELECT id,status,scanned_resources AS "scannedResources",high_findings AS "highFindings",medium_findings AS "mediumFindings",low_findings AS "lowFindings",unverified_resources AS "unverifiedResources",started_at AS "startedAt",completed_at AS "completedAt",error FROM compliance_scans WHERE tenant_id=$1 ORDER BY started_at DESC LIMIT 100`,[tenantId]);return {data:r.rows,count:r.rowCount??0};}

  async listComplianceFindings(tenantId:string,status?:string){const r=await this.db.query(`SELECT f.id,f.scan_id AS "scanId",f.rule_key AS "ruleKey",f.severity,f.status,f.resource_type AS "resourceType",f.resource_id AS "resourceId",r.name AS "resourceName",f.title,f.details,f.evidence,f.created_at AS "createdAt",f.resolved_at AS "resolvedAt",f.resolution_note AS "resolutionNote" FROM compliance_findings f JOIN routers r ON r.tenant_id=f.tenant_id AND r.id=f.resource_id WHERE f.tenant_id=$1 AND ($2::text IS NULL OR f.status=$2) ORDER BY CASE f.severity WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 WHEN 'LOW' THEN 2 ELSE 3 END,f.created_at DESC LIMIT 500`,[tenantId,status??null]);return {data:r.rows,count:r.rowCount??0};}

  async updateComplianceFinding(tenantId:string,actorUserId:string,id:string,input:UpdateComplianceFindingDto,context:AuditContext={}){
    const r=await this.db.query(`UPDATE compliance_findings SET status=$3,resolution_note=$4,resolved_at=CASE WHEN $3='RESOLVED' THEN now() ELSE NULL END WHERE tenant_id=$1 AND id=$2 AND status='OPEN' RETURNING id,status,resolution_note AS "resolutionNote",resolved_at AS "resolvedAt"`,[tenantId,id,input.status,input.note?.trim()||null]);
    if(!r.rowCount)throw new NotFoundException('Open compliance finding not found');await this.audit.record(tenantId,'COMPLIANCE_FINDING_'+input.status,'compliance_finding',id,{noteProvided:Boolean(input.note)},context);return r.rows[0];
  }
}
