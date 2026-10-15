import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditService } from '../audit/audit.service';
import { RAW_CANONICAL_PAIRS, normalizeEvent, NormalizedEvent, getActionDefinition } from './automation.catalog';
import { Condition, evaluateConditions } from './automation.conditions';
import { computeBackoffMs } from './automation.retry';

export const RECEIPT_MAX_ATTEMPTS = 5;

interface Receipt { tenantId: string; eventId: string; rawType: string; payload: Record<string, unknown>; aggregateId: string | null; createdAt: string; attempts: number }
interface RuleRow {
  id: string; version: number; conditions: Condition[]; actions: Array<Record<string, unknown>>; scope: { locationIds?: string[]; routerIds?: string[] };
  cooldownSeconds: number; cooldownScope: 'RULE' | 'SUBJECT'; maxAttempts: number; timeoutMs: number; runAs: string | null;
}

@Injectable()
export class AutomationFanoutService {
  private readonly logger = new Logger(AutomationFanoutService.name);
  constructor(@Inject(PG_POOL) private readonly db: Pool, private readonly audit: AuditService) {}

  /** EVENT intake: create a receipt for every processed outbox event that at least one enabled rule could match. */
  async intake(): Promise<number> {
    const raws = RAW_CANONICAL_PAIRS.map((p) => p[0]); const canon = RAW_CANONICAL_PAIRS.map((p) => p[1]);
    const r = await this.db.query(
      `INSERT INTO automation_event_receipts(tenant_id,event_id,event_type)
       SELECT e.tenant_id,e.id,e.event_type
         FROM communication_domain_events e
         LEFT JOIN unnest($1::text[],$2::text[]) AS m(raw,canon) ON m.raw=e.event_type
        WHERE e.status='PROCESSED' AND e.created_at >= now()-interval '7 days'
          AND EXISTS (SELECT 1 FROM automation_rules r
                       WHERE r.tenant_id=e.tenant_id AND r.enabled=true AND e.created_at>=r.updated_at
                         AND (r.event_type=e.event_type OR r.event_type=m.canon OR r.event_type='*'))
        ORDER BY e.created_at LIMIT 2000
       ON CONFLICT(tenant_id,event_id) DO NOTHING`, [raws, canon]);
    return r.rowCount ?? 0;
  }

  /** Receipts whose worker crashed while PROCESSING and ran out of attempts would otherwise be stranded. */
  private async sweepStrandedReceipts() {
    const stranded = await this.db.query(
      `UPDATE automation_event_receipts SET status='DEAD',locked_at=NULL,last_error=COALESCE(last_error,'WORKER_CRASHED')
        WHERE status='PROCESSING' AND attempts>=$1 AND locked_at<now()-interval '5 minutes'
        RETURNING tenant_id,event_id,event_type,attempts,last_error`, [RECEIPT_MAX_ATTEMPTS]);
    for (const row of stranded.rows) await this.deadLetterEvent(this.db, row.tenant_id, row.event_id, row.event_type, row.attempts, row.last_error ?? 'WORKER_CRASHED');
  }

  async process(limit = 50): Promise<{ claimed: number; failed: number; dead: number }> {
    await this.sweepStrandedReceipts();
    const claimed = await this.db.query(
      `WITH due AS (
         SELECT tenant_id,event_id FROM automation_event_receipts
          WHERE (status IN ('PENDING','FAILED') AND attempts<$2 AND next_attempt_at<=now())
             OR (status='PROCESSING' AND attempts<$2 AND locked_at<now()-interval '5 minutes')
          ORDER BY next_attempt_at,created_at FOR UPDATE SKIP LOCKED LIMIT $1)
       UPDATE automation_event_receipts r SET status='PROCESSING',attempts=r.attempts+1,locked_at=now()
         FROM due, communication_domain_events e
        WHERE r.tenant_id=due.tenant_id AND r.event_id=due.event_id AND e.tenant_id=r.tenant_id AND e.id=r.event_id
        RETURNING r.tenant_id AS "tenantId",r.event_id AS "eventId",r.event_type AS "rawType",e.payload,e.aggregate_id AS "aggregateId",e.created_at AS "createdAt",r.attempts`,
      [limit, RECEIPT_MAX_ATTEMPTS]);
    let failed = 0, dead = 0;
    for (const receipt of claimed.rows as Receipt[]) {
      try { await this.processReceipt(receipt); }
      catch (error) {
        const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
        this.logger.error(`Fan-out failed for event ${receipt.eventId}: ${message}`);
        if (receipt.attempts >= RECEIPT_MAX_ATTEMPTS) {
          await this.db.query(`UPDATE automation_event_receipts SET status='DEAD',locked_at=NULL,last_error=$3 WHERE tenant_id=$1 AND event_id=$2`, [receipt.tenantId, receipt.eventId, message]);
          await this.deadLetterEvent(this.db, receipt.tenantId, receipt.eventId, receipt.rawType, receipt.attempts, message); dead++;
        } else {
          await this.db.query(`UPDATE automation_event_receipts SET status='FAILED',locked_at=NULL,last_error=$3,next_attempt_at=now()+make_interval(secs=>$4) WHERE tenant_id=$1 AND event_id=$2`,
            [receipt.tenantId, receipt.eventId, message, Math.round(computeBackoffMs(receipt.attempts, { baseMs: 10_000 }) / 1000)]); failed++;
        }
      }
    }
    return { claimed: claimed.rowCount ?? 0, failed, dead };
  }

  private async deadLetterEvent(db: Pick<Pool, 'query'>, tenantId: string, eventId: string, rawType: string, attempts: number, message: string) {
    await db.query(
      `INSERT INTO automation_dead_letters(tenant_id,kind,event_id,reason,error_code,error_message,attempts,snapshot)
       VALUES($1,'EVENT',$2,'FANOUT_EXHAUSTED','FANOUT_FAILED',$3,$4,$5::jsonb) ON CONFLICT DO NOTHING`,
      [tenantId, eventId, message, attempts, JSON.stringify({ rawType })]);
  }

  private async resolveLocation(client: PoolClient, tenantId: string, ev: NormalizedEvent): Promise<string | null> {
    if (ev.locationId) return ev.locationId;
    if (!ev.routerId) return null;
    const r = await client.query('SELECT location_id FROM routers WHERE tenant_id=$1 AND id=$2', [tenantId, ev.routerId]);
    return r.rows[0]?.location_id ?? null;
  }

  private async processReceipt(receipt: Receipt) {
    const ev = normalizeEvent(receipt.rawType, receipt.payload, receipt.aggregateId);
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const rules = await client.query(
        `SELECT id,version,conditions,actions,scope,cooldown_seconds AS "cooldownSeconds",cooldown_scope AS "cooldownScope",
                max_attempts AS "maxAttempts",timeout_ms AS "timeoutMs",run_as_user_id AS "runAs"
           FROM automation_rules
          WHERE tenant_id=$1 AND enabled=true AND $4::timestamptz>=updated_at
            AND (event_type=$2 OR event_type=$3 OR event_type='*')
          ORDER BY created_at`, [receipt.tenantId, receipt.rawType, ev.canonical ?? receipt.rawType, receipt.createdAt]);
      const location = rules.rows.some((r: RuleRow) => r.scope?.locationIds?.length) ? await this.resolveLocation(client, receipt.tenantId, ev) : null;
      const evalPayload = { ...ev.payload, event: { type: ev.canonical ?? ev.rawType, rawType: ev.rawType, id: receipt.eventId } };

      for (const rule of rules.rows as RuleRow[]) {
        const seen = await client.query('SELECT 1 FROM automation_rule_runs WHERE tenant_id=$1 AND rule_id=$2 AND event_id=$3', [receipt.tenantId, rule.id, receipt.eventId]);
        if (seen.rowCount) continue; // reprocessing after a crash: already decided
        const record = (status: string, reason: string | null, extra: Record<string, unknown> = {}, jobs = 0) => client.query(
          `INSERT INTO automation_rule_runs(tenant_id,rule_id,event_id,event_type,status,condition_results,action_results,reason,job_count,completed_at)
           VALUES($1,$2,$3,$4,$5,$6::jsonb,'[]'::jsonb,$7,$8,now()) ON CONFLICT(tenant_id,rule_id,event_id) DO NOTHING`,
          [receipt.tenantId, rule.id, receipt.eventId, ev.canonical ?? ev.rawType, status, JSON.stringify(extra.conditions ?? []), reason, jobs]);

        // scope (tenant is already enforced by every query; this narrows to locations/routers, failing closed)
        const locIds = rule.scope?.locationIds ?? [], rtrIds = rule.scope?.routerIds ?? [];
        if ((locIds.length && (!location || !locIds.includes(location))) || (rtrIds.length && (!ev.routerId || !rtrIds.includes(ev.routerId)))) {
          await record('OUT_OF_SCOPE', 'SCOPE'); continue;
        }
        const cond = evaluateConditions(evalPayload, Array.isArray(rule.conditions) ? rule.conditions : []);
        if (!cond.matched) { await record('NO_MATCH', null, { conditions: cond.results }); continue; }

        if (rule.cooldownSeconds > 0) {
          const key = rule.cooldownScope === 'SUBJECT' && ev.subject ? `s:${ev.subject}` : 'rule';
          const fired = await client.query(
            `INSERT INTO automation_cooldowns(tenant_id,rule_id,cooldown_key) VALUES($1,$2,$3)
             ON CONFLICT(tenant_id,rule_id,cooldown_key) DO UPDATE SET last_fired_at=now(),fire_count=automation_cooldowns.fire_count+1
               WHERE automation_cooldowns.last_fired_at <= now()-make_interval(secs=>$4)
             RETURNING 1`, [receipt.tenantId, rule.id, key, rule.cooldownSeconds]);
          if (!fired.rowCount) {
            await client.query('UPDATE automation_cooldowns SET suppressed_count=suppressed_count+1,last_suppressed_at=now() WHERE tenant_id=$1 AND rule_id=$2 AND cooldown_key=$3', [receipt.tenantId, rule.id, key]);
            await record('SUPPRESSED', 'COOLDOWN', { conditions: cond.results }); continue;
          }
        }
        // admission policy: a rule with no active run-as principal can never execute; do not queue dead work
        const runAs = rule.runAs ? await client.query('SELECT is_active FROM users WHERE tenant_id=$1 AND id=$2', [receipt.tenantId, rule.runAs]) : null;
        if (!runAs?.rowCount || runAs.rows[0].is_active !== true) { await record('DENIED', 'RUN_AS_INACTIVE', { conditions: cond.results }); continue; }

        let created = 0;
        const actions = Array.isArray(rule.actions) ? rule.actions : [];
        for (let index = 0; index < actions.length; index++) {
          const action = actions[index]; const def = getActionDefinition(String(action.type));
          if (!def) continue;
          const subject = ev.subject;
          const inserted = await client.query(
            `INSERT INTO automation_jobs(tenant_id,rule_id,rule_version,event_id,event_type,action_index,action_type,action,payload,risk,subject_key,concurrency_key,idempotency_key,max_attempts,timeout_ms,correlation_id)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12,$13,$14,$15,$16)
             ON CONFLICT(tenant_id,idempotency_key) DO NOTHING`,
            [receipt.tenantId, rule.id, rule.version, receipt.eventId, ev.canonical ?? ev.rawType, index, def.type, JSON.stringify(action), JSON.stringify(ev.payload),
              def.risk, subject, def.risk === 'DESTRUCTIVE' && subject ? `${ev.canonical}:${subject}` : null,
              `${rule.id}:${receipt.eventId}:${index}`, rule.maxAttempts, rule.timeoutMs, `automation:${rule.id}:${receipt.eventId}`]);
          created += inserted.rowCount ?? 0;
          if (inserted.rowCount && def.risk === 'DESTRUCTIVE') {
            await this.audit.record(receipt.tenantId, 'AUTOMATION_JOB_QUEUED', 'automation_rule', rule.id,
              { eventId: receipt.eventId, event: ev.canonical, actionType: def.type, subject, risk: def.risk }, { userId: rule.runAs ?? undefined, correlationId: `automation:${rule.id}:${receipt.eventId}` }, client);
          }
        }
        await record('QUEUED', null, { conditions: cond.results }, created);
      }
      await client.query(`UPDATE automation_event_receipts SET status='COMPLETED',completed_at=now(),locked_at=NULL,last_error=NULL WHERE tenant_id=$1 AND event_id=$2`, [receipt.tenantId, receipt.eventId]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }
}
