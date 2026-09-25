import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { PG_POOL } from '../database/database.module';
import { AuditService } from '../audit/audit.service';
import { CommunicationService } from './communication.service';

type Actor = { userId: string; tenantId: string; role: string };

const OPERATOR_ROLES = new Set(['OWNER', 'ADMIN', 'SUPER_ADMIN', 'NETWORK_ADMIN', 'BILLING_ADMIN', 'SUPPORT_AGENT', 'NOC_ENGINEER']);

@Injectable()
export class CommunicationBotService {
  constructor(
    @Inject(PG_POOL) private readonly db: Pool,
    private readonly audit: AuditService,
    private readonly communication: CommunicationService,
  ) {}

  async listBots(actor: Actor) {
    const result = await this.db.query(
      `SELECT id,name,username,description,enabled,created_at AS "createdAt",updated_at AS "updatedAt"
         FROM bots WHERE tenant_id=$1 ORDER BY name ASC`,
      [actor.tenantId],
    );
    return { data: result.rows, count: result.rowCount ?? 0 };
  }

  async execute(actor: Actor, botId: string, command: string, conversationId?: string, confirm = false) {
    const normalized = command.trim().replace(/\s+/g, ' ');
    if (!normalized || normalized.length > 500) throw new BadRequestException('Bot command is required');

    const bot = await this.db.query(
      `SELECT id,name,username,enabled FROM bots WHERE tenant_id=$1 AND id=$2 LIMIT 1`,
      [actor.tenantId, botId],
    );
    if (!bot.rowCount) throw new NotFoundException('Bot not found');
    if (!bot.rows[0].enabled) throw new ForbiddenException('Bot is disabled');

    const commandName = normalized.split(' ')[0].replace(/^\\//, '').toLowerCase();
    const configured = await this.db.query(
      `SELECT id,command,permission,requires_confirmation AS "requiresConfirmation"
         FROM bot_commands
        WHERE tenant_id=$1 AND bot_id=$2 AND lower(ltrim(command,'/'))=$3 AND enabled=true
        LIMIT 1`,
      [actor.tenantId, botId, commandName],
    );

    const fallbackPermission = commandName === 'router' || commandName === 'status' ? 'network.read' : 'communication.read';
    const permission = configured.rows[0]?.permission ?? fallbackPermission;
    const requiresConfirmation = configured.rows[0]?.requiresConfirmation === true;

    if (requiresConfirmation && !confirm) {
      const requestId = randomUUID();
      const preview = { command: normalized, requiresConfirmation: true, warning: 'Confirmation is required before this bot action can execute.' };
      await this.record(actor, botId, configured.rows[0]?.id ?? null, conversationId, normalized, 'AWAITING_CONFIRMATION', preview, requestId);
      return { status: 'AWAITING_CONFIRMATION', requestId, preview };
    }

    if (!OPERATOR_ROLES.has(actor.role) && permission.endsWith('.manage')) {
      throw new ForbiddenException('Bot permission denied');
    }

    let result: Record<string, unknown>;
    const parts = normalized.split(' ');

    if (commandName === 'balance') {
      if (!parts[1]) throw new BadRequestException('Usage: /balance <customer-username>');
      result = await this.verifiedBalance(actor, parts[1]);
    } else if (commandName === 'payment') {
      if (!parts[1]) throw new BadRequestException('Usage: /payment <customer-username>');
      result = await this.verifiedPayments(actor, parts[1]);
    } else if (commandName === 'package') {
      if (!parts[1]) throw new BadRequestException('Usage: /package <customer-username>');
      result = await this.verifiedPackage(actor, parts[1]);
    } else if (commandName === 'status') {
      result = await this.verifiedStatus(actor);
    } else if (commandName === 'router' && parts[1]?.toLowerCase() === 'status') {
      if (!parts[2]) throw new BadRequestException('Usage: /router status <router-name>');
      result = await this.verifiedRouter(actor, parts.slice(2).join(' '));
    } else if (commandName === 'support') {
      result = { verified: true, action: 'OPEN_SUPPORT', message: 'Support workflow is available in Communication Center.' };
    } else {
      result = { verified: false, dataAvailable: false, message: 'Insufficient verified data for this bot command.' };
    }

    const requestId = randomUUID();
    await this.record(actor, botId, configured.rows[0]?.id ?? null, conversationId, normalized, 'SUCCESS', result, requestId);

    if (conversationId) {
      await this.communication.sendMessage(actor, conversationId, {
        body: this.formatResult(result),
        idempotencyKey: `bot:${requestId}`,
      });
    }

    return { status: 'SUCCESS', command: normalized, requestId, result, timestamp: new Date().toISOString() };
  }

  private async verifiedStatus(actor: Actor) {
    const [sessions, routers] = await Promise.all([
      this.db.query(`SELECT COUNT(*)::int AS count FROM sessions WHERE tenant_id=$1 AND status='ACTIVE'`, [actor.tenantId]),
      this.db.query(`SELECT COUNT(*) FILTER (WHERE status='ONLINE')::int AS online, COUNT(*)::int AS total FROM routers WHERE tenant_id=$1`, [actor.tenantId]),
    ]);
    return {
      verified: true,
      activeSessions: Number(sessions.rows[0]?.count ?? 0),
      routers: { online: Number(routers.rows[0]?.online ?? 0), total: Number(routers.rows[0]?.total ?? 0) },
    };
  }

  private async verifiedRouter(actor: Actor, name: string) {
    const result = await this.db.query(
      `SELECT id,name,status,vendor,model,active_users AS "activeUsers",updated_at AS "updatedAt"
         FROM routers WHERE tenant_id=$1 AND name=$2 LIMIT 1`,
      [actor.tenantId, name],
    );
    return result.rowCount ? { verified: true, router: result.rows[0] } : { verified: true, dataAvailable: false, message: 'No data available for the requested router.' };
  }

  private async verifiedBalance(actor: Actor, username: string) {
    const customer = await this.db.query(`SELECT id,full_name AS "fullName",username FROM customers WHERE tenant_id=$1 AND username=$2 LIMIT 1`, [actor.tenantId, username]);
    if (!customer.rowCount) return { verified: true, dataAvailable: false, message: 'No subscriber found.' };
    const invoices = await this.db.query(
      `SELECT COALESCE(SUM(total) FILTER (WHERE status IN ('ISSUED','PARTIALLY_PAID','OVERDUE')),0)::numeric AS outstanding,currency
         FROM invoices WHERE tenant_id=$1 AND customer_id=$2 GROUP BY currency`,
      [actor.tenantId, customer.rows[0].id],
    );
    return { verified: true, customer: customer.rows[0], outstanding: invoices.rows };
  }

  private async verifiedPayments(actor: Actor, username: string) {
    const result = await this.db.query(
      `SELECT p.id,p.amount,p.currency,p.provider,p.provider_reference AS "reference",p.status,p.created_at AS "createdAt"
         FROM payments p JOIN customers c ON c.tenant_id=p.tenant_id AND c.id=p.customer_id
        WHERE p.tenant_id=$1 AND c.username=$2 ORDER BY p.created_at DESC LIMIT 10`,
      [actor.tenantId, username],
    );
    return { verified: true, data: result.rows };
  }

  private async verifiedPackage(actor: Actor, username: string) {
    const result = await this.db.query(
      `SELECT p.id,p.status,p.starts_at AS "startsAt",p.ends_at AS "endsAt",pkg.name AS "packageName",
              pkg.download_bps AS "downloadBps",pkg.upload_bps AS "uploadBps",p.price,p.currency
         FROM wifi_plan_purchases p
         JOIN customers c ON c.tenant_id=p.tenant_id AND c.id=p.customer_id
         JOIN packages pkg ON pkg.tenant_id=p.tenant_id AND pkg.id=p.package_id
        WHERE p.tenant_id=$1 AND c.username=$2 ORDER BY p.created_at DESC LIMIT 1`,
      [actor.tenantId, username],
    );
    return { verified: true, data: result.rows };
  }

  private formatResult(result: Record<string, unknown>) {
    if (result.message) return String(result.message);
    return JSON.stringify(result);
  }

  private async record(
    actor: Actor,
    botId: string,
    commandId: string | null,
    conversationId: string | undefined,
    command: string,
    status: string,
    output: Record<string, unknown>,
    requestId: string,
  ) {
    await this.db.query(
      `INSERT INTO bot_executions
        (tenant_id,bot_id,command_id,actor_user_id,conversation_id,request_id,status,input,output,completed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())`,
      [actor.tenantId, botId, commandId, actor.userId, conversationId ?? null, requestId, status, JSON.stringify({ command }), JSON.stringify(output)],
    );
    await this.audit.record(actor.tenantId, 'BOT_EXECUTED', 'bot', botId, { command, status, requestId }, { userId: actor.userId, requestId });
  }
}
