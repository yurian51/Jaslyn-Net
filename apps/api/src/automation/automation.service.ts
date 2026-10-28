import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditService } from '../audit/audit.service';
import { hasPermission } from '../auth/permission-resolver';
import { CommandAuthorizationService } from '../commands/command-authorization.service';
import { CreateAutomationRuleDto } from './automation.dto';
import { Condition, evaluateConditions, valueAt } from './automation.conditions';
import { getActionDefinition } from './automation.catalog';
import { definitionHash, normalizeRule, NormalizedRule } from './automation.rules';

const RULE_COLUMNS = `id,name,event_type AS "eventType",conditions,actions,enabled,version,scope,cooldown_seconds AS "cooldownSeconds",cooldown_scope AS "cooldownScope",
  max_attempts AS "maxAttempts",timeout_ms AS "timeoutMs",max_concurrency AS "maxConcurrency",extra_permissions AS "extraPermissions",autonomy,
  run_as_user_id AS "runAsUserId",(standing_approval_hash IS NOT NULL AND standing_approval_hash=definition_hash) AS "standingApprovalValid",
  standing_approval_by AS "standingApprovalBy",standing_approval_at AS "standingApprovalAt",created_at AS "createdAt",updated_at AS "updatedAt"`;

@Injectable()
export class AutomationService {
  constructor(
    @Inject(PG_POOL) private readonly db: Pool,
    private readonly audit: AuditService,
    private readonly authorizer: CommandAuthorizationService = new CommandAuthorizationService(),
  ) {}

  async listRules(tenantId: string) {
    const r = await this.db.query(`SELECT ${RULE_COLUMNS} FROM automation_rules WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 500`, [tenantId]);
    return { data: r.rows };
  }

  private async actorOrThrow(tenantId: string, userId: string) {
    const u = await this.db.query('SELECT id,role,is_active FROM users WHERE tenant_id=$1 AND id=$2', [tenantId, userId]);
    if (!u.rowCount || u.rows[0].is_active !== true) throw new ForbiddenException('Acting user is not active in this tenant');
    return { tenantId, userId, role: u.rows[0].role as string };
  }

  /** A rule executes with its author's authority, so an author cannot define actions beyond their own permissions. */
  private async assertAuthority(tenantId: string, userId: string, rule: Pick<NormalizedRule, 'requiredPermissions'>) {
    const actor = await this.actorOrThrow(tenantId, userId);
    for (const permission of rule.requiredPermissions) {
      if (!(await hasPermission(this.db, actor, permission))) throw new ForbiddenException(`You cannot create or enable a rule that requires ${permission}`);
    }
  }

  private async assertScopeOwned(tenantId: string, rule: NormalizedRule) {
    const { locationIds, routerIds } = rule.scope;
    if (locationIds.length) {
      const r = await this.db.query('SELECT count(*)::int AS n FROM locations WHERE tenant_id=$1 AND id=ANY($2::uuid[])', [tenantId, locationIds]);
      if (r.rows[0].n !== locationIds.length) throw new BadRequestException('scope.locationIds contains an unknown location');
    }
    if (routerIds.length) {
      const r = await this.db.query('SELECT count(*)::int AS n FROM routers WHERE tenant_id=$1 AND id=ANY($2::uuid[])', [tenantId, routerIds]);
      if (r.rows[0].n !== routerIds.length) throw new BadRequestException('scope.routerIds contains an unknown router');
    }
  }

  private static dupName(e: unknown): never {
    if (typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code === '23505') throw new ConflictException('Rule name already exists in this tenant');
    throw e;
  }

  async createRule(tenantId: string, actorId: string, d: CreateAutomationRuleDto) {
    const rule = normalizeRule(d);                 // pure validation first: no I/O on bad input
    await this.assertAuthority(tenantId, actorId, rule);
    await this.assertScopeOwned(tenantId, rule);
    try {
      const r = await this.db.query(
        `INSERT INTO automation_rules(tenant_id,name,event_type,conditions,actions,enabled,created_by,updated_by,run_as_user_id,scope,cooldown_seconds,cooldown_scope,max_attempts,timeout_ms,max_concurrency,extra_permissions,autonomy,definition_hash)
         VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$7,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING ${RULE_COLUMNS}`,
        [tenantId, d.name.trim(), rule.eventType, JSON.stringify(rule.conditions), JSON.stringify(rule.actions), d.enabled === true, actorId, JSON.stringify(rule.scope),
          rule.cooldownSeconds, rule.cooldownScope, rule.maxAttempts, rule.timeoutMs, rule.maxConcurrency, rule.extraPermissions, rule.autonomy, definitionHash(rule)]);
      await this.audit.record(tenantId, 'CREATE', 'automation_rule', r.rows[0].id, { name: d.name, eventType: rule.eventType, enabled: d.enabled === true, destructive: rule.hasDestructive, autonomy: rule.autonomy }, { userId: actorId });
      return r.rows[0];
    } catch (e) { return AutomationService.dupName(e); }
  }

  private async cancelOpenJobs(c: PoolClient, tenantId: string, ruleId: string, code: string) {
    const r = await c.query(`UPDATE automation_jobs SET status='CANCELLED',completed_at=now(),last_error=$3,last_error_code=$3,updated_at=now()
      WHERE tenant_id=$1 AND rule_id=$2 AND status IN ('PENDING','WAITING_APPROVAL') RETURNING id`, [tenantId, ruleId, code]);
    return r.rowCount ?? 0;
  }

  /** Editing creates a new version, voids standing approval (hash changes) and cancels work admitted under the old definition. */
  async updateRule(tenantId: string, actorId: string, id: string, d: CreateAutomationRuleDto) {
    const rule = normalizeRule(d);
    await this.assertAuthority(tenantId, actorId, rule);
    await this.assertScopeOwned(tenantId, rule);
    const c = await this.db.connect();
    try {
      await c.query('BEGIN');
      const cur = await c.query('SELECT id FROM automation_rules WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [tenantId, id]);
      if (!cur.rowCount) throw new NotFoundException('Automation rule not found');
      const hash = definitionHash(rule);
      const r = await c.query(
        `UPDATE automation_rules SET name=$3,event_type=$4,conditions=$5::jsonb,actions=$6::jsonb,scope=$7::jsonb,cooldown_seconds=$8,cooldown_scope=$9,max_attempts=$10,timeout_ms=$11,
                max_concurrency=$12,extra_permissions=$13,autonomy=$14,definition_hash=$15,version=version+1,run_as_user_id=$16,updated_by=$16,updated_at=now(),
                standing_approval_by=CASE WHEN standing_approval_hash=$15 THEN standing_approval_by END,
                standing_approval_at=CASE WHEN standing_approval_hash=$15 THEN standing_approval_at END,
                standing_approval_hash=CASE WHEN standing_approval_hash=$15 THEN standing_approval_hash END
          WHERE tenant_id=$1 AND id=$2 RETURNING ${RULE_COLUMNS}`,
        [tenantId, id, d.name.trim(), rule.eventType, JSON.stringify(rule.conditions), JSON.stringify(rule.actions), JSON.stringify(rule.scope), rule.cooldownSeconds, rule.cooldownScope,
          rule.maxAttempts, rule.timeoutMs, rule.maxConcurrency, rule.extraPermissions, rule.autonomy, hash, actorId]);
      const cancelled = await this.cancelOpenJobs(c, tenantId, id, 'RULE_UPDATED');
      await this.audit.record(tenantId, 'UPDATE_DEFINITION', 'automation_rule', id, { version: r.rows[0].version, cancelledJobs: cancelled, standingApprovalValid: r.rows[0].standingApprovalValid }, { userId: actorId }, c);
      await c.query('COMMIT');
      return r.rows[0];
    } catch (e) { await c.query('ROLLBACK').catch(() => undefined); return AutomationService.dupName(e); } finally { c.release(); }
  }

  async setEnabled(tenantId: string, actorId: string, id: string, enabled: boolean) {
    const found = await this.db.query('SELECT actions,extra_permissions FROM automation_rules WHERE tenant_id=$1 AND id=$2', [tenantId, id]);
    if (!found.rowCount) throw new NotFoundException('Automation rule not found');
    if (enabled) {
      const actions = (found.rows[0].actions as Array<{ type: string }>).map((a) => getActionDefinition(a.type)?.requiredPermission).filter(Boolean) as string[];
      await this.assertAuthority(tenantId, actorId, { requiredPermissions: [...new Set([...actions, ...(found.rows[0].extra_permissions as string[])])] });
    }
    const c = await this.db.connect();
    try {
      await c.query('BEGIN');
      const r = await c.query(`UPDATE automation_rules SET enabled=$3,updated_by=$4,updated_at=now(),run_as_user_id=CASE WHEN $3 THEN $4::uuid ELSE run_as_user_id END
        WHERE tenant_id=$1 AND id=$2 RETURNING id,name,enabled`, [tenantId, id, enabled, actorId]);
      const cancelled = enabled ? 0 : await this.cancelOpenJobs(c, tenantId, id, 'RULE_DISABLED');
      await this.audit.record(tenantId, enabled ? 'ENABLE' : 'DISABLE', 'automation_rule', id, { name: r.rows[0].name, cancelledJobs: cancelled }, { userId: actorId }, c);
      await c.query('COMMIT');
      return r.rows[0];
    } catch (e) { await c.query('ROLLBACK').catch(() => undefined); throw e; } finally { c.release(); }
  }

  /** Standing approval lets an AUTO destructive rule run without per-job approval. It is bound to the exact definition hash. */
  async grantStandingApproval(tenantId: string, actor: { userId: string; role: string }, id: string, note: string) {
    const d = this.authorizer.authorize({ role: actor.role }, 'terminate session standing-approval', { confirmed: true });
    if (d.decision !== 'ALLOW') throw new ForbiddenException('decision' in d && d.decision === 'DENY' ? d.reason : 'Not permitted');
    const r = await this.db.query(
      `UPDATE automation_rules SET standing_approval_by=$3,standing_approval_at=now(),standing_approval_hash=definition_hash
        WHERE tenant_id=$1 AND id=$2 AND autonomy='AUTO' AND definition_hash IS NOT NULL
          AND EXISTS (SELECT 1 FROM jsonb_array_elements(actions) a WHERE a->>'risk'='DESTRUCTIVE')
        RETURNING id,definition_hash AS "definitionHash"`, [tenantId, id, actor.userId]);
    if (!r.rowCount) throw new ConflictException('Standing approval applies only to rules with autonomy AUTO and at least one destructive action');
    await this.audit.record(tenantId, 'AUTOMATION_STANDING_APPROVAL_GRANTED', 'automation_rule', id, { note, definitionHash: r.rows[0].definitionHash }, { userId: actor.userId });
    return { id, standingApprovalValid: true };
  }

  async revokeStandingApproval(tenantId: string, actorId: string, id: string, note: string) {
    const r = await this.db.query('UPDATE automation_rules SET standing_approval_by=NULL,standing_approval_at=NULL,standing_approval_hash=NULL WHERE tenant_id=$1 AND id=$2 RETURNING id', [tenantId, id]);
    if (!r.rowCount) throw new NotFoundException('Automation rule not found');
    await this.audit.record(tenantId, 'AUTOMATION_STANDING_APPROVAL_REVOKED', 'automation_rule', id, { note }, { userId: actorId });
    return { id, standingApprovalValid: false };
  }

  async listRuns(tenantId: string) {
    const r = await this.db.query(`SELECT id,rule_id AS "ruleId",event_id AS "eventId",event_type AS "eventType",status,reason,job_count AS "jobCount",condition_results AS "conditionResults",error_code AS "errorCode",started_at AS "startedAt",completed_at AS "completedAt" FROM automation_rule_runs WHERE tenant_id=$1 ORDER BY started_at DESC LIMIT 500`, [tenantId]);
    return { data: r.rows };
  }
  async listAlerts(tenantId: string) { const r = await this.db.query(`SELECT id,rule_id AS "ruleId",event_id AS "eventId",severity,title,details,status,resolution_note AS "resolutionNote",created_at AS "createdAt",resolved_at AS "resolvedAt" FROM automation_alerts WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 500`, [tenantId]); return { data: r.rows }; }
  async resolveAlert(tenantId: string, actorId: string, id: string, note: string) {
    const r = await this.db.query(`UPDATE automation_alerts SET status='RESOLVED',resolved_at=now(),resolved_by=$3,resolution_note=$4 WHERE tenant_id=$1 AND id=$2 AND status IN ('OPEN','ACKNOWLEDGED') RETURNING id,status`, [tenantId, id, actorId, note.trim()]);
    if (!r.rowCount) throw new NotFoundException('Open automation alert not found');
    await this.audit.record(tenantId, 'RESOLVE', 'automation_alert', id, { note: note.trim() }, { userId: actorId }); return r.rows[0];
  }

  // Thin delegates kept for the pure-function spec and backwards compatibility.
  private valueAt(payload: Record<string, unknown>, path: string) { return valueAt(payload, path); }
  private matches(payload: Record<string, unknown>, conditions: Condition[]) { return evaluateConditions(payload, conditions); }
}
