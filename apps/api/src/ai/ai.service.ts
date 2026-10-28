import { Inject, Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditService } from '../audit/audit.service';
import { RoutersService } from '../routers/routers.service';
import { SessionsService } from '../sessions/sessions.service';
import { IspOperationsService } from '../isp-operations/isp-operations.service';
import { IncidentsService } from '../incidents/incidents.service';
import { AiAgentKey, AiPlan, AiPlanStep, AiRiskLevel } from './ai.types';
import { LlamafileProvider } from './llamafile.provider';

const AGENTS = [
  ['orchestrator','Jaslyn Orchestrator','Coordinates specialist agents and verifies cross-domain work.','HIGH'],
  ['network','Network Agent','Devices, interfaces, topology, WAN, QoS and network commands.','HIGH'],
  ['subscriber','Subscriber Agent','Customer service lifecycle, access and entitlement state.','HIGH'],
  ['billing','Billing Agent','Plans, invoices, purchases and commercial state.','MEDIUM'],
  ['payment','Payment Agent','Payment verification and reconciliation.','HIGH'],
  ['security','Security Agent','Authorization, tenant isolation, secrets and security events.','CRITICAL'],
  ['monitoring','Monitoring Agent','Telemetry, health, anomalies and operational signals.','MEDIUM'],
  ['incident','Incident Agent','Correlation, RCA, remediation plans and verification.','HIGH'],
  ['radius','RADIUS Agent','AAA, accounting, NAS and session authorization.','HIGH'],
  ['workflow','Workflow Agent','Event-driven automations and operational workflows.','HIGH'],
  ['support','Support Agent','Communication and operator assistance.','MEDIUM'],
] as const;

const TOOLS = [
  ['device.health','DEVICE.HEALTH','LOW','DIRECT'],
  ['device.configuration','DEVICE.CONFIGURATION','HIGH','APPROVAL_REQUIRED'],
  ['session.list','SESSION.LIST','LOW','DIRECT'],
  ['session.disconnect','SESSION.DISCONNECT','HIGH','APPROVAL_REQUIRED'],
  ['subscriber.inspect','SUBSCRIBER.INSPECT','LOW','DIRECT'],
  ['subscriber.activate','SUBSCRIBER.ACTIVATE','HIGH','APPROVAL_REQUIRED'],
  ['subscriber.suspend','SUBSCRIBER.SUSPEND','HIGH','APPROVAL_REQUIRED'],
  ['bandwidth.inspect','BANDWIDTH.INSPECT','LOW','DIRECT'],
  ['bandwidth.limit','BANDWIDTH.LIMIT','HIGH','APPROVAL_REQUIRED'],
  ['hotspot.users','HOTSPOT.USERS','LOW','DIRECT'],
  ['payment.reconcile','PAYMENT.RECONCILE','HIGH','APPROVAL_REQUIRED'],
  ['incident.investigate','INCIDENT.INVESTIGATE','MEDIUM','DIRECT'],
  ['incident.remediate','INCIDENT.REMEDIATE','HIGH','APPROVAL_REQUIRED'],
  ['security.audit','SECURITY.AUDIT','MEDIUM','DIRECT'],
] as const;

@Injectable()
export class AiService {
  constructor(
    @Inject(PG_POOL) private readonly db: Pool,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly routers: RoutersService,
    private readonly sessions: SessionsService,
    private readonly isp: IspOperationsService,
    private readonly incidents: IncidentsService,
    private readonly llamafile: LlamafileProvider,
  ) {}

  capabilities(_tenantId: string) {
    return {
      agents: AGENTS.map(([key,name,description,risk]) => ({key,name,description,risk})),
      capabilities: TOOLS.map(([key,capability,risk,executionMode]) => ({key,capability,risk,executionMode})),
      autonomy: {LOW:'AUTO',MEDIUM:'AUTO_OR_APPROVAL',HIGH:'APPROVAL',CRITICAL:'APPROVAL_OR_BLOCK'},
      modelProvider: this.config.get<string>('JASLYN_AI_PROVIDER', this.config.get<string>('AI_PROVIDER', 'deterministic')),
      localInference: {
        provider: 'llamafile',
        configured: Boolean(this.config.get<string>('JASLYN_LLAMAFILE_ENDPOINT')?.trim()),
        endpoint: this.config.get<string>('JASLYN_LLAMAFILE_ENDPOINT', 'http://127.0.0.1:8080/v1'),
        model: this.config.get<string>('JASLYN_LLAMAFILE_MODEL', 'LLaMA_CPP'),
      },
      architecture: ['agent-orchestrator','skills','dynamic-tool-registry','MCP-gateway','approval-policy','checkpoint-rollback','agent-audit','model-router'],
    };
  }

  tools(_tenantId: string) {
    return TOOLS.map(([key,capability,risk,executionMode]) => ({
      key,name:key,description:'JASLYN capability: '+capability,capability,risk,executionMode,
      schema:{ type:'object', additionalProperties:true },
    }));
  }

  async createRun(userId:string,tenantId:string,task:string,context:Record<string,unknown>) {
    const correlationId=randomUUID();
    const planned=await this.tryModelPlan(task,context);
    const plan=planned?.plan ?? this.buildPlan(task);
    const risk=this.planRisk(plan);
    const status=plan.steps.some(s=>s.requiresApproval)?'WAITING_APPROVAL':'PLANNING';
    const provider=planned?.provider ?? 'deterministic';
    const model=planned?.model ?? null;
    const result=await this.db.query(
      'INSERT INTO ai_runs (tenant_id,actor_user_id,agent_key,task,status,risk_level,plan,correlation_id,provider,model,input_tokens,output_tokens,started_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id,created_at AS "createdAt",status,risk_level AS "riskLevel",plan,correlation_id AS "correlationId",provider,model,input_tokens AS "inputTokens",output_tokens AS "outputTokens"',
      [tenantId,userId,'orchestrator',task.trim(),status,risk,JSON.stringify(plan),correlationId,provider,model,planned?.inputTokens ?? null,planned?.outputTokens ?? null,'operator'],
    );
    const run=result.rows[0];
    for(const step of plan.steps) {
      await this.db.query(
        'INSERT INTO ai_actions (run_id,tenant_id,tool_key,action,resource_type,resource_id,risk_level,status,input,approval_required,correlation_id,rollback) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
        [run.id,tenantId,step.toolKey,step.title,null,null,step.risk,step.requiresApproval?'PENDING':'APPROVED',JSON.stringify({task,context,step}),step.requiresApproval,correlationId,JSON.stringify({strategy:'verify-before-rollback',stepId:step.id})],
      );
    }
    await this.audit.record(tenantId,'AI_RUN_CREATED','ai_run',run.id,{task:task.trim(),risk,provider,model,plan},{userId,correlationId});
    return {...run,execution:{mode:status==='WAITING_APPROVAL'?'approval_required':'ready',message:status==='WAITING_APPROVAL'?'High-risk actions require operator approval before execution.':'Plan ready for execution.'}};
  }

  async runs(tenantId:string) {
    const result=await this.db.query('SELECT id,agent_key AS "agentKey",task,status,risk_level AS "riskLevel",plan,result,error,correlation_id AS "correlationId",provider,model,input_tokens AS "inputTokens",output_tokens AS "outputTokens",created_at AS "createdAt",started_at AS "startedAt",finished_at AS "finishedAt" FROM ai_runs WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 100',[tenantId]);
    return {data:result.rows,count:result.rowCount??0};
  }

  async run(tenantId:string,id:string) {
    const result=await this.db.query('SELECT id,actor_user_id AS "actorUserId",agent_key AS "agentKey",task,status,risk_level AS "riskLevel",plan,result,error,correlation_id AS "correlationId",provider,model,input_tokens AS "inputTokens",output_tokens AS "outputTokens",created_at AS "createdAt",started_at AS "startedAt",finished_at AS "finishedAt" FROM ai_runs WHERE tenant_id=$1 AND id=$2',[tenantId,id]);
    if(!result.rows[0]) throw new NotFoundException('AI run not found');
    const actions=await this.db.query('SELECT id,tool_key AS "toolKey",action,risk_level AS "riskLevel",status,input,output,approval_required AS "approvalRequired",approved_by AS "approvedBy",approved_at AS "approvedAt",error,correlation_id AS "correlationId",rollback,created_at AS "createdAt",finished_at AS "finishedAt" FROM ai_actions WHERE tenant_id=$1 AND run_id=$2 ORDER BY created_at',[tenantId,id]);
    return {...result.rows[0],actions:actions.rows};
  }

  async approve(userId:string,tenantId:string,actionId:string,role:string) {
    if(!['OWNER','ADMIN','SUPER_ADMIN','NOC_ENGINEER','NETWORK_ADMIN','BILLING_ADMIN'].includes(role)) throw new ForbiddenException('Insufficient role for AI action approval');
    const result=await this.db.query('UPDATE ai_actions SET status=\'APPROVED\',approved_by=$3,approved_at=now() WHERE tenant_id=$1 AND id=$2 AND status=\'PENDING\' RETURNING id,run_id AS "runId",tool_key AS "toolKey",status',[tenantId,actionId,userId]);
    if(!result.rowCount) throw new NotFoundException('Pending AI action not found');
    await this.audit.record(tenantId,'AI_ACTION_APPROVED','ai_action',actionId,{runId:result.rows[0].runId,toolKey:result.rows[0].toolKey},{userId});
    return result.rows[0];
  }

  async reject(userId:string,tenantId:string,actionId:string,reason:string) {
    const result=await this.db.query('UPDATE ai_actions SET status=\'BLOCKED\',error=$3,finished_at=now() WHERE tenant_id=$1 AND id=$2 AND status=\'PENDING\' RETURNING id,run_id AS "runId",status',[tenantId,actionId,reason.trim().slice(0,2000)]);
    if(!result.rowCount) throw new NotFoundException('Pending AI action not found');
    await this.audit.record(tenantId,'AI_ACTION_BLOCKED','ai_action',actionId,{reason:reason.trim(),runId:result.rows[0].runId},{userId});
    return result.rows[0];
  }

  async execute(userId:string,tenantId:string,actionId:string) {
    const action=(await this.db.query('SELECT * FROM ai_actions WHERE tenant_id=$1 AND id=$2',[tenantId,actionId])).rows[0];
    if(!action) throw new NotFoundException('AI action not found');
    if(action.approval_required && action.status!=='APPROVED') throw new ForbiddenException('AI action requires approval');
    if(!['APPROVED','PENDING'].includes(action.status)) throw new BadRequestException('AI action is not executable');
    await this.db.query('UPDATE ai_actions SET status=\'EXECUTING\' WHERE tenant_id=$1 AND id=$2',[tenantId,actionId]);
    const run=(await this.db.query('SELECT task,correlation_id AS "correlationId" FROM ai_runs WHERE tenant_id=$1 AND id=$2',[tenantId,action.run_id])).rows[0];
    try {
      const input=(action.input??{}) as Record<string,unknown>;
      const result=await this.executeTool(tenantId,action.tool_key,input,run?.correlationId);
      await this.db.query('UPDATE ai_actions SET status=\'SUCCEEDED\',output=$3,finished_at=now() WHERE tenant_id=$1 AND id=$2',[tenantId,actionId,JSON.stringify(result)]);
      await this.db.query('UPDATE ai_runs SET status=\'SUCCEEDED\',result=$3,finished_at=now(),started_at=COALESCE(started_at,now()) WHERE tenant_id=$1 AND id=$2',[tenantId,action.run_id,JSON.stringify(result)]);
      await this.audit.record(tenantId,'AI_ACTION_EXECUTED','ai_action',actionId,{toolKey:action.tool_key,result},{userId,correlationId:run?.correlationId});
      return {actionId,status:'SUCCEEDED',result};
    } catch(error) {
      const message=error instanceof Error?error.message:'AI action failed';
      await this.db.query('UPDATE ai_actions SET status=\'FAILED\',error=$3,finished_at=now() WHERE tenant_id=$1 AND id=$2',[tenantId,actionId,message]);
      await this.db.query('UPDATE ai_runs SET status=\'FAILED\',error=$3,finished_at=now() WHERE tenant_id=$1 AND id=$2',[tenantId,action.run_id,message]);
      await this.audit.record(tenantId,'AI_ACTION_FAILED','ai_action',actionId,{toolKey:action.tool_key,error:message},{userId,correlationId:run?.correlationId});
      throw error;
    }
  }

  private async executeTool(tenantId:string,toolKey:string,input:Record<string,unknown>,correlationId?:string) {
    const context={correlationId};
    switch(toolKey) {
      case 'device.health': return this.routers.list(tenantId);
      case 'session.list': return this.sessions.list(tenantId,'ACTIVE',100);
      case 'session.disconnect': {
        const id=this.requiredId(input,'sessionId');
        return this.sessions.end(tenantId,id,context);
      }
      case 'subscriber.inspect': {
        const id=this.requiredId(input,'customerId');
        const r=await this.db.query('SELECT id,full_name AS "fullName",email,phone,is_active AS "isActive",created_at AS "createdAt" FROM customers WHERE tenant_id=$1 AND id=$2',[tenantId,id]);
        if(!r.rowCount) throw new NotFoundException('Customer not found');
        const access=await this.isp.listAccessBindings(tenantId,{page:1,limit:100,search:String(input.customerId)});
        return {customer:r.rows[0],access:access.data};
      }
      case 'bandwidth.inspect': return this.routers.list(tenantId);
      case 'incident.investigate': return this.incidents.list(tenantId);
      case 'security.audit': return this.audit.list(tenantId,200);
      case 'payment.reconcile': {
        const r=await this.db.query('SELECT status,COUNT(*)::int AS count,COALESCE(SUM(amount),0)::numeric AS amount FROM payments WHERE tenant_id=$1 GROUP BY status ORDER BY status',[tenantId]);
        return {paymentStates:r.rows,correlationId};
      }
      case 'hotspot.users': return this.sessions.list(tenantId,'ACTIVE',500);
      default: throw new BadRequestException(`AI tool not executable yet: ${toolKey}`);
    }
  }

  private requiredId(input:Record<string,unknown>,key:string) {
    const value=input[key]; if(typeof value!=='string'||!value.trim()) throw new BadRequestException(`${key} is required`); return value;
  }

  private async tryModelPlan(task:string,context:Record<string,unknown>):Promise<{plan:AiPlan;provider:string;model:string|null;inputTokens?:number;outputTokens?:number}|null> {
    const provider=(this.config.get<string>('JASLYN_AI_PROVIDER') ?? this.config.get<string>('AI_PROVIDER') ?? '').trim().toLowerCase();
    const llamafileConfigured=Boolean(this.config.get<string>('JASLYN_LLAMAFILE_ENDPOINT')?.trim());
    const anthropicKey=(this.config.get<string>('JASLYN_AI_API_KEY') ?? this.config.get<string>('ANTHROPIC_API_KEY') ?? '').trim();

    if(provider==='deterministic' || (!provider && !llamafileConfigured && !anthropicKey)) return null;

    if(provider==='llamafile' || (!provider && llamafileConfigured)) {
      const result=await this.llamafile.plan(task,context,this.tools(''));
      this.validatePlan(result.plan);
      return {plan:result.plan,provider:'llamafile',model:result.model,inputTokens:result.inputTokens,outputTokens:result.outputTokens};
    }

    if(provider && provider!=='anthropic') throw new Error(`Unsupported JASLYN AI provider: ${provider}`);
    if(!anthropicKey) throw new Error('Anthropic AI provider is configured but JASLYN_AI_API_KEY is missing');
    const key=anthropicKey;
    const model=this.config.get<string>('JASLYN_AI_MODEL', this.config.get<string>('ANTHROPIC_MODEL','claude-sonnet-4-5'));
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),15000);
    try {
      const response=await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',
        headers:{'content-type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},
        body:JSON.stringify({
          model,
          max_tokens:1800,
          system:'You are the JASLYN NET operations planner. Return ONLY valid JSON matching {summary:string,steps:[{title,agent,capability,toolKey,risk,requiresApproval,verify}],stopConditions:string[]}. Use only the supplied tool keys. Never invent tools. HIGH and CRITICAL require approval.',
          messages:[{role:'user',content:JSON.stringify({task,context,tools:this.tools('')})}],
        }),
        signal:controller.signal,
      });
      if(!response.ok) throw new Error(`Anthropic planning failed: ${response.status}`);
      const payload=await response.json() as {content?:Array<{text?:string}>};
      const raw=payload.content?.find(x=>x.text)?.text?.trim();
      if(!raw) return null;
      const parsed=JSON.parse(raw) as AiPlan;
      this.validatePlan(parsed);
      return {plan:parsed,provider:'anthropic',model};
    } finally {
      clearTimeout(timeout);
    }
  }

  private validatePlan(plan:AiPlan) {
    if(!plan||typeof plan.summary!=='string'||!Array.isArray(plan.steps)||!Array.isArray(plan.stopConditions)) throw new Error('Invalid AI plan');
    const allowedTools=new Set<string>(TOOLS.map(x=>x[0]));
    const allowedAgents=new Set<string>(AGENTS.map(x=>x[0]));
    const allowedRisks=new Set<string>(['LOW','MEDIUM','HIGH','CRITICAL']);
    if(!plan.steps.length) throw new Error('Invalid AI plan: no executable steps');
    for(const step of plan.steps) {
      if(!step||typeof step.title!=='string'||typeof step.agent!=='string'||typeof step.capability!=='string'||typeof step.toolKey!=='string'||typeof step.verify!=='string'||typeof step.requiresApproval!=='boolean') throw new Error('Invalid AI plan step');
      if(!allowedTools.has(step.toolKey)) throw new Error('AI plan referenced an unavailable tool');
      if(!allowedAgents.has(step.agent)) throw new Error('AI plan referenced an unavailable agent');
      if(!allowedRisks.has(step.risk)) throw new Error('AI plan referenced an invalid risk level');
      if((step.risk==='HIGH'||step.risk==='CRITICAL') && !step.requiresApproval) step.requiresApproval=true;
    }
  }

  private buildPlan(task:string):AiPlan {
    const text=task.toLowerCase(); const steps:AiPlanStep[]=[];
    const add=(title:string,agent:AiAgentKey,capability:string,toolKey:string,risk:AiRiskLevel,verify:string)=>steps.push({id:randomUUID(),title,agent,capability,toolKey,risk,requiresApproval:risk==='HIGH'||risk==='CRITICAL',verify});
    if(/slow|latency|packet loss|offline|router|wan|bandwidth|network/.test(text)) { add('Inspect network health and evidence','monitoring','DEVICE.HEALTH','device.health','LOW','Re-read telemetry after inspection.'); add('Correlate the network incident','incident','INCIDENT.INVESTIGATE','incident.investigate','MEDIUM','Confirm evidence supports the incident.'); }
    if(/customer|subscriber|user|account|service/.test(text)) add('Inspect subscriber state','subscriber','SUBSCRIBER.INSPECT','subscriber.inspect','LOW','Confirm service and entitlement state.');
    if(/payment|paid|transaction|mpesa|airtel|tigo|reconcile/.test(text)) add('Reconcile payment lifecycle','payment','PAYMENT.RECONCILE','payment.reconcile','HIGH','Verify payment, ledger, purchase, entitlement and access state.');
    if(/radius|aaa|session|disconnect/.test(text)) add('Inspect AAA and session state','radius','SESSION.LIST','session.list','LOW','Verify session and accounting evidence.');
    if(/security|permission|tenant|audit|secret/.test(text)) add('Inspect security evidence','security','SECURITY.AUDIT','security.audit','MEDIUM','Confirm tenant and authorization boundaries.');
    if(/activate|suspend|limit|disconnect|change|reboot|remediate/.test(text)) add('Prepare controlled remediation','orchestrator','INCIDENT.REMEDIATE','incident.remediate','HIGH','Verify requested state and rollback availability.');
    if(!steps.length) add('Inspect relevant operational context','orchestrator','SECURITY.AUDIT','security.audit','MEDIUM','Return only evidence-backed findings.');
    return {summary:'Evidence-first JASLYN NET operational plan.',steps,stopConditions:['Stop when required evidence is unavailable.','Stop before high or critical actions without explicit approval.','Stop if tenant scope cannot be proven.','Verify every state-changing action before success.']};
  }

  private planRisk(plan:AiPlan):AiRiskLevel {
    if(plan.steps.some(s=>s.risk==='CRITICAL')) return 'CRITICAL';
    if(plan.steps.some(s=>s.risk==='HIGH')) return 'HIGH';
    if(plan.steps.some(s=>s.risk==='MEDIUM')) return 'MEDIUM';
    return 'LOW';
  }
}