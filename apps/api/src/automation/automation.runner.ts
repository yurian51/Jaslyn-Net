import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { PG_POOL } from '../database/database.module';
import { AuditService } from '../audit/audit.service';
import { AutomationActionExecutor } from './automation.actions';
import { AutomationConfig } from './automation.config';
import { AutomationPolicyService, PolicyDecision } from './automation.policy';
import { ActionNoopError, ActionTimeoutError, classifyError, computeBackoffMs, ErrorClassification } from './automation.retry';
import { ActionOutcome, JobRow } from './automation.types';

const JOB_COLUMNS = `id,tenant_id AS "tenantId",rule_id AS "ruleId",rule_version AS "ruleVersion",event_id AS "eventId",event_type AS "eventType",
  action_index AS "actionIndex",action_type AS "actionType",action,payload,risk,subject_key AS "subjectKey",concurrency_key AS "concurrencyKey",
  status,attempts,requeue_count AS "requeueCount",max_attempts AS "maxAttempts",timeout_ms AS "timeoutMs",approved_by AS "approvedBy",correlation_id AS "correlationId"`;

type DeadReason = 'RETRIES_EXHAUSTED' | 'NON_RETRYABLE' | 'LEASE_EXPIRED_EXHAUSTED';

@Injectable()
export class AutomationJobRunner {
  private readonly logger = new Logger(AutomationJobRunner.name);
  readonly workerId = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;

  constructor(
    @Inject(PG_POOL) private readonly db: Pool,
    private readonly audit: AuditService,
    private readonly policy: AutomationPolicyService,
    private readonly actions: AutomationActionExecutor,
    private readonly config: AutomationConfig,
  ) {}

  // ---------------------------------------------------------------- claim
  private async tryLock(client: PoolClient, key: string): Promise<boolean> {
    const r = await client.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS ok', [key]);
    return r.rows[0].ok === true;
  }

  /**
   * Claims runnable jobs while enforcing per-tenant, per-rule and per-target concurrency. Advisory transaction
   * locks serialize the check-then-claim across workers; try-locks never block, so they cannot deadlock.
   * attempts is incremented here (not on completion) so a crash mid-run still consumes an attempt.
   */
  async claim(limit: number): Promise<JobRow[]> {
    const client = await this.db.connect();
    const claimed: JobRow[] = [];
    try {
      await client.query('BEGIN');
      const candidates = await client.query(
        `SELECT j.id,j.tenant_id AS "tenantId",j.rule_id AS "ruleId",j.concurrency_key AS "concurrencyKey",j.timeout_ms AS "timeoutMs",r.max_concurrency AS "maxConcurrency"
           FROM automation_jobs j JOIN automation_rules r ON r.tenant_id=j.tenant_id AND r.id=j.rule_id
          WHERE j.status='PENDING' AND j.next_attempt_at<=now() AND j.attempts<j.max_attempts
          ORDER BY j.next_attempt_at,j.created_at
          FOR UPDATE OF j SKIP LOCKED LIMIT $1`, [limit * 4]);
      for (const c of candidates.rows) {
        if (claimed.length >= limit) break;
        if (!(await this.tryLock(client, `automation:tenant:${c.tenantId}`))) continue;
        if (!(await this.tryLock(client, `automation:rule:${c.tenantId}:${c.ruleId}`))) continue;
        if (c.concurrencyKey && !(await this.tryLock(client, `automation:key:${c.tenantId}:${c.concurrencyKey}`))) continue;
        const running = await client.query(
          `SELECT count(*) FILTER (WHERE tenant_id=$1)::int AS tenant,
                  count(*) FILTER (WHERE rule_id=$2)::int AS rule,
                  count(*) FILTER (WHERE $3::text IS NOT NULL AND concurrency_key=$3)::int AS key
             FROM automation_jobs WHERE tenant_id=$1 AND status='RUNNING' AND lease_expires_at>now()`, [c.tenantId, c.ruleId, c.concurrencyKey]);
        const n = running.rows[0];
        if (n.tenant >= this.config.tenantMaxInflight || n.rule >= c.maxConcurrency || (c.concurrencyKey && n.key >= 1)) continue;
        const upd = await client.query(
          `UPDATE automation_jobs SET status='RUNNING',attempts=attempts+1,locked_at=now(),locked_by=$2,
                  lease_expires_at=now()+make_interval(secs=>$3),started_at=COALESCE(started_at,now()),updated_at=now()
            WHERE id=$1 RETURNING ${JOB_COLUMNS}`, [c.id, this.workerId, (c.timeoutMs + this.config.leaseGraceMs) / 1000]);
        const job = upd.rows[0] as JobRow;
        await client.query('INSERT INTO automation_job_attempts(tenant_id,job_id,cycle,attempt,worker_id) VALUES($1,$2,$3,$4,$5)', [job.tenantId, job.id, job.requeueCount, job.attempts, this.workerId]);
        claimed.push(job);
      }
      await client.query('COMMIT');
      return claimed;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  async runBatch(limit = this.config.batchSize): Promise<number> {
    const jobs = await this.claim(limit);
    await Promise.all(jobs.map((job) => this.runClaimed(job).catch((e) => this.logger.error(`Job ${job.id} runner error: ${e instanceof Error ? e.stack : e}`))));
    return jobs.length;
  }

  // ---------------------------------------------------------------- run
  async runClaimed(job: JobRow): Promise<void> {
    const started = Date.now();
    let decision: PolicyDecision;
    try { decision = await this.policy.evaluate(job); }
    catch (error) { return this.fail(job, classifyError(error), Date.now() - started); }

    if (decision.decision === 'CANCEL') return this.settleTerminal(job, 'CANCELLED', decision.code, decision.reason);
    if (decision.decision === 'DENY') return this.settleTerminal(job, 'DENIED', decision.code, decision.reason);
    if (decision.decision === 'REQUIRE_APPROVAL') return this.awaitApproval(job, decision.code, decision.reason);

    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new ActionTimeoutError(job.timeoutMs)); }, job.timeoutMs); });
    try {
      const outcome = await Promise.race([this.actions.execute({ job, principal: decision.principal, signal: controller.signal }), timeout]);
      await this.succeed(job, outcome, Date.now() - started, decision.confirmedBy);
    } catch (error) {
      if (error instanceof ActionNoopError) await this.succeed(job, { result: { noop: true, code: error.code, message: error.message }, noop: true }, Date.now() - started, decision.confirmedBy);
      else await this.fail(job, classifyError(error), Date.now() - started);
    } finally { if (timer) clearTimeout(timer); }
  }

  // ---------------------------------------------------------------- state transitions (each atomic with its audit row)
  private async tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.db.connect();
    try { await client.query('BEGIN'); const out = await fn(client); await client.query('COMMIT'); return out; }
    catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
    finally { client.release(); }
  }

  /** Fenced on (status, worker, attempt): a worker whose lease was recovered cannot overwrite the newer owner's result. */
  private readonly OWNED = `tenant_id=$1 AND id=$2 AND status='RUNNING' AND locked_by=$3 AND attempts=$4`;
  private auditCtx(job: JobRow) { return { correlationId: job.correlationId ?? undefined }; }

  private async closeAttempt(c: PoolClient, job: JobRow, outcome: string, ms: number, code?: string, message?: string) {
    await c.query(`UPDATE automation_job_attempts SET finished_at=now(),outcome=$4,error_code=$5,error_message=$6,duration_ms=$7 WHERE tenant_id=$1 AND job_id=$2 AND cycle=$8 AND attempt=$3`,
      [job.tenantId, job.id, job.attempts, outcome, code ?? null, message?.slice(0, 1000) ?? null, ms, job.requeueCount]);
  }

  private async succeed(job: JobRow, outcome: ActionOutcome, ms: number, confirmedBy: string) {
    await this.tx(async (c) => {
      const r = await c.query(`UPDATE automation_jobs SET status='SUCCEEDED',result=$5::jsonb,completed_at=now(),locked_at=NULL,locked_by=NULL,lease_expires_at=NULL,last_error=NULL,last_error_code=NULL,updated_at=now()
        WHERE ${this.OWNED}`, [job.tenantId, job.id, this.workerId, job.attempts, JSON.stringify(outcome.result)]);
      if (!r.rowCount) return this.logger.warn(`Job ${job.id} lost its lease before recording success (side effect may have occurred; actions are idempotent)`);
      await this.closeAttempt(c, job, outcome.noop ? 'NOOP' : 'SUCCEEDED', ms);
      await this.audit.record(job.tenantId, 'AUTOMATION_ACTION_SUCCEEDED', 'automation_job', job.id,
        { ruleId: job.ruleId, event: job.eventType, actionType: job.actionType, risk: job.risk, attempt: job.attempts, noop: outcome.noop === true, confirmedBy, result: outcome.result }, this.auditCtx(job), c);
    });
  }

  private async settleTerminal(job: JobRow, status: 'DENIED' | 'CANCELLED', code: string, reason: string) {
    await this.tx(async (c) => {
      const r = await c.query(`UPDATE automation_jobs SET status=$5,last_error=$6,last_error_code=$7,decision=$8::jsonb,completed_at=now(),locked_at=NULL,locked_by=NULL,lease_expires_at=NULL,updated_at=now()
        WHERE ${this.OWNED}`, [job.tenantId, job.id, this.workerId, job.attempts, status, reason, code, JSON.stringify({ code, reason })]);
      if (!r.rowCount) return;
      await this.closeAttempt(c, job, 'DENIED', 0, code, reason);
      await this.audit.record(job.tenantId, status === 'DENIED' ? 'AUTOMATION_POLICY_DENIED' : 'AUTOMATION_JOB_CANCELLED', 'automation_job', job.id,
        { ruleId: job.ruleId, event: job.eventType, actionType: job.actionType, risk: job.risk, code, reason }, this.auditCtx(job), c);
    });
  }

  /** Waiting for a human is not a failed attempt: the attempt is refunded so approval latency cannot exhaust retries. */
  private async awaitApproval(job: JobRow, code: string, reason: string) {
    await this.tx(async (c) => {
      const r = await c.query(`UPDATE automation_jobs SET status='WAITING_APPROVAL',attempts=attempts-1,approval_expires_at=now()+make_interval(hours=>$5),decision=$6::jsonb,
          locked_at=NULL,locked_by=NULL,lease_expires_at=NULL,updated_at=now() WHERE ${this.OWNED}`,
        [job.tenantId, job.id, this.workerId, job.attempts, this.config.approvalTtlHours, JSON.stringify({ code, reason })]);
      if (!r.rowCount) return;
      await c.query('DELETE FROM automation_job_attempts WHERE tenant_id=$1 AND job_id=$2 AND cycle=$4 AND attempt=$3', [job.tenantId, job.id, job.attempts, job.requeueCount]);
      await this.audit.record(job.tenantId, 'AUTOMATION_APPROVAL_REQUESTED', 'automation_job', job.id,
        { ruleId: job.ruleId, event: job.eventType, actionType: job.actionType, subject: job.subjectKey, reason }, this.auditCtx(job), c);
    });
  }

  private async fail(job: JobRow, cls: ErrorClassification, ms: number) {
    const exhausted = job.attempts >= job.maxAttempts;
    const dead: DeadReason | null = !cls.retryable ? 'NON_RETRYABLE' : exhausted ? 'RETRIES_EXHAUSTED' : null;
    await this.tx(async (c) => {
      const delaySec = Math.max(1, Math.round(computeBackoffMs(job.attempts) / 1000));
      const r = await c.query(
        `UPDATE automation_jobs SET status=$5,last_error=$6,last_error_code=$7,locked_at=NULL,locked_by=NULL,lease_expires_at=NULL,
                next_attempt_at=CASE WHEN $5='PENDING' THEN now()+make_interval(secs=>$8) ELSE next_attempt_at END,
                completed_at=CASE WHEN $5='DEAD' THEN now() ELSE NULL END,updated_at=now()
          WHERE ${this.OWNED}`,
        [job.tenantId, job.id, this.workerId, job.attempts, dead ? 'DEAD' : 'PENDING', cls.message, cls.code, delaySec]);
      if (!r.rowCount) return;
      await this.closeAttempt(c, job, cls.timeout ? 'TIMEOUT' : 'FAILED', ms, cls.code, cls.message);
      if (dead) await this.deadLetterJob(c, job, dead, cls.code, cls.message);
      await this.audit.record(job.tenantId, dead ? 'AUTOMATION_ACTION_DEAD_LETTERED' : 'AUTOMATION_ACTION_FAILED', 'automation_job', job.id,
        { ruleId: job.ruleId, event: job.eventType, actionType: job.actionType, risk: job.risk, attempt: job.attempts, maxAttempts: job.maxAttempts, code: cls.code, error: cls.message,
          willRetry: !dead, retryInSeconds: dead ? null : delaySec, deadLetterReason: dead }, this.auditCtx(job), c);
    });
  }

  private async deadLetterJob(c: PoolClient, job: Pick<JobRow, 'tenantId' | 'id' | 'ruleId' | 'eventType' | 'actionType' | 'subjectKey' | 'attempts'>, reason: DeadReason, code: string, message: string) {
    await c.query(
      `INSERT INTO automation_dead_letters(tenant_id,kind,job_id,event_id,rule_id,reason,error_code,error_message,attempts,snapshot)
       SELECT $1,'JOB',$2,j.event_id,$3,$4,$5,$6,$7,$8::jsonb FROM automation_jobs j WHERE j.tenant_id=$1 AND j.id=$2
       ON CONFLICT DO NOTHING`,
      [job.tenantId, job.id, job.ruleId, reason, code, message.slice(0, 1000), job.attempts,
        JSON.stringify({ event: job.eventType, actionType: job.actionType, subject: job.subjectKey })]);
  }

  // ---------------------------------------------------------------- housekeeping
  /** Jobs whose worker died. Requeued with a delay, or dead-lettered if no attempts remain. Never left RUNNING forever. */
  async recoverExpiredLeases(): Promise<{ requeued: number; dead: number }> {
    return this.tx(async (c) => {
      const r = await c.query(
        `WITH expired AS (SELECT id FROM automation_jobs WHERE status='RUNNING' AND lease_expires_at<now() ORDER BY lease_expires_at FOR UPDATE SKIP LOCKED LIMIT 50)
         UPDATE automation_jobs j SET status=CASE WHEN j.attempts>=j.max_attempts THEN 'DEAD' ELSE 'PENDING' END,
                next_attempt_at=now()+interval '30 seconds',locked_at=NULL,locked_by=NULL,lease_expires_at=NULL,
                last_error='Worker lease expired before the job reported a result',last_error_code='LEASE_EXPIRED',
                completed_at=CASE WHEN j.attempts>=j.max_attempts THEN now() ELSE NULL END,updated_at=now()
           FROM expired WHERE j.id=expired.id
         RETURNING j.id,j.tenant_id AS "tenantId",j.rule_id AS "ruleId",j.event_type AS "eventType",j.action_type AS "actionType",j.subject_key AS "subjectKey",j.attempts,j.requeue_count AS "requeueCount",j.status,j.correlation_id AS "correlationId"`);
      let dead = 0;
      for (const row of r.rows) {
        await c.query(`UPDATE automation_job_attempts SET finished_at=now(),outcome='LEASE_EXPIRED',error_code='LEASE_EXPIRED' WHERE tenant_id=$1 AND job_id=$2 AND cycle=$4 AND attempt=$3 AND outcome IS NULL`, [row.tenantId, row.id, row.attempts, row.requeueCount]);
        if (row.status === 'DEAD') { dead++; await this.deadLetterJob(c, row, 'LEASE_EXPIRED_EXHAUSTED', 'LEASE_EXPIRED', 'Worker repeatedly died while running this job'); }
        await this.audit.record(row.tenantId, row.status === 'DEAD' ? 'AUTOMATION_ACTION_DEAD_LETTERED' : 'AUTOMATION_LEASE_RECOVERED', 'automation_job', row.id,
          { ruleId: row.ruleId, actionType: row.actionType, attempt: row.attempts, deadLetterReason: row.status === 'DEAD' ? 'LEASE_EXPIRED_EXHAUSTED' : null }, { correlationId: row.correlationId ?? undefined }, c);
      }
      return { requeued: r.rowCount! - dead, dead };
    });
  }

  async expireApprovals(): Promise<number> {
    return this.tx(async (c) => {
      const r = await c.query(
        `WITH due AS (SELECT id FROM automation_jobs WHERE status='WAITING_APPROVAL' AND approval_expires_at<now() FOR UPDATE SKIP LOCKED LIMIT 100)
         UPDATE automation_jobs j SET status='EXPIRED',completed_at=now(),last_error='Approval window elapsed',last_error_code='APPROVAL_EXPIRED',updated_at=now()
           FROM due WHERE j.id=due.id RETURNING j.id,j.tenant_id AS "tenantId",j.rule_id AS "ruleId",j.action_type AS "actionType"`);
      for (const row of r.rows) await this.audit.record(row.tenantId, 'AUTOMATION_JOB_EXPIRED', 'automation_job', row.id, { ruleId: row.ruleId, actionType: row.actionType }, {}, c);
      return r.rowCount ?? 0;
    });
  }

  /** Bounded batch deletes so retention never takes long locks. Open dead letters keep their jobs. */
  async purge(): Promise<Record<string, number>> {
    const days = this.config.retentionDays; const out: Record<string, number> = {};
    const run = async (name: string, sql: string, params: unknown[] = [days]) => { out[name] = (await this.db.query(sql, params)).rowCount ?? 0; };
    await run('jobs', `DELETE FROM automation_jobs WHERE id IN (SELECT j.id FROM automation_jobs j WHERE j.completed_at < now()-make_interval(days=>$1)
        AND j.status IN ('SUCCEEDED','DENIED','CANCELLED','EXPIRED','DEAD')
        AND NOT EXISTS (SELECT 1 FROM automation_dead_letters d WHERE d.tenant_id=j.tenant_id AND d.job_id=j.id AND d.status='OPEN') LIMIT 1000)`);
    await run('ruleRuns', `DELETE FROM automation_rule_runs WHERE id IN (SELECT id FROM automation_rule_runs WHERE started_at < now()-make_interval(days=>$1) LIMIT 2000)`);
    await run('receipts', `DELETE FROM automation_event_receipts WHERE (tenant_id,event_id) IN (SELECT tenant_id,event_id FROM automation_event_receipts WHERE status='COMPLETED' AND completed_at < now()-make_interval(days=>$1) LIMIT 2000)`);
    await run('cooldowns', `DELETE FROM automation_cooldowns WHERE last_fired_at < now()-interval '8 days'`, []);
    await run('heartbeats', `DELETE FROM automation_worker_heartbeats WHERE last_tick_at < now()-interval '1 day'`, []);
    return out;
  }
}
