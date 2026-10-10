import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { PG_POOL } from '../database/database.module';
import { AuditService } from '../audit/audit.service';
import { NetworkCommandService } from '../modules/traffic/network-command.service';

type Actor = { userId:string; tenantId:string; role:string };

const OPERATOR_ROLES = new Set(['OWNER','ADMIN','NETWORK_ADMIN','NOC_ENGINEER']);

@Injectable()
export class CommunicationCommandService {
  constructor(
    @Inject(PG_POOL) private readonly db: Pool,
    private readonly audit: AuditService,
    private readonly networkCommands: NetworkCommandService,
  ) {}

  async execute(actor: Actor, command: string, confirm = false, requestIdOverride?: string) {
    const normalized = command.trim().replace(/\s+/g,' ');
    if (!normalized || normalized.length > 500) throw new BadRequestException('Command is required');
    const requestId = requestIdOverride ?? randomUUID();

    const dangerous = /^(restart router|suspend subscriber|refund payment|terminate session|disable account|delete message|delete user)\b/i.test(normalized);
    if (dangerous && !OPERATOR_ROLES.has(actor.role)) {
      throw new ForbiddenException('Operator confirmation permission required');
    }
    if (dangerous && !confirm) {
      const preview = await this.previewDangerous(actor, normalized);
      await this.record(actor, normalized, 'AWAITING_CONFIRMATION', preview, requestId);
      return { status:'AWAITING_CONFIRMATION', command:normalized, requestId, preview };
    }

    const parts = normalized.split(' ');
    const verb = parts[0].toLowerCase();
    let result: Record<string, unknown>;

    if (verb === 'terminate' && parts[1]?.toLowerCase() === 'session') {
      if (!parts[2]) throw new BadRequestException('Usage: terminate session <session-id>');
      result = await this.queueSessionTermination(actor, parts[2], requestId);
    } else if (dangerous) {
      throw new ForbiddenException('This destructive command is not connected to a verified execution fabric');
    } else if (verb === '/status' || verb === 'status') {
      const active = await this.db.query(
        'SELECT COUNT(*)::int AS sessions FROM sessions WHERE tenant_id=$1 AND status=\'ACTIVE\'',
        [actor.tenantId],
      );
      const routers = await this.db.query(
        'SELECT COUNT(*) FILTER (WHERE status=\'ONLINE\')::int AS online, COUNT(*)::int AS total FROM routers WHERE tenant_id=$1',
        [actor.tenantId],
      );
      result = { verified:true, activeSessions:Number(active.rows[0]?.sessions||0), routers:{online:Number(routers.rows[0]?.online||0),total:Number(routers.rows[0]?.total||0)} };
    } else if (verb === '/router' || verb === 'router') {
      if (parts[1]?.toLowerCase() !== 'status' || !parts[2]) throw new BadRequestException('Usage: /router status <router-name>');
      const router = await this.db.query(
        'SELECT id,name,status,vendor,model,active_users AS "activeUsers",updated_at AS "updatedAt" FROM routers WHERE tenant_id=$1 AND name=$2 LIMIT 1',
        [actor.tenantId,parts.slice(2).join(' ')],
      );
      if (!router.rowCount) result = { verified:true, dataAvailable:false, message:'No data available for the requested router.' };
      else result = { verified:true, router:router.rows[0] };
    } else if (verb === '/balance' || verb === 'balance') {
      if (!parts[1]) throw new BadRequestException('Usage: /balance <customer-username>');
      const customer = await this.db.query('SELECT id,full_name AS "fullName",username FROM customers WHERE tenant_id=$1 AND username=$2 LIMIT 1',[actor.tenantId,parts[1]]);
      if (!customer.rowCount) result = { verified:true, dataAvailable:false, message:'No subscriber found.' };
      else {
        const invoices = await this.db.query(
          'SELECT COALESCE(SUM(total) FILTER (WHERE status IN (\'ISSUED\',\'PARTIALLY_PAID\',\'OVERDUE\')),0)::numeric AS outstanding,currency FROM invoices WHERE tenant_id=$1 AND customer_id=$2 GROUP BY currency',
          [actor.tenantId,customer.rows[0].id],
        );
        result = { verified:true, customer:customer.rows[0], outstanding:invoices.rows };
      }
    } else if (verb === '/payment' || verb === 'payment') {
      if (!parts[1]) throw new BadRequestException('Usage: /payment <customer-username>');
      const payment = await this.db.query(
        'SELECT p.id,p.amount,p.currency,p.provider,p.provider_reference AS "reference",p.status,p.created_at AS "createdAt" FROM payments p JOIN customers c ON c.tenant_id=p.tenant_id AND c.id=p.customer_id WHERE p.tenant_id=$1 AND c.username=$2 ORDER BY p.created_at DESC LIMIT 10',
        [actor.tenantId,parts[1]],
      );
      result = { verified:true, data:payment.rows };
    } else if (verb === '/package' || verb === 'package') {
      if (!parts[1]) throw new BadRequestException('Usage: /package <customer-username>');
      const purchase = await this.db.query(
        'SELECT p.id,p.status,p.starts_at AS "startsAt",p.ends_at AS "endsAt",pkg.name AS "packageName",pkg.download_bps AS "downloadBps",pkg.upload_bps AS "uploadBps",p.price,p.currency FROM wifi_plan_purchases p JOIN customers c ON c.tenant_id=p.tenant_id AND c.id=p.customer_id JOIN packages pkg ON pkg.tenant_id=p.tenant_id AND pkg.id=p.package_id WHERE p.tenant_id=$1 AND c.username=$2 ORDER BY p.created_at DESC LIMIT 1',
        [actor.tenantId,parts[1]],
      );
      result = { verified:true, data:purchase.rows };
    } else if (verb === '/support' || verb === 'support') {
      result = { verified:true, action:'OPEN_SUPPORT', message:'Support workflow is available through the Communication Center. No ticket was created by this read-only command.' };
    } else if (verb === 'show' && parts[1]?.toLowerCase()==='offline' && parts[2]?.toLowerCase()==='routers') {
      const routers = await this.db.query(
        'SELECT id,name,status,vendor,model,active_users AS "activeUsers",updated_at AS "updatedAt" FROM routers WHERE tenant_id=$1 AND status=\'OFFLINE\' ORDER BY updated_at DESC LIMIT 200',
        [actor.tenantId],
      );
      result = { verified:true, data:routers.rows, count:routers.rowCount??0 };
    } else {
      result = { verified:false, dataAvailable:false, message:'Insufficient verified data for this command.' };
    }

    await this.record(actor, normalized, 'SUCCESS', result, requestId);
    return { status:'SUCCESS', command:normalized, requestId, actor:actor.userId, resource:result.router ?? result.customer ?? null, result, timestamp:new Date().toISOString() };
  }

  private async queueSessionTermination(actor: Actor, sessionId: string, requestId: string) {
    const session = await this.db.query(
      `SELECT s.id,s.customer_id AS "customerId",s.router_id AS "routerId",s.username,
              s.ip_address AS "ipAddress",s.mac_address::text AS "macAddress",
              r.name AS "routerName",r.management_protocol AS "managementProtocol",
              r.management_enabled AS "managementEnabled",r.api_endpoint AS "apiEndpoint"
         FROM sessions s
         LEFT JOIN routers r ON r.tenant_id=s.tenant_id AND r.id=s.router_id
        WHERE s.tenant_id=$1 AND s.id=$2 AND s.status='ACTIVE'
        LIMIT 1`,
      [actor.tenantId, sessionId],
    );
    if (!session.rowCount) throw new BadRequestException('Active session not found or already ended');

    const row = session.rows[0];
    if (!row.routerId || !row.managementProtocol || row.managementEnabled !== true || !row.apiEndpoint) {
      throw new ForbiddenException('Session cannot be terminated: verified network management is unavailable');
    }

    const correlationId = `communication:terminate-session:${requestId}`;
    const queued = await this.networkCommands.queue(actor.tenantId, {
      routerId: row.routerId,
      commandType: 'DISCONNECT_SESSION',
      actor: actor.userId,
      provider: row.managementProtocol,
      correlationId,
      target: {
        sessionId: row.id,
        customerId: row.customerId,
        username: row.username,
        ipAddress: row.ipAddress,
        macAddress: row.macAddress,
      },
      request: { reason: 'OPERATOR_COMMAND', requestId },
    });

    return {
      verified: true,
      queued: true,
      commandId: queued.id,
      status: 'QUEUED',
      session: {
        id: row.id,
        customerId: row.customerId,
        routerId: row.routerId,
        routerName: row.routerName,
        username: row.username,
        ipAddress: row.ipAddress,
      },
      message: 'Session termination queued through the verified network command fabric.',
    };
  }

  private async previewDangerous(actor: Actor, command: string) {
    const parts = command.split(' ');
    const preview: Record<string, unknown> = {
      scope:'COMMAND',
      command,
      requiresConfirmation:true,
      actor:actor.userId,
      warning:'This operation can change service state and requires explicit confirmation.',
    };

    if (parts[0]?.toLowerCase() === 'terminate' && parts[1]?.toLowerCase() === 'session' && parts[2]) {
      const session = await this.db.query(
        `SELECT s.id,s.customer_id AS "customerId",s.router_id AS "routerId",s.username,
                s.ip_address AS "ipAddress",r.name AS "routerName",r.status AS "routerStatus"
           FROM sessions s
           LEFT JOIN routers r ON r.tenant_id=s.tenant_id AND r.id=s.router_id
          WHERE s.tenant_id=$1 AND s.id=$2 AND s.status='ACTIVE'`,
        [actor.tenantId,parts[2]],
      );
      if (!session.rowCount) return { ...preview, dataAvailable:false, message:'Active session not found.' };
      return {
        ...preview,
        dataAvailable:true,
        target:session.rows[0],
        warning:'This will disconnect the selected active session through the configured network command fabric.',
      };
    }

    return preview;
  }

  private async record(actor:Actor, command:string, status:string, result:Record<string,unknown>, requestId:string) {
    await this.db.query(
      status === 'AWAITING_CONFIRMATION'
      ? 'INSERT INTO command_executions (tenant_id,actor_user_id,command,status,result,request_id) VALUES ($1,$2,$3,$4,$5,$6)'
      : 'INSERT INTO command_executions (tenant_id,actor_user_id,command,status,result,request_id,completed_at) VALUES ($1,$2,$3,$4,$5,$6,now())',
      [actor.tenantId,actor.userId,command,status,JSON.stringify(result),requestId],
    );
    await this.audit.record(actor.tenantId,status === 'AWAITING_CONFIRMATION' ? 'COMMAND_PREVIEWED' : 'COMMAND_EXECUTED','command',requestId,{command,status,result},{userId:actor.userId,requestId});
  }
}
