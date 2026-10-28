import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditService } from '../audit/audit.service';
import { CommandAuthorizationService } from '../commands/command-authorization.service';
import { ACTION_CATALOG, EVENT_CATALOG } from './automation.catalog';
import { commandTextFor } from './automation.policy';
import { MAX_REQUEUES } from './automation.retry';

export interface OpsActor { userId: string; role: string }
const JOB_STATUSES = ['PENDING', 'WAITING_APPROVAL', 'RUNNING', 'SUCCEEDED', 'DENIED', 'CANCELLED', 'EXPIRED', 'DEAD'];

const JOB_LIST = `j.id,j.rule_id AS "ruleId",r.name AS "ruleName",j.rule_version AS "ruleVersion",j.event_id AS "eventId",j.event_type AS "eventType",
  j.action_index AS "actionIndex",j.action_type AS "actionType",j.risk,j.subject_key AS "subject",j.status,j.attempts,j.max_attempts AS "maxAttempts",
  j.requeue_count AS "requeueCount",j.next_attempt_at AS "nextAttemptAt",j.last_error AS "lastError",j.last_error_code AS "lastErrorCode",
  j.created_at AS "createdAt",j.started_at AS "startedAt",j.completed_at AS "completedAt",j.approval_expires_at AS "approvalExpiresAt",
  (j.status='PENDING' AND j.attempts>0) AS "retrying"`;

@Injectable()
export class AutomationOpsService {
  constructor(
    @Inject(PG_POOL) private readonly db: Pool,
    private readonly audit: AuditService,
    private readonly authorizer: CommandAuthorizationService = new CommandAuthorizationService(),
  ) {}

  catalog() {
    return { events: EVENT_CATALOG.map((e) => ({ name: e.canonical, description: e.description, source: e.source, fields: e.fields, aliases: e.rawTypes })), actions: ACTION_CATALOG };
  }

  async overview(tenantId: string) {
    const [jobs, intake, dead, recent, rules, workers] = await Promise.all([
      this.db.query(`SELECT status,count(*)::int AS n FROM automation_jobs WHERE tenant_id=$1 AND (status IN ('PENDING','WAITING_APPROVAL','RUNNING') OR created_at>now()-interval '24 hours') GROUP BY status`, [tenantId]),
      this.db.query(`SELECT count(*) FILTER (WHERE status IN ('PENDING','FAILED','PROCESSING'))::int AS pending,
                            count(*) FILTER (WHERE status='DEAD')::int AS dead,
                            COALESCE(extract(epoch FROM now()-min(created_at) FILTER (WHERE status IN ('PENDING','FAILED'))),0)::int AS "oldestPendingSeconds"
                       FROM automation_event_receipts WHERE tenant_id=$1 AND created_at>now()-interval '7 days'`, [tenantId]),
      this.db.query(`SELECT kind,count(*)::int AS n FROM automation_dead_letters WHERE tenant_id=$1 AND status='OPEN' GROUP BY kind`, [tenantId]),
      this.db.query(`SELECT count(*) FILTER (WHERE status='PENDING' AND attempts>0)::int AS retrying,
                            count(*) FILTER (WHERE status='PENDING' AND attempts=0 AND next_attempt_at<=now())::int AS ready,
                            COALESCE(extract(epoch FROM now()-min(next_attempt_at) FILTER (WHERE status='PENDING' AND next_attempt_at<=now())),0)::int AS "oldestReadySeconds",
                            count(*) FILTER (WHERE status='RUNNING' AND lease_expires_at<now())::int AS "staleLeases"
                       FROM automation_jobs WHERE tenant_id=$1 AND status IN ('PENDING','RUNNING')`, [tenantId]),
      this.db.query(`SELECT r.id AS "ruleId",r.name,count(*)::int AS failures FROM automation_jobs j JOIN automation_rules r ON r.tenant_id=j.tenant_id AND r.id=j.rule_id
                      WHERE j.tenant_id=$1 AND j.last_error_code IS NOT NULL AND j.status IN ('DEAD','PENDING') AND j.updated_at>now()-interval '24 hours'
                      GROUP BY r.id,r.name ORDER BY failures DESC LIMIT 5`, [tenantId]),
      this.db.query(`SELECT count(*) FILTER (WHERE last_tick_at>now()-interval '30 seconds')::int AS alive,
                            COALESCE(extract(epoch FROM now()-max(last_tick_at)),NULL)::int AS "lastTickAgeSeconds",
                            max(last_error_at) AS "lastErrorAt" FROM automation_worker_heartbeats`),
    ]);
    const byStatus: Record<string, number> = Object.fromEntries(JOB_STATUSES.map((s) => [s, 0]));
    for (const r of jobs.rows) byStatus[r.status] = r.n;
    const deadByKind = Object.fromEntries(dead.rows.map((r) => [r.kind, r.n]));
    const q = recent.rows[0], w = workers.rows[0], i = intake.rows[0];
    const openDead = (deadByKind.JOB ?? 0) + (deadByKind.EVENT ?? 0);
    const stalled = w.alive === 0 || q.oldestReadySeconds > 120 || i.oldestPendingSeconds > 120;
    const degraded = openDead > 0 || q.staleLeases > 0 || i.dead > 0;
    return {
      health: { status: stalled ? 'STALLED' : degraded ? 'DEGRADED' : 'OK',
        reasons: [w.alive === 0 && 'NO_ACTIVE_WORKER', q.oldestReadySeconds > 120 && 'JOB_BACKLOG_AGE', i.oldestPendingSeconds > 120 && 'EVENT_BACKLOG_AGE',
          openDead > 0 && 'OPEN_DEAD_LETTERS', q.staleLeases > 0 && 'STALE_LEASES', i.dead > 0 && 'DEAD_EVENT_RECEIPTS'].filter(Boolean) },
      workers: { active: w.alive, lastTickAgeSeconds: w.lastTickAgeSeconds, lastErrorAt: w.lastErrorAt },
      jobs: { byStatus, retrying: q.retrying, ready: q.ready, oldestReadySeconds: q.oldestReadySeconds, staleLeases: q.staleLeases, windowNote: 'Active states are exact; terminal states cover the last 24h' },
      events: { pendingReceipts: i.pending, deadReceipts: i.dead, oldestPendingSeconds: i.oldestPendingSeconds },
      deadLetters: { open: openDead, byKind: deadByKind },
      topFailingRules: rules.rows,
    };
  }

  async listJobs(tenantId: string, f: { status?: string; ruleId?: string; eventType?: string; limit?: number; before?: string }) {
    if (f.status && !JOB_STATUSES.includes(f.status)) throw new BadRequestException('Unknown job status');
    const limit = Math.min(Math.max(Math.trunc(f.limit || 50), 1), 200);
    const r = await this.db.query(
      `SELECT ${JOB_LIST} FROM automation_jobs j JOIN automation_rules r ON r.tenant_id=j.tenant_id AND r.id=j.rule_id
        WHERE j.tenant_id=$1 AND ($2::text IS NULL OR j.status=$2) AND ($3::uuid IS NULL OR j.rule_id=$3)
          AND ($4::text IS NULL OR j.event_type=$4) AND ($5::timestamptz IS NULL OR j.created_at<$5)
        ORDER BY j.created_at DESC LIMIT $6`, [tenantId, f.status ?? null, f.ruleId ?? null, f.eventType ?? null, f.before ?? null, limit]);
    return { data: r.rows, nextBefore: r.rows.length === limit ? r.rows[r.rows.length - 1].createdAt : null };
  }

  async getJob(tenantId: string, id: string) {
    const job = await this.db.query(`SELECT ${JOB_LIST},j.result,j.decision,j.approved_by AS "approvedBy",j.approved_at AS "approvedAt",j.approval_note AS "approvalNote",j.correlation_id AS "correlationId"
      FROM automation_jobs j JOIN automation_rules r ON r.tenant_id=j.tenant_id AND r.id=j.rule_id WHERE j.tenant_id=$1 AND j.id=$2`, [tenantId, id]);
    if (!job.rowCount) throw new NotFoundException('Automation job not found');
    const attempts = await this.db.query(`SELECT cycle,attempt,worker_id AS "workerId",started_at AS "startedAt",finished_at AS "finishedAt",outcome,error_code AS "errorCode",error_message AS "errorMessage",duration_ms AS "durationMs"
      FROM automation_job_attempts WHERE tenant_id=$1 AND job_id=$2 ORDER BY cycle,attempt`, [tenantId, id]);
    const audit = await this.db.query(`SELECT action,created_at AS "createdAt",actor_user_id AS "actorUserId",metadata FROM audit_logs WHERE tenant_id=$1 AND resource_type='automation_job' AND resource_id=$2 ORDER BY created_at LIMIT 50`, [tenantId, id]);
    return { ...job.rows[0], attempts: attempts.rows, audit: audit.rows };
  }

  private async tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const c = await this.db.connect();
    try { await c.query('BEGIN'); const out = await fn(c); await c.query('COMMIT'); return out; }
    catch (e) { await c.query('ROLLBACK').catch(() => undefined); throw e; } finally { c.release(); }
  }

  async cancelJob(tenantId: string, actor: OpsActor, id: string, note?: string) {
    return this.tx(async (c) => {
      const r = await c.query(`UPDATE automation_jobs SET status='CANCELLED',completed_at=now(),last_error='Cancelled by operator',last_error_code='CANCELLED_BY_OPERATOR',updated_at=now()
        WHERE tenant_id=$1 AND id=$2 AND status IN ('PENDING','WAITING_APPROVAL') RETURNING id,status`, [tenantId, id]);
      if (!r.rowCount) throw new ConflictException('Only pending or approval-waiting jobs can be cancelled (running jobs finish or expire on their own)');
      await this.audit.record(tenantId, 'AUTOMATION_JOB_CANCELLED', 'automation_job', id, { note, by: 'OPERATOR' }, { userId: actor.userId }, c);
      return r.rows[0];
    });
  }

  async decideApproval(tenantId: string, actor: OpsActor, id: string, approve: boolean, note: string) {
    return this.tx(async (c) => {
      const j = await c.query(`SELECT id,rule_id,action_type,action,payload,risk FROM automation_jobs WHERE tenant_id=$1 AND id=$2 AND status='WAITING_APPROVAL' FOR UPDATE`, [tenantId, id]);
      if (!j.rowCount) throw new NotFoundException('No job awaiting approval with that id');
      const row = j.rows[0];
      if (approve) {
        // Same authorizer as manual confirmation: only operator roles may confirm a destructive command.
        const command = commandTextFor({ actionType: row.action_type, action: row.action, payload: row.payload }) ?? 'terminate session';
        const d = this.authorizer.authorize({ role: actor.role }, command, { confirmed: true });
        if (d.decision !== 'ALLOW') throw new ForbiddenException('decision' in d && d.decision === 'DENY' ? d.reason : 'Not permitted to approve');
      }
      const r = approve
        ? await c.query(`UPDATE automation_jobs SET status='PENDING',approved_by=$3,approved_at=now(),approval_note=$4,next_attempt_at=now(),updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,status`, [tenantId, id, actor.userId, note])
        : await c.query(`UPDATE automation_jobs SET status='CANCELLED',completed_at=now(),approval_note=$3,last_error='Approval rejected',last_error_code='APPROVAL_REJECTED',updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,status`, [tenantId, id, note]);
      await this.audit.record(tenantId, approve ? 'AUTOMATION_JOB_APPROVED' : 'AUTOMATION_JOB_REJECTED', 'automation_job', id, { ruleId: row.rule_id, actionType: row.action_type, note }, { userId: actor.userId }, c);
      return r.rows[0];
    });
  }

  async listDeadLetters(tenantId: string, status = 'OPEN', limit = 100) {
    if (!['OPEN', 'REQUEUED', 'DISMISSED'].includes(status)) throw new BadRequestException('Unknown dead-letter status');
    const r = await this.db.query(`SELECT d.id,d.kind,d.job_id AS "jobId",d.event_id AS "eventId",d.rule_id AS "ruleId",d.reason,d.error_code AS "errorCode",d.error_message AS "errorMessage",
        d.attempts,d.snapshot,d.status,d.created_at AS "createdAt",d.resolved_at AS "resolvedAt",d.resolution_note AS "resolutionNote",COALESCE(j.requeue_count,rc.requeue_count,0) AS "requeueCount"
      FROM automation_dead_letters d LEFT JOIN automation_jobs j ON d.kind='JOB' AND j.tenant_id=d.tenant_id AND j.id=d.job_id
      LEFT JOIN automation_event_receipts rc ON d.kind='EVENT' AND rc.tenant_id=d.tenant_id AND rc.event_id=d.event_id
      WHERE d.tenant_id=$1 AND d.status=$2 ORDER BY d.created_at DESC LIMIT $3`, [tenantId, status, Math.min(Math.max(limit, 1), 200)]);
    return { data: r.rows, maxRequeues: MAX_REQUEUES };
  }

  async requeueDeadLetter(tenantId: string, actor: OpsActor, id: string, note: string) {
    return this.tx(async (c) => {
      const d = await c.query(`SELECT id,kind,job_id,event_id FROM automation_dead_letters WHERE tenant_id=$1 AND id=$2 AND status='OPEN' FOR UPDATE`, [tenantId, id]);
      if (!d.rowCount) throw new NotFoundException('Open dead letter not found');
      const dl = d.rows[0];
      const moved = dl.kind === 'JOB'
        ? await c.query(`UPDATE automation_jobs SET status='PENDING',attempts=0,requeue_count=requeue_count+1,next_attempt_at=now(),completed_at=NULL,last_error=NULL,last_error_code=NULL,
              approved_by=CASE WHEN risk='DESTRUCTIVE' THEN NULL ELSE approved_by END,approved_at=CASE WHEN risk='DESTRUCTIVE' THEN NULL ELSE approved_at END,updated_at=now()
            WHERE tenant_id=$1 AND id=$2 AND status='DEAD' AND requeue_count<$3 RETURNING id`, [tenantId, dl.job_id, MAX_REQUEUES])
        : await c.query(`UPDATE automation_event_receipts SET status='PENDING',attempts=0,requeue_count=requeue_count+1,next_attempt_at=now(),locked_at=NULL,last_error=NULL
            WHERE tenant_id=$1 AND event_id=$2 AND status='DEAD' AND requeue_count<$3 RETURNING event_id`, [tenantId, dl.event_id, MAX_REQUEUES]);
      if (!moved.rowCount) throw new ConflictException(`Requeue refused: the item is not dead or has already been requeued ${MAX_REQUEUES} times. Fix the cause, then recreate the work.`);
      await c.query(`UPDATE automation_dead_letters SET status='REQUEUED',resolved_by=$3,resolved_at=now(),resolution_note=$4 WHERE tenant_id=$1 AND id=$2`, [tenantId, id, actor.userId, note]);
      await this.audit.record(tenantId, 'AUTOMATION_DEAD_LETTER_REQUEUED', 'automation_dead_letter', id, { kind: dl.kind, jobId: dl.job_id, eventId: dl.event_id, note }, { userId: actor.userId }, c);
      return { id, status: 'REQUEUED' };
    });
  }

  async dismissDeadLetter(tenantId: string, actor: OpsActor, id: string, note: string) {
    return this.tx(async (c) => {
      const r = await c.query(`UPDATE automation_dead_letters SET status='DISMISSED',resolved_by=$3,resolved_at=now(),resolution_note=$4 WHERE tenant_id=$1 AND id=$2 AND status='OPEN' RETURNING id,status`, [tenantId, id, actor.userId, note]);
      if (!r.rowCount) throw new NotFoundException('Open dead letter not found');
      await this.audit.record(tenantId, 'AUTOMATION_DEAD_LETTER_DISMISSED', 'automation_dead_letter', id, { note }, { userId: actor.userId }, c);
      return r.rows[0];
    });
  }
}
