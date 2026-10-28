import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { hasPermission } from '../auth/permission-resolver';
import { CommandAuthorizationService, CommandPrincipal } from '../commands/command-authorization.service';
import { AutomationConfig } from './automation.config';
import { getActionDefinition } from './automation.catalog';
import { JobRow } from './automation.types';

export type PolicyDecision =
  | { decision: 'ALLOW'; principal: CommandPrincipal; confirmedBy: 'NOT_REQUIRED' | 'JOB_APPROVAL' | 'STANDING_APPROVAL' }
  | { decision: 'REQUIRE_APPROVAL'; code: string; reason: string }
  | { decision: 'DENY'; code: string; reason: string }
  | { decision: 'CANCEL'; code: string; reason: string };

/** Command text equivalent to what an operator would type, so the SAME authorizer governs automation. */
export function commandTextFor(job: Pick<JobRow, 'actionType' | 'action' | 'payload'>): string | null {
  if (job.actionType === 'TERMINATE_SESSION') {
    const path = String(job.action.sessionIdPath ?? 'sessionId');
    let v: unknown = job.payload;
    for (const part of path.split('.')) v = v && typeof v === 'object' ? (v as Record<string, unknown>)[part] : undefined;
    return typeof v === 'string' && v ? `terminate session ${v}` : null;
  }
  return null;
}

/**
 * POLICY stage. Evaluated at admission (cheap checks) and again immediately before every execution, because
 * authority can change between enqueue and run: rules get disabled/edited, users lose roles or are deactivated.
 */
@Injectable()
export class AutomationPolicyService {
  constructor(
    @Inject(PG_POOL) private readonly db: Pool,
    private readonly config: AutomationConfig,
    private readonly authorizer: CommandAuthorizationService = new CommandAuthorizationService(),
  ) {}

  async evaluate(job: JobRow): Promise<PolicyDecision> {
    const ruleRes = await this.db.query(
      `SELECT r.enabled, r.version, r.autonomy, r.definition_hash AS "definitionHash", r.run_as_user_id AS "runAs",
              r.extra_permissions AS "extra", r.standing_approval_by AS "standingBy", r.standing_approval_hash AS "standingHash",
              t.status AS "tenantStatus"
         FROM automation_rules r JOIN tenants t ON t.id=r.tenant_id
        WHERE r.tenant_id=$1 AND r.id=$2`, [job.tenantId, job.ruleId]);
    if (!ruleRes.rowCount) return { decision: 'CANCEL', code: 'RULE_MISSING', reason: 'Rule no longer exists' };
    const rule = ruleRes.rows[0];
    if (!rule.enabled) return { decision: 'CANCEL', code: 'RULE_DISABLED', reason: 'Rule was disabled before execution' };
    if (Number(rule.version) !== job.ruleVersion) return { decision: 'CANCEL', code: 'RULE_CHANGED', reason: 'Rule was edited after this job was admitted' };
    if (!['ACTIVE', 'TRIAL'].includes(rule.tenantStatus)) return { decision: 'DENY', code: 'TENANT_INACTIVE', reason: `Tenant is ${rule.tenantStatus}` };

    const user = rule.runAs ? await this.db.query('SELECT id,role,is_active FROM users WHERE tenant_id=$1 AND id=$2', [job.tenantId, rule.runAs]) : null;
    if (!user?.rowCount || user.rows[0].is_active !== true) return { decision: 'DENY', code: 'RUN_AS_INACTIVE', reason: 'The rule\'s run-as user is missing or deactivated' };
    const subject = { tenantId: job.tenantId, userId: user.rows[0].id as string, role: user.rows[0].role as string };

    const def = getActionDefinition(job.actionType);
    if (!def) return { decision: 'DENY', code: 'UNKNOWN_ACTION', reason: `Unknown action ${job.actionType}` };
    for (const permission of new Set([def.requiredPermission, ...(rule.extra as string[])])) {
      if (!(await hasPermission(this.db, subject, permission))) return { decision: 'DENY', code: 'PERMISSION_REVOKED', reason: `Run-as user no longer holds ${permission}` };
    }

    const principal: CommandPrincipal = {
      ...subject, origin: 'AUTOMATION', actorLabel: `automation:${job.ruleId}`, automation: { ruleId: job.ruleId, jobId: job.id },
    };
    if (job.risk !== 'DESTRUCTIVE') return { decision: 'ALLOW', principal, confirmedBy: 'NOT_REQUIRED' };

    // ---- destructive path ----
    if (!this.config.destructiveEnabled) return { decision: 'DENY', code: 'DESTRUCTIVE_DISABLED', reason: 'Destructive automation is disabled on this platform' };
    const command = commandTextFor(job);
    if (!command) return { decision: 'DENY', code: 'MISSING_TARGET', reason: 'Event payload does not identify a target for this action' };

    let confirmedBy: 'JOB_APPROVAL' | 'STANDING_APPROVAL' | null = null;
    if (job.approvedBy) confirmedBy = 'JOB_APPROVAL';
    else if (rule.autonomy === 'AUTO' && rule.standingHash && rule.standingHash === rule.definitionHash && rule.standingBy) {
      const approver = await this.db.query('SELECT role,is_active FROM users WHERE tenant_id=$1 AND id=$2', [job.tenantId, rule.standingBy]);
      const ok = approver.rowCount && approver.rows[0].is_active === true
        && (await hasPermission(this.db, { tenantId: job.tenantId, userId: rule.standingBy, role: approver.rows[0].role }, 'automation.approve'))
        && this.authorizer.authorize({ role: approver.rows[0].role }, command, { confirmed: true }).decision === 'ALLOW';
      if (ok) confirmedBy = 'STANDING_APPROVAL';
    }

    const decision = this.authorizer.authorize(principal, command, { confirmed: confirmedBy !== null });
    if (decision.decision === 'DENY') return { decision: 'DENY', code: 'COMMAND_DENIED', reason: decision.reason };
    if (decision.decision === 'REQUIRE_CONFIRMATION') return { decision: 'REQUIRE_APPROVAL', code: 'APPROVAL_REQUIRED', reason: 'Destructive action requires operator approval' };

    const budget = await this.db.query(
      `SELECT count(*)::int AS n FROM automation_jobs
        WHERE tenant_id=$1 AND risk='DESTRUCTIVE' AND started_at > now() - interval '1 hour' AND id<>$2 AND status IN ('RUNNING','SUCCEEDED')`, [job.tenantId, job.id]);
    if (budget.rows[0].n >= this.config.destructiveMaxPerHour) return { decision: 'DENY', code: 'DESTRUCTIVE_BUDGET_EXCEEDED', reason: `Tenant reached ${this.config.destructiveMaxPerHour} destructive automated actions in the last hour` };
    return { decision: 'ALLOW', principal, confirmedBy: confirmedBy! };
  }
}
