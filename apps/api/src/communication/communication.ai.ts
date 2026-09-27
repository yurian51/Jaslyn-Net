import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { PG_POOL } from '../database/database.module';
import { AuditService } from '../audit/audit.service';
import { CommunicationCommandService } from './communication.command';
import { CommunicationService } from './communication.service';

type Actor = { userId: string; tenantId: string; role: string };

type ToolDefinition = {
  name: string;
  description: string;
  input_schema: { type: 'object'; properties: Record<string, unknown>; required: string[] };
  requiresConfirmation: boolean;
  permission: string;
};

type ToolCall = { id: string; name: string; input: Record<string, unknown> };

const OPERATOR_ROLES = new Set(['OWNER','ADMIN','NETWORK_ADMIN','NOC_ENGINEER','BILLING_ADMIN','SUPPORT_AGENT']);

@Injectable()
export class CommunicationAiService {
  private readonly provider: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly endpoint: string;

  constructor(
    @Inject(PG_POOL) private readonly db: Pool,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly communication: CommunicationService,
    private readonly commands: CommunicationCommandService,
  ) {
    this.provider = this.config.get<string>('JASLYN_AI_PROVIDER', '').trim().toLowerCase();
    this.apiKey = this.config.get<string>('JASLYN_AI_API_KEY', '').trim();
    this.model = this.config.get<string>('JASLYN_AI_MODEL', 'claude-sonnet-4-5').trim();
    this.endpoint = this.config.get<string>('JASLYN_AI_ENDPOINT', 'https://api.anthropic.com/v1/messages').trim();
  }

  private tools(): ToolDefinition[] {
    return [
      { name:'getSubscriber', description:'Get verified subscriber/customer information by username.', permission:'subscribers.read', requiresConfirmation:false,
        input_schema:{type:'object',properties:{username:{type:'string'}},required:['username']} },
      { name:'getInvoice', description:'Get verified invoice information by invoice id.', permission:'billing.read', requiresConfirmation:false,
        input_schema:{type:'object',properties:{invoiceId:{type:'string'}},required:['invoiceId']} },
      { name:'getPayment', description:'Get verified payment information by payment id.', permission:'payments.read', requiresConfirmation:false,
        input_schema:{type:'object',properties:{paymentId:{type:'string'}},required:['paymentId']} },
      { name:'getPackage', description:'Get the latest verified package purchase for a subscriber username.', permission:'billing.read', requiresConfirmation:false,
        input_schema:{type:'object',properties:{username:{type:'string'}},required:['username']} },
      { name:'getSession', description:'Get a verified active session by session id.', permission:'sessions.read', requiresConfirmation:false,
        input_schema:{type:'object',properties:{sessionId:{type:'string'}},required:['sessionId']} },
      { name:'getRouter', description:'Get verified router state by router id.', permission:'network.read', requiresConfirmation:false,
        input_schema:{type:'object',properties:{routerId:{type:'string'}},required:['routerId']} },
      { name:'getNetworkStatus', description:'Get verified tenant network status counts.', permission:'network.read', requiresConfirmation:false,
        input_schema:{type:'object',properties:{},required:[]} },
      { name:'getIncident', description:'Get a verified incident and its impacts.', permission:'incidents.read', requiresConfirmation:false,
        input_schema:{type:'object',properties:{incidentId:{type:'string'}},required:['incidentId']} },
      { name:'createTicket', description:'Create a support ticket for a verified subscriber.', permission:'support.write', requiresConfirmation:false,
        input_schema:{type:'object',properties:{subject:{type:'string'},category:{type:'string'},customerId:{type:'string'},priority:{type:'string'}},required:['subject','category']} },
      { name:'sendMessage', description:'Send a communication message to a conversation the actor can access.', permission:'messages.send', requiresConfirmation:false,
        input_schema:{type:'object',properties:{conversationId:{type:'string'},body:{type:'string'}},required:['conversationId','body']} },
      { name:'scheduleMessage', description:'Schedule a message in a conversation the actor can access.', permission:'messages.schedule', requiresConfirmation:false,
        input_schema:{type:'object',properties:{conversationId:{type:'string'},body:{type:'string'},scheduledAt:{type:'string'},timezone:{type:'string'}},required:['conversationId','body','scheduledAt']} },
      { name:'terminateSession', description:'Disconnect an active subscriber session through the existing Network Command Fabric. This is destructive and always requires human confirmation.', permission:'network.commands.execute', requiresConfirmation:true,
        input_schema:{type:'object',properties:{sessionId:{type:'string'}},required:['sessionId']} },
    ];
  }

  listTools() {
    return this.tools().map(({name,description,input_schema,requiresConfirmation,permission}) => ({name,description,inputSchema:input_schema,requiresConfirmation,permission}));
  }

  async chat(actor: Actor, prompt: string, conversationId?: string) {
    const text = prompt.trim();
    if (!text || text.length > 8000) throw new BadRequestException('AI prompt must contain 1-8000 characters');
    const aiConversationId = await this.ensureConversation(actor, conversationId);
    await this.db.query(
      `INSERT INTO ai_messages (tenant_id,ai_conversation_id,role,content,verified,metadata)
       VALUES ($1,$2,'USER',$3,false,$4::jsonb)`,
      [actor.tenantId,aiConversationId,text,JSON.stringify({requestId:randomUUID()})],
    );

    if (this.provider !== 'anthropic' || !this.apiKey) {
      const message = 'AI provider is not configured. Verified command tools remain available through Command Chat; no AI-generated answer was produced.';
      await this.storeAssistant(actor,aiConversationId,message,false,{providerConfigured:false});
      return { status:'UNAVAILABLE', verified:false, conversationId:aiConversationId, message, tools:this.listTools() };
    }

    const response = await this.callProvider(actor, aiConversationId);
    if (!response.toolCall) {
      await this.storeAssistant(actor,aiConversationId,response.text,false,{provider:this.provider});
      return { status:'SUCCESS', verified:false, conversationId:aiConversationId, message:response.text };
    }

    const tool = this.tools().find(item => item.name === response.toolCall!.name);
    if (!tool) throw new BadRequestException('AI selected an unavailable tool');
    this.assertPermission(actor,tool);

    const executionId = randomUUID();
    if (tool.requiresConfirmation) {
      const preview = await this.previewTool(actor,response.toolCall!);
      await this.db.query(
        `INSERT INTO ai_executions
          (id,tenant_id,ai_conversation_id,actor_user_id,tool_name,input,output,status,requires_confirmation,request_id)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,'AWAITING_CONFIRMATION',true,$8)`,
        [executionId,actor.tenantId,aiConversationId,actor.userId,tool.name,JSON.stringify(response.toolCall.input),JSON.stringify(preview),executionId],
      );
      await this.storeAssistant(actor,aiConversationId,'Confirmation required before this operational action can execute.',true,{executionId,tool:tool.name,preview});
      return { status:'AWAITING_CONFIRMATION', verified:true, conversationId:aiConversationId, executionId, tool:tool.name, preview };
    }

    const output = await this.executeTool(actor,response.toolCall!);
    await this.db.query(
      `INSERT INTO ai_executions
        (id,tenant_id,ai_conversation_id,actor_user_id,tool_name,input,output,status,requires_confirmation,confirmed_at,request_id,completed_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,'SUCCESS',false,now(),$8,$9)`,
      [executionId,actor.tenantId,aiConversationId,actor.userId,tool.name,JSON.stringify(response.toolCall.input),JSON.stringify(output),executionId,new Date()],
    );
    await this.storeAssistant(actor,aiConversationId,'Verified tool result returned. The result below is sourced from Jaslyn Net data.',true,{tool:tool.name});
    await this.db.query(
      `INSERT INTO ai_messages (tenant_id,ai_conversation_id,role,content,verified,metadata)
       VALUES ($1,$2,'TOOL',$3,true,$4::jsonb)`,
      [actor.tenantId,aiConversationId,JSON.stringify(output),JSON.stringify({tool:tool.name,executionId})],
    );
    return { status:'SUCCESS', verified:true, conversationId:aiConversationId, executionId, tool:tool.name, result:output };
  }

  async confirm(actor: Actor, executionId: string) {
    // SELECT ... FOR UPDATE only provides protection while a transaction is open.
    // Keep the confirmation claim and terminal state transition on the same connection
    // so two concurrent confirmations cannot execute the destructive tool twice.
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const row = await client.query(
        `SELECT id,ai_conversation_id AS "conversationId",tool_name AS "toolName",input,status
         FROM ai_executions
         WHERE tenant_id=$1 AND id=$2 AND actor_user_id=$3
         FOR UPDATE`,
        [actor.tenantId,executionId,actor.userId],
      );
      if (!row.rowCount) {
        await client.query('ROLLBACK');
        throw new NotFoundException('AI execution not found');
      }
      if (row.rows[0].status !== 'AWAITING_CONFIRMATION') {
        await client.query('ROLLBACK');
        throw new BadRequestException('AI execution is no longer awaiting confirmation');
      }

      const tool = this.tools().find(item => item.name === row.rows[0].toolName);
      if (!tool?.requiresConfirmation) {
        await client.query('ROLLBACK');
        throw new BadRequestException('Execution does not require confirmation');
      }
      this.assertPermission(actor,tool);

      const call: ToolCall = { id:executionId,name:tool.name,input:row.rows[0].input };
      try {
        const result = await this.executeTool(actor,call);
        await client.query(
          `UPDATE ai_executions SET status='SUCCESS',confirmed_at=now(),output=$3::jsonb,completed_at=now()
           WHERE tenant_id=$1 AND id=$2 AND status='AWAITING_CONFIRMATION'`,
          [actor.tenantId,executionId,JSON.stringify(result)],
        );
        await client.query('COMMIT');
        await this.audit.record(actor.tenantId,'AI_COMMAND_EXECUTED','ai_execution',executionId,{tool:tool.name,result},{userId:actor.userId,requestId:executionId});
        return { status:'SUCCESS',verified:true,executionId,tool:tool.name,result };
      } catch (error) {
        await client.query(
          `UPDATE ai_executions SET status='FAILED',output=$3::jsonb,completed_at=now()
           WHERE tenant_id=$1 AND id=$2 AND status='AWAITING_CONFIRMATION'`,
          [actor.tenantId,executionId,JSON.stringify({error:error instanceof Error ? error.message : String(error)})],
        );
        await client.query('COMMIT');
        throw error;
      }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async ensureConversation(actor: Actor, id?: string) {
    if (id) {
      const existing = await this.db.query(
        'SELECT id FROM ai_conversations WHERE tenant_id=$1 AND id=$2 AND user_id=$3 AND status=\'ACTIVE\'',
        [actor.tenantId,id,actor.userId],
      );
      if (!existing.rowCount) throw new NotFoundException('AI conversation not found');
      return id;
    }
    const result = await this.db.query(
      `INSERT INTO ai_conversations (tenant_id,user_id,title) VALUES ($1,$2,$3) RETURNING id`,
      [actor.tenantId,actor.userId,'Jaslyn Command Chat'],
    );
    return result.rows[0].id as string;
  }

  private async storeAssistant(actor: Actor, conversationId: string, content: string, verified: boolean, metadata: Record<string, unknown>) {
    await this.db.query(
      `INSERT INTO ai_messages (tenant_id,ai_conversation_id,role,content,verified,metadata)
       VALUES ($1,$2,'ASSISTANT',$3,$4,$5::jsonb)`,
      [actor.tenantId,conversationId,content,verified,JSON.stringify(metadata)],
    );
  }

  private assertPermission(actor: Actor, tool: ToolDefinition) {
    if (tool.permission === 'network.commands.execute' && !OPERATOR_ROLES.has(actor.role)) {
      throw new ForbiddenException('Network command permission required');
    }
    if (['billing.read','payments.read'].includes(tool.permission) && !OPERATOR_ROLES.has(actor.role) && !['SUPPORT_AGENT','BILLING_ADMIN'].includes(actor.role)) {
      throw new ForbiddenException('Financial data permission required');
    }
  }

  private async previewTool(actor: Actor, call: ToolCall) {
    if (call.name !== 'terminateSession') throw new BadRequestException('Unsupported confirmation tool');
    const sessionId = this.stringInput(call.input,'sessionId');
    return this.commands.execute(actor,`terminate session ${sessionId}`,false);
  }

  private async executeTool(actor: Actor, call: ToolCall) {
    switch(call.name) {
      case 'getSubscriber': return this.getSubscriber(actor,this.stringInput(call.input,'username'));
      case 'getInvoice': return this.getInvoice(actor,this.stringInput(call.input,'invoiceId'));
      case 'getPayment': return this.getPayment(actor,this.stringInput(call.input,'paymentId'));
      case 'getPackage': return this.getPackage(actor,this.stringInput(call.input,'username'));
      case 'getSession': return this.getSession(actor,this.stringInput(call.input,'sessionId'));
      case 'getRouter': return this.getRouter(actor,this.stringInput(call.input,'routerId'));
      case 'getNetworkStatus': return this.getNetworkStatus(actor);
      case 'getIncident': return this.getIncident(actor,this.stringInput(call.input,'incidentId'));
      case 'createTicket': return this.createTicket(actor,call.input);
      case 'sendMessage': return this.communication.sendMessage(actor,this.stringInput(call.input,'conversationId'),{body:this.stringInput(call.input,'body'),idempotencyKey:`ai:${call.id}`});
      case 'scheduleMessage': return this.communication.scheduleMessage(actor,this.stringInput(call.input,'conversationId'),{body:this.stringInput(call.input,'body'),scheduledAt:this.stringInput(call.input,'scheduledAt'),timezone:typeof call.input.timezone==='string'?call.input.timezone:undefined});
      case 'terminateSession': return this.commands.execute(actor,`terminate session ${this.stringInput(call.input,'sessionId')}`,true);
      default: throw new BadRequestException(`Unknown AI tool: ${call.name}`);
    }
  }

  private async getSubscriber(actor: Actor, username: string) {
    const result = await this.db.query(
      `SELECT id,full_name AS "fullName",username,phone,email,is_active AS "isActive",created_at AS "createdAt"
       FROM customers WHERE tenant_id=$1 AND username=$2 LIMIT 1`,
      [actor.tenantId,username],
    );
    return result.rowCount ? {verified:true,data:result.rows[0]} : {verified:true,dataAvailable:false,message:'No subscriber found.'};
  }

  private async getInvoice(actor: Actor, invoiceId: string) {
    const result = await this.db.query(
      `SELECT id,customer_id AS "customerId",total,paid_amount AS "paidAmount",currency,status,issued_at AS "issuedAt",due_at AS "dueAt"
       FROM invoices WHERE tenant_id=$1 AND id=$2 LIMIT 1`,
      [actor.tenantId,invoiceId],
    );
    return result.rowCount ? {verified:true,data:result.rows[0]} : {verified:true,dataAvailable:false,message:'No invoice found.'};
  }

  private async getPayment(actor: Actor, paymentId: string) {
    const result = await this.db.query(
      `SELECT id,customer_id AS "customerId",amount,currency,provider,provider_reference AS "reference",status,created_at AS "createdAt"
       FROM payments WHERE tenant_id=$1 AND id=$2 LIMIT 1`,
      [actor.tenantId,paymentId],
    );
    return result.rowCount ? {verified:true,data:result.rows[0]} : {verified:true,dataAvailable:false,message:'No payment found.'};
  }

  private async getPackage(actor: Actor, username: string) {
    const result = await this.db.query(
      `SELECT p.id,p.status,p.starts_at AS "startsAt",p.ends_at AS "endsAt",pkg.name AS "packageName",pkg.download_bps AS "downloadBps",pkg.upload_bps AS "uploadBps",p.price,p.currency
       FROM wifi_plan_purchases p
       JOIN customers c ON c.tenant_id=p.tenant_id AND c.id=p.customer_id
       JOIN packages pkg ON pkg.tenant_id=p.tenant_id AND pkg.id=p.package_id
       WHERE p.tenant_id=$1 AND c.username=$2 ORDER BY p.created_at DESC LIMIT 1`,
      [actor.tenantId,username],
    );
    return result.rowCount ? {verified:true,data:result.rows[0]} : {verified:true,dataAvailable:false,message:'No package purchase found.'};
  }

  private async getSession(actor: Actor, sessionId: string) {
    const result = await this.db.query(
      `SELECT s.id,s.customer_id AS "customerId",s.router_id AS "routerId",s.username,s.ip_address AS "ipAddress",s.mac_address::text AS "macAddress",s.status,s.started_at AS "startedAt",s.ended_at AS "endedAt"
       FROM sessions s WHERE s.tenant_id=$1 AND s.id=$2 LIMIT 1`,
      [actor.tenantId,sessionId],
    );
    return result.rowCount ? {verified:true,data:result.rows[0]} : {verified:true,dataAvailable:false,message:'No session found.'};
  }

  private async getRouter(actor: Actor, routerId: string) {
    const result = await this.db.query(
      `SELECT id,name,status,vendor,model,active_users AS "activeUsers",last_seen_at AS "lastSeenAt",updated_at AS "updatedAt"
       FROM routers WHERE tenant_id=$1 AND id=$2 LIMIT 1`,
      [actor.tenantId,routerId],
    );
    return result.rowCount ? {verified:true,data:result.rows[0]} : {verified:true,dataAvailable:false,message:'No router found.'};
  }

  private async getNetworkStatus(actor: Actor) {
    const [routers,sessions,incidents] = await Promise.all([
      this.db.query(`SELECT COUNT(*)::int AS total,COUNT(*) FILTER (WHERE status='ONLINE')::int AS online,COUNT(*) FILTER (WHERE status='OFFLINE')::int AS offline FROM routers WHERE tenant_id=$1`,[actor.tenantId]),
      this.db.query(`SELECT COUNT(*)::int AS active FROM sessions WHERE tenant_id=$1 AND status='ACTIVE'`,[actor.tenantId]),
      this.db.query(`SELECT COUNT(*)::int AS open FROM incidents WHERE tenant_id=$1 AND status IN ('OPEN','ACKNOWLEDGED')`,[actor.tenantId]),
    ]);
    return {verified:true,routers:routers.rows[0],sessions:sessions.rows[0],incidents:incidents.rows[0]};
  }

  private async getIncident(actor: Actor, incidentId: string) {
    const result = await this.db.query(
      `SELECT id,fingerprint,category,severity,status,title,summary,root_resource_type AS "rootResourceType",root_resource_id AS "rootResourceId",started_at AS "startedAt",last_seen_at AS "lastSeenAt",resolved_at AS "resolvedAt",resolution,evidence
       FROM incidents WHERE tenant_id=$1 AND id=$2 LIMIT 1`,
      [actor.tenantId,incidentId],
    );
    if (!result.rowCount) return {verified:true,dataAvailable:false,message:'No incident found.'};
    const impacts = await this.db.query(
      `SELECT resource_type AS "resourceType",resource_id AS "resourceId",impact_type AS "impactType",state,estimated_revenue AS "estimatedRevenue",evidence
       FROM incident_impacts WHERE tenant_id=$1 AND incident_id=$2 ORDER BY created_at ASC`,
      [actor.tenantId,incidentId],
    );
    return {verified:true,data:result.rows[0],impacts:impacts.rows};
  }

  private async createTicket(actor: Actor, input: Record<string, unknown>) {
    const subject=this.stringInput(input,'subject').slice(0,160);
    const category=this.stringInput(input,'category').slice(0,100);
    const customerId=typeof input.customerId==='string'?input.customerId:null;
    if(customerId){
      const customer=await this.db.query('SELECT id FROM customers WHERE tenant_id=$1 AND id=$2',[actor.tenantId,customerId]);
      if(!customer.rowCount) throw new NotFoundException('Subscriber not found');
    }
    const priority=typeof input.priority==='string' && ['LOW','NORMAL','HIGH','CRITICAL'].includes(input.priority.toUpperCase()) ? input.priority.toUpperCase() : 'NORMAL';
    const ticketNumber=`AI-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${randomUUID().slice(0,8).toUpperCase()}`;
    const result=await this.db.query(
      `INSERT INTO support_tickets (tenant_id,ticket_number,customer_id,category,priority,status,subject,created_by_user_id)
       VALUES ($1,$2,$3,$4,$5,'OPEN',$6,$7)
       RETURNING id,ticket_number AS "ticketNumber",customer_id AS "customerId",category,priority,status,subject,created_at AS "createdAt"`,
      [actor.tenantId,ticketNumber,customerId,category,priority,subject,actor.userId],
    );
    await this.audit.record(actor.tenantId,'SUPPORT_TICKET_CREATED','support_ticket',result.rows[0].id,{source:'AI_COMMAND_CHAT',ticketNumber},{userId:actor.userId});
    return {verified:true,data:result.rows[0]};
  }

  private stringInput(input: Record<string, unknown>, key: string) {
    const value=input[key];
    if(typeof value!=='string' || !value.trim() || value.length>1000) throw new BadRequestException(`Invalid AI tool input: ${key}`);
    return value.trim();
  }

  private async callProvider(actor: Actor, conversationId: string): Promise<{text:string;toolCall?:ToolCall}> {
    const history=await this.db.query(
      `SELECT role,content FROM ai_messages WHERE tenant_id=$1 AND ai_conversation_id=$2 ORDER BY created_at ASC LIMIT 30`,
      [actor.tenantId,conversationId],
    );
    const messages=history.rows
      .filter((row:any)=>row.role==='USER' || row.role==='ASSISTANT')
      .map((row:any)=>({role:row.role==='USER'?'user':'assistant',content:row.content}));
    const payload={
      model:this.model,
      max_tokens:1200,
      system:'You are Jaslyn Net Command Agent. Use tools only for verified platform data. Never invent operational, billing, subscriber, payment, RADIUS, router or incident facts. Destructive tools require confirmation and must never be executed from your own text. Clearly distinguish verified tool output from explanation. Never expose credentials or secrets.',
      messages,
      tools:this.tools().map(tool=>({name:tool.name,description:tool.description,input_schema:tool.input_schema})),
    };
    const response=await fetch(this.endpoint,{method:'POST',headers:{'content-type':'application/json','x-api-key':this.apiKey,'anthropic-version':'2023-06-01'},body:JSON.stringify(payload)});
    if(!response.ok) throw new BadRequestException(`AI provider request failed with HTTP ${response.status}`);
    const data=await response.json() as any;
    const blocks=Array.isArray(data?.content)?data.content:[];
    const toolBlock=blocks.find((block:any)=>block?.type==='tool_use');
    const text=blocks.filter((block:any)=>block?.type==='text').map((block:any)=>String(block.text)).join('\n').trim() || 'No verified response was produced.';
    return {
      text,
      toolCall:toolBlock ? {id:String(toolBlock.id),name:String(toolBlock.name),input:(toolBlock.input && typeof toolBlock.input==='object') ? toolBlock.input : {}} : undefined,
    };
  }
}
