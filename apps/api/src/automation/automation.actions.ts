import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { CommandPrincipal } from '../commands/command-authorization.service';
import { CommandFabricService, SESSION_NOT_ACTIVE_MESSAGE } from '../commands/command-fabric.service';
import { BadRequestException } from '@nestjs/common';
import { ActionNoopError, NonRetryableError } from './automation.retry';
import { commandTextFor } from './automation.policy';
import { ActionOutcome, JobRow } from './automation.types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ActionContext { job: JobRow; principal: CommandPrincipal; signal: AbortSignal }

/**
 * ACTION stage. Every executor must be idempotent per job id: the engine may run an attempt more than once
 * (timeout followed by retry, crash after side effect). Deterministic keys derived from job.id guarantee that.
 */
@Injectable()
export class AutomationActionExecutor {
  constructor(@Inject(PG_POOL) private readonly db: Pool, private readonly fabric: CommandFabricService) {}

  async execute(ctx: ActionContext): Promise<ActionOutcome> {
    switch (ctx.job.actionType) {
      case 'CREATE_ALERT': return this.createAlert(ctx);
      case 'EMIT_WEBHOOK': return this.emitWebhook(ctx);
      case 'TERMINATE_SESSION': return this.terminateSession(ctx);
      default: throw new NonRetryableError('UNKNOWN_ACTION', `Unknown action ${ctx.job.actionType}`);
    }
  }

  private async createAlert({ job }: ActionContext): Promise<ActionOutcome> {
    const a = job.action;
    const inserted = await this.db.query(
      `INSERT INTO automation_alerts(tenant_id,rule_id,event_id,severity,title,details,job_id)
       VALUES($1,$2,$3,$4,$5,$6::jsonb,$7) ON CONFLICT(tenant_id,rule_id,event_id) DO NOTHING RETURNING id`,
      [job.tenantId, job.ruleId, job.eventId, String(a.severity ?? 'HIGH'), String(a.title ?? 'Automation alert'),
        JSON.stringify({ eventType: job.eventType, eventId: job.eventId, ruleId: job.ruleId, jobId: job.id }), job.id]);
    if (inserted.rowCount) return { result: { status: 'CREATED', alertId: inserted.rows[0].id } };
    const existing = await this.db.query('SELECT id FROM automation_alerts WHERE tenant_id=$1 AND rule_id=$2 AND event_id=$3', [job.tenantId, job.ruleId, job.eventId]);
    return { result: { status: 'ALREADY_EXISTS', alertId: existing.rows[0]?.id ?? null }, noop: true };
  }

  private async emitWebhook({ job }: ActionContext): Promise<ActionOutcome> {
    const emitted = await this.db.query(
      `INSERT INTO webhook_delivery_outbox(tenant_id,endpoint_id,event_id,event_type,payload)
       SELECT e.tenant_id,e.id,md5($2::text||':'||e.id::text)::uuid,'automation.rule.matched',
              jsonb_build_object('ruleId',$3::text,'eventId',$4::text,'eventType',$5::text,'jobId',$2::text)
         FROM tenant_webhook_endpoints e
        WHERE e.tenant_id=$1 AND e.enabled=true AND 'automation.rule.matched'=ANY(e.event_types)
       ON CONFLICT (tenant_id,endpoint_id,event_id) DO NOTHING`,
      [job.tenantId, job.id, job.ruleId, job.eventId, job.eventType]);
    return { result: { status: 'QUEUED', endpointCount: emitted.rowCount ?? 0 } };
  }

  private async terminateSession({ job, principal }: ActionContext): Promise<ActionOutcome> {
    const command = commandTextFor(job);
    if (!command) throw new NonRetryableError('MISSING_TARGET', 'Event payload does not identify a session');
    const sessionId = command.split(' ')[2];
    if (!UUID.test(sessionId)) throw new NonRetryableError('INVALID_TARGET', 'Target session id is not a UUID');
    try {
      // Same entry point manual commands use; it re-runs the command authorizer itself.
      const result = await this.fabric.executeDestructive(principal, command, {
        confirmed: true, requestId: job.id, correlationId: `automation:${job.id}`,
      });
      await this.fabric.record(principal, command, 'SUCCESS', result, job.id);
      return { result: { commandId: result.commandId, queued: true, sessionId } };
    } catch (error) {
      if (error instanceof BadRequestException && error.message === SESSION_NOT_ACTIVE_MESSAGE) {
        throw new ActionNoopError('TARGET_GONE', 'Session was already ended');
      }
      throw error;
    }
  }
}
