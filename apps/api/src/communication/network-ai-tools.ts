import { BadRequestException, ForbiddenException, Inject, Injectable, RequestTimeoutException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditService } from '../audit/audit.service';
import { CommunicationCommandService } from './communication.command';

export type NetworkOperatorActor = { userId: string; tenantId: string; role: string };

export type CommandRisk = 'READ_ONLY' | 'LOW_RISK' | 'MODERATE_RISK' | 'HIGH_RISK' | 'DESTRUCTIVE';

export type NetworkToolName =
  | 'get_device' | 'list_devices' | 'get_device_health' | 'get_interface_status'
  | 'get_active_sessions' | 'get_subscriber' | 'get_incidents' | 'get_network_health'
  | 'get_bandwidth_usage' | 'search_audit_logs' | 'preview_network_command'
  | 'execute_network_command' | 'acknowledge_incident' | 'create_incident'
  | 'get_billing_status' | 'get_payment_status' | 'get_entitlement_status';

type ToolContract = {
  name: NetworkToolName;
  description: string;
  permission: string;
  risk: CommandRisk;
  timeoutMs: number;
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required: string[] };
};

type ToolCall = { id: string; name: NetworkToolName; input: Record<string, unknown> };

type ToolResult = {
  ok: boolean;
  verified: boolean;
  tool: NetworkToolName;
  tenantId: string;
  data?: unknown;
  error?: { code: string; message: string; retryable: boolean };
  risk: CommandRisk;
  requiresConfirmation?: boolean;
  commandId?: string;
};

const OPERATOR_ROLES = new Set(['OWNER', 'ADMIN', 'NETWORK_ADMIN', 'NOC_ENGINEER']);
const READ_ROLES = new Set(['OWNER', 'ADMIN', 'NETWORK_ADMIN', 'NOC_ENGINEER', 'BILLING_ADMIN', 'SUPPORT_AGENT']);
const TOOL_TIMEOUT_MS = 8_000;

@Injectable()
export class NetworkAiToolsService {
  constructor(
    @Inject(PG_POOL) private readonly db: Pool,
    private readonly audit: AuditService,
    private readonly commands: CommunicationCommandService,
  ) {}

  listTools(): ToolContract[] {
    const string = { type: 'string' };
    return [
      { name:'get_device', description:'Read one tenant-scoped network device.', permission:'network.devices.read', risk:'READ_ONLY', timeoutMs:TOOL_TIMEOUT_MS, inputSchema:{type:'object',properties:{deviceId:string},required:['deviceId']} },
      { name:'list_devices', description:'List tenant-scoped network devices with persisted state.', permission:'network.devices.read', risk:'READ_ONLY', timeoutMs:TOOL_TIMEOUT_MS, inputSchema:{type:'object',properties:{status:string,limit:{type:'number'}},required:[]} },
      { name:'get_device_health', description:'Read persisted device health and last-seen telemetry. Unreported metrics remain null.', permission:'network.health.read', risk:'READ_ONLY', timeoutMs:TOOL_TIMEOUT_MS, inputSchema:{type:'object',properties:{deviceId:string},required:['deviceId']} },
      { name:'get_interface_status', description:'Read persisted interface status for a device.', permission:'network.interfaces.read', risk:'READ_ONLY', timeoutMs:TOOL_TIMEOUT_MS, inputSchema:{type:'object',properties:{deviceId:string},required:['deviceId']} },
      { name:'get_active_sessions', description:'Read active subscriber sessions in the current tenant.', permission:'sessions.read', risk:'READ_ONLY', timeoutMs:TOOL_TIMEOUT_MS, inputSchema:{type:'object',properties:{deviceId:string,limit:{type:'number'}},required:[]} },
      { name:'get_subscriber', description:'Read one tenant-scoped subscriber.', permission:'subscribers.read', risk:'READ_ONLY', timeoutMs:TOOL_TIMEOUT_MS, inputSchema:{type:'object',properties:{subscriberId:string,username:string},required:[]} },
      { name:'get_incidents', description:'Read tenant-scoped incidents.', permission:'incidents.read', risk:'READ_ONLY', timeoutMs:TOOL_TIMEOUT_MS, inputSchema:{type:'object',properties:{status:string,severity:string,limit:{type:'number'}},required:[]} },
      { name:'get_network_health', description:'Read aggregate network health from persisted device/session/incident state.', permission:'network.health.read', risk:'READ_ONLY', timeoutMs:TOOL_TIMEOUT_MS, inputSchema:{type:'object',properties:{},required:[]} },
      { name:'get_bandwidth_usage', description:'Read persisted bandwidth/accounting samples only.', permission:'network.telemetry.read', risk:'READ_ONLY', timeoutMs:TOOL_TIMEOUT_MS, inputSchema:{type:'object',properties:{deviceId:string,subscriberId:string,limit:{type:'number'}},required:[]} },
      { name:'search_audit_logs', description:'Search tenant-scoped audit records.', permission:'audit.read', risk:'READ_ONLY', timeoutMs:TOOL_TIMEOUT_MS, inputSchema:{type:'object',properties:{query:string,limit:{type:'number'}},required:[]} },
      { name:'preview_network_command', description:'Validate and preview a controlled network command without executing it.', permission:'network.commands.preview', risk:'HIGH_RISK', timeoutMs:TOOL_TIMEOUT_MS, inputSchema:{type:'object',properties:{action:string,deviceId:string,sessionId:string,subscriberId:string},required:['action']} },
      { name:'execute_network_command', description:'Execute a controlled network command through the existing command fabric.', permission:'network.commands.execute', risk:'DESTRUCTIVE', timeoutMs:TOOL_TIMEOUT_MS, inputSchema:{type:'object',properties:{action:string,deviceId:string,sessionId:string,subscriberId:string,confirmationId:string},required:['action','confirmationId']} },
      { name:'acknowledge_incident', description:'Acknowledge an open incident.', permission:'incidents.acknowledge', risk:'LOW_RISK', timeoutMs:TOOL_TIMEOUT_MS, inputSchema:{type:'object',properties:{incidentId:string},required:['incidentId']} },
      { name:'create_incident', description:'Create an operational incident inside the current tenant.', permission:'incidents.create', risk:'MODERATE_RISK', timeoutMs:TOOL_TIMEOUT_MS, inputSchema:{type:'object',properties:{title:string,summary:string,severity:string,category:string,resourceType:string,resourceId:string},required:['title','summary','severity','category']} },
      { name:'get_billing_status', description:'Read persisted billing status for a subscriber.', permission:'billing.read', risk:'READ_ONLY', timeoutMs:TOOL_TIMEOUT_MS, inputSchema:{type:'object',properties:{subscriberId:string,username:string},required:[]} },
      { name:'get_payment_status', description:'Read persisted payment status for a subscriber or payment.', permission:'payments.read', risk:'READ_ONLY', timeoutMs:TOOL_TIMEOUT_MS, inputSchema:{type:'object',properties:{paymentId:string,subscriberId:string,username:string},required:[]} },
      { name:'get_entitlement_status', description:'Read persisted access entitlement status for a subscriber.', permission:'entitlements.read', risk:'READ_ONLY', timeoutMs:TOOL_TIMEOUT_MS, inputSchema:{type:'object',properties:{subscriberId:string,username:string},required:[]} },
    ];
  }

  async execute(actor: NetworkOperatorActor, call: ToolCall): Promise<ToolResult> {
    const contract = this.contract(call.name);
    this.assertActor(actor, contract);
    const started = Date.now();
    try {
      this.validateInput(contract, call.input);
      const data = await this.withTimeout(this.dispatch(actor, call), contract.timeoutMs);
      const result: ToolResult = { ok:true, verified:true, tool:call.name, tenantId:actor.tenantId, data, risk:contract.risk };
      await this.audit.record(actor.tenantId, `AI_TOOL_${call.name.toUpperCase()}_SUCCESS`, 'ai_tool', call.id, { tool:call.name, risk:contract.risk, durationMs:Date.now()-started }, { userId:actor.userId, requestId:call.id });
      return result;
    } catch (error) {
      const normalized = this.normalizeError(error);
      await this.audit.record(actor.tenantId, `AI_TOOL_${call.name.toUpperCase()}_FAILED`, 'ai_tool', call.id, { tool:call.name, risk:contract.risk, durationMs:Date.now()-started, error:normalized.code }, { userId:actor.userId, requestId:call.id });
      throw error;
    }
  }

  async preview(actor: NetworkOperatorActor, call: ToolCall): Promise<ToolResult> {
    const contract = this.contract('preview_network_command');
    this.assertActor(actor, contract);
    this.validateInput(contract, call.input);
    const command = this.commandFromInput(call.input);
    const data = await this.withTimeout(this.commands.execute(actor, command, false, call.id), contract.timeoutMs);
    return { ok:true, verified:true, tool:'preview_network_command', tenantId:actor.tenantId, data, risk:this.riskForAction(call.input.action as string), requiresConfirmation:true };
  }

  private contract(name: NetworkToolName) {
    const contract = this.listTools().find((item) => item.name === name);
    if (!contract) throw new BadRequestException('Unknown AI network tool');
    return contract;
  }

  private assertActor(actor: NetworkOperatorActor, contract: ToolContract) {
    if (!actor?.userId || !actor.tenantId || !actor.role) throw new ForbiddenException('Authenticated tenant operator context required');
    if (!READ_ROLES.has(actor.role)) throw new ForbiddenException('AI network tool permission denied');
    if (contract.permission.startsWith('network.commands') && !OPERATOR_ROLES.has(actor.role)) throw new ForbiddenException('Network command permission denied');
    if (contract.permission === 'audit.read' && !OPERATOR_ROLES.has(actor.role) && actor.role !== 'SUPPORT_AGENT') throw new ForbiddenException('Audit permission denied');
    if (contract.permission.startsWith('billing') && !['OWNER','ADMIN','BILLING_ADMIN','SUPPORT_AGENT'].includes(actor.role)) throw new ForbiddenException('Billing permission denied');
    if (contract.permission.startsWith('payments') && !['OWNER','ADMIN','BILLING_ADMIN','SUPPORT_AGENT'].includes(actor.role)) throw new ForbiddenException('Payment permission denied');
    if (contract.permission.startsWith('entitlements') && !['OWNER','ADMIN','BILLING_ADMIN','SUPPORT_AGENT','NETWORK_ADMIN','NOC_ENGINEER'].includes(actor.role)) throw new ForbiddenException('Entitlement permission denied');
    if (contract.risk === 'MODERATE_RISK' && !OPERATOR_ROLES.has(actor.role)) throw new ForbiddenException('Incident creation permission denied');
  }

  private validateInput(contract: ToolContract, input: Record<string, unknown>) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('Malformed AI tool input');
    for (const key of contract.inputSchema.required) {
      const value = input[key];
      if (typeof value !== 'string' && typeof value !== 'number') throw new BadRequestException(`Invalid AI tool input: ${key}`);
      if (typeof value === 'string' && (!value.trim() || value.length > 256)) throw new BadRequestException(`Invalid AI tool input: ${key}`);
    }
    for (const [key,value] of Object.entries(input)) {
      if (!contract.inputSchema.properties[key]) throw new BadRequestException(`Unexpected AI tool input: ${key}`);
      if (typeof value === 'string' && value.length > 1000) throw new BadRequestException(`Invalid AI tool input: ${key}`);
      if (key === 'limit' && (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 200)) throw new BadRequestException('Invalid limit');
    }
  }

  private riskForAction(action: string): CommandRisk {
    const normalized = action.trim().toLowerCase();
    if (['restart_router','reboot_router','shutdown_router','terminate_session','disconnect_session','suspend_subscriber','disable_account'].includes(normalized)) return 'DESTRUCTIVE';
    if (['change_bandwidth','change_qos','flush_cache','clear_sessions'].includes(normalized)) return 'HIGH_RISK';
    if (['enable_router','disable_interface','reset_interface'].includes(normalized)) return 'MODERATE_RISK';
    return 'LOW_RISK';
  }

  private commandFromInput(input: Record<string, unknown>): string {
    const action = this.string(input,'action').toLowerCase();
    if (action === 'terminate_session' || action === 'disconnect_session') return `terminate session ${this.string(input,'sessionId')}`;
    if (action === 'restart_router' || action === 'reboot_router' || action === 'shutdown_router') return `${action.replace('_',' ')} ${this.string(input,'deviceId')}`;
    throw new BadRequestException('Network action is not connected to a verified command fabric');
  }

  private async dispatch(actor: NetworkOperatorActor, call: ToolCall) {
    const i = call.input;
    switch(call.name) {
      case 'get_device': return this.db.query(`SELECT id,name,vendor,model,status,ip_address AS "ipAddress",mac_address::text AS "macAddress",active_users AS "activeUsers",last_seen_at AS "lastSeenAt",management_protocol AS "managementProtocol",management_enabled AS "managementEnabled",sync_error AS "syncError",updated_at AS "updatedAt" FROM routers WHERE tenant_id=$1 AND id=$2`,[actor.tenantId,this.string(i,'deviceId')]).then(this.oneOrUnavailable('device'));
      case 'list_devices': return this.db.query(`SELECT id,name,vendor,model,status,ip_address AS "ipAddress",active_users AS "activeUsers",last_seen_at AS "lastSeenAt",management_protocol AS "managementProtocol",management_enabled AS "managementEnabled",sync_error AS "syncError",updated_at AS "updatedAt" FROM routers WHERE tenant_id=$1 AND ($2::text IS NULL OR status=$2) ORDER BY name ASC LIMIT $3`,[actor.tenantId,this.optionalString(i,'status'),this.limit(i)]).then(r=>({count:r.rowCount ?? 0,data:r.rows}));
      case 'get_device_health': return this.db.query(`SELECT id,name,status,last_seen_at AS "lastSeenAt",active_users AS "activeUsers",updated_at AS "updatedAt",NULL::numeric AS "cpuPercent",NULL::numeric AS "memoryPercent",NULL::numeric AS "uptimeSeconds",NULL::numeric AS "latencyMs",NULL::numeric AS "packetLossPercent" FROM routers WHERE tenant_id=$1 AND id=$2`,[actor.tenantId,this.string(i,'deviceId')]).then(this.oneOrUnavailable('deviceHealth'));
      case 'get_interface_status': return { dataAvailable:false, source:'CURRENT_TELEMETRY_MODEL', message:'Interface-level status is not persisted by the current Jaslyn Net data model. No interface metrics were invented.' };
      case 'get_active_sessions': return this.db.query(`SELECT s.id,s.customer_id AS "subscriberId",s.router_id AS "deviceId",s.username,s.ip_address AS "ipAddress",s.mac_address::text AS "macAddress",s.started_at AS "startedAt",EXTRACT(EPOCH FROM (COALESCE(s.ended_at,now())-s.started_at))::int AS "durationSeconds",s.status FROM sessions s WHERE s.tenant_id=$1 AND s.status='ACTIVE' AND ($2::uuid IS NULL OR s.router_id=$2) ORDER BY s.started_at DESC LIMIT $3`,[actor.tenantId,this.optionalString(i,'deviceId'),this.limit(i)]).then(r=>({count:r.rowCount ?? 0,data:r.rows}));
      case 'get_subscriber': return this.subscriber(actor,i);
      case 'get_incidents': return this.db.query(`SELECT i.id,i.category,i.severity,i.status,i.title,i.summary,i.root_resource_type AS "rootResourceType",i.root_resource_id AS "rootResourceId",i.started_at AS "startedAt",i.acknowledged_at AS "acknowledgedAt",i.resolved_at AS "resolvedAt",i.updated_at AS "updatedAt" FROM incidents i WHERE i.tenant_id=$1 AND ($2::text IS NULL OR i.status=$2) AND ($3::text IS NULL OR i.severity=$3) ORDER BY i.updated_at DESC LIMIT $4`,[actor.tenantId,this.optionalString(i,'status'),this.optionalString(i,'severity'),this.limit(i)]).then(r=>({count:r.rowCount ?? 0,data:r.rows}));
      case 'get_network_health': return Promise.all([
        this.db.query(`SELECT COUNT(*)::int AS total,COUNT(*) FILTER (WHERE status='ONLINE')::int AS online,COUNT(*) FILTER (WHERE status='DEGRADED')::int AS degraded,COUNT(*) FILTER (WHERE status='OFFLINE')::int AS offline FROM routers WHERE tenant_id=$1`,[actor.tenantId]),
        this.db.query(`SELECT COUNT(*)::int AS active FROM sessions WHERE tenant_id=$1 AND status='ACTIVE'`,[actor.tenantId]),
        this.db.query(`SELECT COUNT(*)::int AS active FROM incidents WHERE tenant_id=$1 AND status IN ('OPEN','ACKNOWLEDGED')`,[actor.tenantId]),
        this.db.query(`SELECT COUNT(*)::int AS queued FROM network_commands WHERE tenant_id=$1 AND status IN ('QUEUED','SENT','ACCEPTED')`,[actor.tenantId]),
      ]).then(([d,s,n,c])=>({devices:d.rows[0],activeSessions:Number(s.rows[0]?.active||0),activeIncidents:Number(n.rows[0]?.active||0),queuedCommands:Number(c.rows[0]?.queued||0)}));
      case 'get_bandwidth_usage': return this.bandwidth(actor,i);
      case 'search_audit_logs': return this.db.query(`SELECT a.id,a.action,a.resource_type AS "resourceType",a.resource_id AS "resourceId",a.actor_user_id AS "actorUserId",a.request_id AS "requestId",a.correlation_id AS "correlationId",a.metadata,a.created_at AS "createdAt" FROM audit_logs a WHERE a.tenant_id=$1 AND ($2::text IS NULL OR a.action ILIKE '%'||$2||'%' OR a.resource_type ILIKE '%'||$2||'%' OR a.resource_id::text ILIKE '%'||$2||'%') ORDER BY a.created_at DESC LIMIT $3`,[actor.tenantId,this.optionalString(i,'query'),this.limit(i)]).then(r=>({count:r.rowCount ?? 0,data:r.rows}));
      case 'preview_network_command': return this.preview(actor,call);
      case 'execute_network_command': return this.executeCommand(actor,call);
      case 'acknowledge_incident': return this.acknowledgeIncident(actor,this.string(i,'incidentId'),call.id);
      case 'create_incident': return this.createIncident(actor,i,call.id);
      case 'get_billing_status': return this.billing(actor,i);
      case 'get_payment_status': return this.payment(actor,i);
      case 'get_entitlement_status': return this.entitlement(actor,i);
    }
  }

  private async executeCommand(actor: NetworkOperatorActor, call: ToolCall) {
    const action = this.string(call.input,'action');
    const risk = this.riskForAction(action);
    if (risk !== 'DESTRUCTIVE') throw new ForbiddenException('Only explicitly authorized destructive commands may use execute_network_command');
    const confirmationId = this.string(call.input,'confirmationId');
    if (confirmationId !== call.id) throw new ForbiddenException('Confirmation does not match this command execution');
    const command = this.commandFromInput(call.input);
    const result = await this.commands.execute(actor,command,true,call.id);
    if (result?.status !== 'QUEUED') throw new BadRequestException('Network command did not enter the verified command queue');
    return { ...result, risk, verified:false, confirmationId };
  }

  private async acknowledgeIncident(actor: NetworkOperatorActor, incidentId: string, requestId: string) {
    const result = await this.db.query(`UPDATE incidents SET status='ACKNOWLEDGED',acknowledged_at=COALESCE(acknowledged_at,now()),updated_at=now() WHERE tenant_id=$1 AND id=$2 AND status='OPEN' RETURNING id,status,acknowledged_at AS "acknowledgedAt"`,[actor.tenantId,incidentId]);
    if (!result.rowCount) throw new BadRequestException('Open incident not found');
    await this.audit.record(actor.tenantId,'AI_INCIDENT_ACKNOWLEDGED','incident',incidentId,{source:'AI_NETWORK_TOOL'},{userId:actor.userId,requestId});
    return {verified:true,data:result.rows[0]};
  }

  private async createIncident(actor: NetworkOperatorActor, input: Record<string,unknown>, requestId:string) {
    const severity=this.string(input,'severity').toUpperCase();
    const category=this.string(input,'category').toUpperCase();
    if (!['INFO','WARNING','CRITICAL'].includes(severity)) throw new BadRequestException('Invalid incident severity');
    const fingerprint=`ai-created:${actor.tenantId}:${this.string(input,'title').toLowerCase().replace(/\\s+/g,'-').slice(0,80)}`;
    const result=await this.db.query(`INSERT INTO incidents (tenant_id,fingerprint,category,severity,status,title,summary,root_resource_type,root_resource_id,evidence) VALUES ($1,$2,$3,$4,'OPEN',$5,$6,$7,$8,$9::jsonb) RETURNING id,status,severity,title,summary,created_at AS "createdAt"`,[actor.tenantId,fingerprint,category,severity,this.string(input,'title'),this.string(input,'summary'),this.optionalString(input,'resourceType'),this.optionalString(input,'resourceId'),JSON.stringify({source:'AI_NETWORK_TOOL',actorUserId:actor.userId})]);
    await this.audit.record(actor.tenantId,'AI_INCIDENT_CREATED','incident',result.rows[0].id,{source:'AI_NETWORK_TOOL',severity,category},{userId:actor.userId,requestId});
    return {verified:true,data:result.rows[0]};
  }

  private async subscriber(actor:NetworkOperatorActor,input:Record<string,unknown>) {
    const id=this.optionalString(input,'subscriberId');
    const username=this.optionalString(input,'username');
    if (!id && !username) throw new BadRequestException('subscriberId or username is required');
    const r=await this.db.query(`SELECT id,full_name AS "fullName",username,phone,email,is_active AS "isActive",created_at AS "createdAt" FROM customers WHERE tenant_id=$1 AND ($2::uuid IS NULL OR id=$2) AND ($3::text IS NULL OR username=$3) LIMIT 1`,[actor.tenantId,id,username]);
    return this.oneOrUnavailable('subscriber')(r);
  }

  private async bandwidth(actor:NetworkOperatorActor,input:Record<string,unknown>) {
    const deviceId=this.optionalString(input,'deviceId');
    const subscriberId=this.optionalString(input,'subscriberId');
    const r=await this.db.query(`SELECT t.session_id AS "sessionId",t.router_id AS "deviceId",t.sampled_at AS "sampledAt",t.bytes_in AS "bytesIn",t.bytes_out AS "bytesOut" FROM traffic_samples t WHERE t.tenant_id=$1 AND ($2::uuid IS NULL OR t.router_id=$2) AND ($3::uuid IS NULL OR t.customer_id=$3) ORDER BY t.sampled_at DESC LIMIT $4`,[actor.tenantId,deviceId,subscriberId,this.limit(input)]);
    return {count:r.rowCount ?? 0,data:r.rows,source:'persisted_traffic_samples'};
  }

  private async billing(actor:NetworkOperatorActor,input:Record<string,unknown>) {
    const subscriber=await this.subscriber(actor,input);
    if (!subscriber?.data) return subscriber;
    const id=(subscriber.data as any).id;
    const r=await this.db.query(`SELECT id,total,paid_amount AS "paidAmount",currency,status,issued_at AS "issuedAt",due_at AS "dueAt" FROM invoices WHERE tenant_id=$1 AND customer_id=$2 ORDER BY issued_at DESC LIMIT 20`,[actor.tenantId,id]);
    return {subscriber:subscriber.data,invoices:r.rows};
  }

  private async payment(actor:NetworkOperatorActor,input:Record<string,unknown>) {
    const paymentId=this.optionalString(input,'paymentId');
    if(paymentId) return this.db.query(`SELECT id,customer_id AS "subscriberId",amount,currency,provider,provider_reference AS "reference",status,verification_status AS "verificationStatus",verified_at AS "verifiedAt",created_at AS "createdAt" FROM payments WHERE tenant_id=$1 AND id=$2 LIMIT 1`,[actor.tenantId,paymentId]).then(this.oneOrUnavailable('payment'));
    const subscriber=await this.subscriber(actor,input);
    if(!subscriber?.data) return subscriber;
    const r=await this.db.query(`SELECT id,customer_id AS "subscriberId",amount,currency,provider,provider_reference AS "reference",status,verification_status AS "verificationStatus",verified_at AS "verifiedAt",created_at AS "createdAt" FROM payments WHERE tenant_id=$1 AND customer_id=$2 ORDER BY created_at DESC LIMIT 20`,[actor.tenantId,(subscriber.data as any).id]);
    return {count:r.rowCount ?? 0,data:r.rows};
  }

  private async entitlement(actor:NetworkOperatorActor,input:Record<string,unknown>) {
    const subscriber=await this.subscriber(actor,input);
    if(!subscriber?.data) return subscriber;
    const r=await this.db.query(`SELECT id,customer_id AS "subscriberId",router_id AS "deviceId",purchase_id AS "purchaseId",status,starts_at AS "startsAt",ends_at AS "endsAt",created_at AS "createdAt" FROM access_grants WHERE tenant_id=$1 AND customer_id=$2 ORDER BY created_at DESC LIMIT 20`,[actor.tenantId,(subscriber.data as any).id]);
    return {count:r.rowCount ?? 0,data:r.rows};
  }

  private oneOrUnavailable(label:string){ return (r:any)=>r.rowCount ? {data:r.rows[0]} : {dataAvailable:false,message:`No ${label} found.`}; }
  private string(input:Record<string,unknown>,key:string){const v=input[key];if(typeof v!=='string'||!v.trim())throw new BadRequestException(`Invalid AI tool input: ${key}`);return v.trim();}
  private optionalString(input:Record<string,unknown>,key:string){const v=input[key];return typeof v==='string'&&v.trim()?v.trim():null;}
  private limit(input:Record<string,unknown>){const v=input.limit;return typeof v==='number'&&Number.isInteger(v)&&v>0&&v<=200?v:50;}
  private normalizeError(error:unknown){if(error instanceof RequestTimeoutException)return {code:'TIMEOUT',message:'AI network tool timed out',retryable:true};if(error instanceof BadRequestException)return {code:'BAD_REQUEST',message:error.message,retryable:false};if(error instanceof ForbiddenException)return {code:'FORBIDDEN',message:error.message,retryable:false};return {code:'PROVIDER_OR_DATA_ERROR',message:error instanceof Error?error.message:'AI network tool failed',retryable:true};}
  private async withTimeout<T>(promise:Promise<T>,ms:number){let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([promise,new Promise<T>((_,reject)=>{timer=setTimeout(()=>reject(new RequestTimeoutException('AI network tool timed out')),ms);})]);}finally{if(timer)clearTimeout(timer);}}
}
