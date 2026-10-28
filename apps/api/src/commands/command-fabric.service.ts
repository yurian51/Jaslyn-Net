import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditService } from '../audit/audit.service';
import { NetworkCommandService } from '../modules/traffic/network-command.service';
import {
  AuthorizationDecision, CommandAuthorizationService, CommandPrincipal, OPERATOR_REQUIRED_MESSAGE,
} from './command-authorization.service';

export const SESSION_NOT_ACTIVE_MESSAGE = 'Active session not found or already ended';
export const NOT_CONNECTED_MESSAGE = 'This destructive command is not connected to a verified execution fabric';

/**
 * Shared execution path for destructive commands. CommunicationCommandService (manual) and the automation
 * engine both execute through executeDestructive(), which re-checks authorization itself, so no caller can
 * skip the gate by forgetting to call authorize().
 */
@Injectable()
export class CommandFabricService {
  constructor(
    @Inject(PG_POOL) private readonly db: Pool,
    private readonly audit: AuditService,
    private readonly networkCommands: NetworkCommandService,
    private readonly authorizer: CommandAuthorizationService = new CommandAuthorizationService(),
  ) {}

  authorize(principal: CommandPrincipal, command: string, confirmed: boolean): AuthorizationDecision {
    return this.authorizer.authorize(principal, command, { confirmed });
  }

  isDestructive(command: string) { return this.authorizer.isDestructive(command); }

  async executeDestructive(
    principal: CommandPrincipal,
    command: string,
    options: { confirmed: boolean; requestId: string; correlationId?: string },
  ): Promise<Record<string, unknown>> {
    const decision = this.authorize(principal, command, options.confirmed);
    if (decision.decision === 'DENY') throw new ForbiddenException(decision.reason ?? OPERATOR_REQUIRED_MESSAGE);
    if (decision.decision === 'REQUIRE_CONFIRMATION') throw new ForbiddenException('Destructive command requires confirmation');
    const parts = command.trim().replace(/\s+/g, ' ').split(' ');
    if (parts[0]?.toLowerCase() === 'terminate' && parts[1]?.toLowerCase() === 'session') {
      if (!parts[2]) throw new BadRequestException('Usage: terminate session <session-id>');
      return this.queueSessionTermination(principal, parts[2], options.requestId, options.correlationId);
    }
    throw new ForbiddenException(NOT_CONNECTED_MESSAGE);
  }

  private async queueSessionTermination(principal: CommandPrincipal, sessionId: string, requestId: string, correlationOverride?: string) {
    const session = await this.db.query(
      `SELECT s.id,s.customer_id AS "customerId",s.router_id AS "routerId",s.username,
              s.ip_address AS "ipAddress",s.mac_address::text AS "macAddress",
              r.name AS "routerName",r.management_protocol AS "managementProtocol",
              r.management_enabled AS "managementEnabled",r.api_endpoint AS "apiEndpoint"
         FROM sessions s
         LEFT JOIN routers r ON r.tenant_id=s.tenant_id AND r.id=s.router_id
        WHERE s.tenant_id=$1 AND s.id=$2 AND s.status='ACTIVE'
        LIMIT 1`,
      [principal.tenantId, sessionId],
    );
    if (!session.rowCount) throw new BadRequestException(SESSION_NOT_ACTIVE_MESSAGE);
    const row = session.rows[0];
    if (!row.routerId || !row.managementProtocol || row.managementEnabled !== true || !row.apiEndpoint) {
      throw new ForbiddenException('Session cannot be terminated: verified network management is unavailable');
    }
    const automated = principal.origin === 'AUTOMATION';
    const queued = await this.networkCommands.queue(principal.tenantId, {
      routerId: row.routerId,
      commandType: 'DISCONNECT_SESSION',
      actor: principal.actorLabel ?? principal.userId,
      provider: row.managementProtocol,
      correlationId: correlationOverride ?? `communication:terminate-session:${requestId}`,
      target: { sessionId: row.id, customerId: row.customerId, username: row.username, ipAddress: row.ipAddress, macAddress: row.macAddress },
      request: automated
        ? { reason: 'AUTOMATION_RULE', requestId, ruleId: principal.automation?.ruleId, jobId: principal.automation?.jobId }
        : { reason: 'OPERATOR_COMMAND', requestId },
    });
    return {
      verified: true, queued: true, commandId: queued.id, status: 'QUEUED',
      session: { id: row.id, customerId: row.customerId, routerId: row.routerId, routerName: row.routerName, username: row.username, ipAddress: row.ipAddress },
      message: 'Session termination queued through the verified network command fabric.',
    };
  }

  async previewDangerous(principal: CommandPrincipal, command: string) {
    const parts = command.split(' ');
    const preview: Record<string, unknown> = {
      scope: 'COMMAND', command, requiresConfirmation: true, actor: principal.userId,
      warning: 'This operation can change service state and requires explicit confirmation.',
    };
    if (parts[0]?.toLowerCase() === 'terminate' && parts[1]?.toLowerCase() === 'session' && parts[2]) {
      const session = await this.db.query(
        `SELECT s.id,s.customer_id AS "customerId",s.router_id AS "routerId",s.username,
                s.ip_address AS "ipAddress",r.name AS "routerName",r.status AS "routerStatus"
           FROM sessions s
           LEFT JOIN routers r ON r.tenant_id=s.tenant_id AND r.id=s.router_id
          WHERE s.tenant_id=$1 AND s.id=$2 AND s.status='ACTIVE'`,
        [principal.tenantId, parts[2]],
      );
      if (!session.rowCount) return { ...preview, dataAvailable: false, message: 'Active session not found.' };
      return { ...preview, dataAvailable: true, target: session.rows[0], warning: 'This will disconnect the selected active session through the configured network command fabric.' };
    }
    return preview;
  }

  /** Records a command execution and its audit entry. Idempotent per (tenant, requestId, status) for retried automation. */
  async record(principal: CommandPrincipal, command: string, status: string, result: Record<string, unknown>, requestId: string) {
    const origin = principal.origin ?? 'MANUAL';
    const tagged = { ...result, origin, ...(principal.automation ? { automation: principal.automation } : {}) };
    if (status === 'AWAITING_CONFIRMATION') {
      await this.db.query(
        'INSERT INTO command_executions (tenant_id,actor_user_id,command,status,result,request_id) VALUES ($1,$2,$3,$4,$5,$6)',
        [principal.tenantId, principal.userId, command, status, JSON.stringify(tagged), requestId]);
    } else {
      await this.db.query(
        `INSERT INTO command_executions (tenant_id,actor_user_id,command,status,result,request_id,completed_at)
         SELECT $1,$2,$3,$4,$5,$6,now()
          WHERE NOT EXISTS (SELECT 1 FROM command_executions WHERE tenant_id=$1 AND request_id=$6 AND status=$4)`,
        [principal.tenantId, principal.userId, command, status, JSON.stringify(tagged), requestId]);
    }
    await this.audit.record(principal.tenantId, status === 'AWAITING_CONFIRMATION' ? 'COMMAND_PREVIEWED' : 'COMMAND_EXECUTED', 'command', requestId,
      { command, status, result: tagged, origin }, { userId: principal.userId, requestId });
  }
}
