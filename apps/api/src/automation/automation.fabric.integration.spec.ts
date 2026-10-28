/**
 * Integration tests against a REAL PostgreSQL with all migrations applied.
 *   AUTOMATION_TEST_DATABASE_URL=postgresql://user@host:5432/db pnpm --filter @jaslyn-net/api test automation.fabric
 * Skipped (not failed) when the variable is unset.
 */
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { CommandAuthorizationService } from '../commands/command-authorization.service';
import { CommandFabricService } from '../commands/command-fabric.service';
import { NetworkCommandService } from '../modules/traffic/network-command.service';
import { AutomationActionExecutor } from './automation.actions';
import { AutomationConfig } from './automation.config';
import { AutomationFanoutService } from './automation.fanout.service';
import { AutomationOpsService } from './automation.ops.service';
import { AutomationPolicyService } from './automation.policy';
import { AutomationJobRunner } from './automation.runner';
import { AutomationService } from './automation.service';
import { NonRetryableError } from './automation.retry';

const url = process.env.AUTOMATION_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite('automation fabric (PostgreSQL)', () => {
  jest.setTimeout(60_000);
  let pool: Pool;
  const env: Record<string, string | undefined> = {};
  const config = new AutomationConfig({ get: (k: string) => env[k] } as never);
  let audit: AuditService; let fanout: AutomationFanoutService; let runner: AutomationJobRunner; let rules: AutomationService; let ops: AutomationOpsService;
  let executor: AutomationActionExecutor;

  const q = (sql: string, p: unknown[] = []) => pool.query(sql, p);

  interface Fx { tenantId: string; ownerId: string; cashierId: string; locationId: string; routerId: string }
  async function tenant(): Promise<Fx> {
    const slug = `t-${randomUUID().slice(0, 8)}`;
    const t = (await q(`INSERT INTO tenants(name,slug,status) VALUES($1,$1,'ACTIVE') RETURNING id`, [slug])).rows[0].id;
    const user = async (role: string) => (await q(`INSERT INTO users(tenant_id,email,password_hash,full_name,role) VALUES($1,$2,'x','U',$3) RETURNING id`, [t, `${role}-${slug}@x.test`, role])).rows[0].id;
    const ownerId = await user('OWNER'), cashierId = await user('CASHIER');
    const locationId = (await q(`INSERT INTO locations(tenant_id,name) VALUES($1,'HQ') RETURNING id`, [t])).rows[0].id;
    const routerId = (await q(`INSERT INTO routers(tenant_id,name,location_id,status,api_enabled,management_enabled,api_endpoint,management_protocol)
      VALUES($1,'R1',$2,'ONLINE',true,true,'https://router.example/api','MIKROTIK_REST') RETURNING id`, [t, locationId])).rows[0].id;
    return { tenantId: t, ownerId, cashierId, locationId, routerId };
  }

  /** The app marks outbox events PROCESSED after in-process delivery; do the same, then run the engine to quiescence. */
  async function drain(tenantId: string, rounds = 6) {
    for (let i = 0; i < rounds; i++) {
      await q(`UPDATE communication_domain_events SET status='PROCESSED',processed_at=now() WHERE tenant_id=$1 AND status='PENDING'`, [tenantId]);
      await fanout.intake(); await fanout.process(100);
      const ran = await runner.runBatch(50);
      if (!ran) { const pending = await q(`SELECT count(*)::int n FROM automation_jobs WHERE tenant_id=$1 AND status='PENDING' AND next_attempt_at<=now()`, [tenantId]); if (!pending.rows[0].n) break; }
    }
  }
  const events = async (t: string, type: string) => (await q(`SELECT * FROM communication_domain_events WHERE tenant_id=$1 AND event_type=$2 ORDER BY created_at`, [t, type])).rows;
  const jobs = async (t: string, where = '') => (await q(`SELECT * FROM automation_jobs WHERE tenant_id=$1 ${where} ORDER BY created_at`, [t])).rows;
  const mkRule = (fx: Fx, over: Record<string, unknown> = {}) => rules.createRule(fx.tenantId, fx.ownerId, {
    name: `r-${randomUUID().slice(0, 6)}`, eventType: 'device.offline', conditions: [], actions: [{ type: 'CREATE_ALERT', severity: 'HIGH', title: 'Router offline' }], enabled: true, ...over,
  } as never);
  const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms)); // lets updated_at < event.created_at for rule/event ordering

  beforeAll(async () => {
    pool = new Pool({ connectionString: url, max: 10 });
    audit = new AuditService(pool);
    const commands = new CommandFabricService(pool, audit, new NetworkCommandService(pool), new CommandAuthorizationService());
    const policy = new AutomationPolicyService(pool, config, new CommandAuthorizationService());
    executor = new AutomationActionExecutor(pool, commands);
    runner = new AutomationJobRunner(pool, audit, policy, executor, config);
    fanout = new AutomationFanoutService(pool, audit);
    rules = new AutomationService(pool, audit, new CommandAuthorizationService());
    ops = new AutomationOpsService(pool, audit, new CommandAuthorizationService());
  });
  afterAll(async () => { await pool?.end(); });
  beforeEach(async () => {
    for (const k of Object.keys(env)) delete env[k];
    // claim/recover are platform-wide by design; retire work left over by earlier tests so each test is isolated.
    await q(`UPDATE automation_jobs SET status='CANCELLED',completed_at=now(),lease_expires_at=NULL,locked_by=NULL WHERE status IN ('PENDING','RUNNING','WAITING_APPROVAL')`);
  });

  // ------------------------------------------------------------------ EVENT: every canonical event is emitted
  describe('canonical event emission (triggers)', () => {
    it('emits device.offline and device.recovered on router status changes, once per change', async () => {
      const fx = await tenant();
      await q(`UPDATE routers SET status='OFFLINE' WHERE id=$1`, [fx.routerId]);
      await q(`UPDATE routers SET status='OFFLINE',updated_at=now() WHERE id=$1`, [fx.routerId]); // no change: no event
      await q(`UPDATE routers SET status='ONLINE' WHERE id=$1`, [fx.routerId]);
      const off = await events(fx.tenantId, 'DEVICE.OFFLINE'), rec = await events(fx.tenantId, 'DEVICE.RECOVERED');
      expect(off).toHaveLength(1); expect(rec).toHaveLength(1);
      expect(off[0].payload).toMatchObject({ routerId: fx.routerId, locationId: fx.locationId, previousStatus: 'ONLINE', status: 'OFFLINE' });
    });
    it('emits incident.created and incident.resolved (any resolve path) without colliding with existing INCIDENT.* events', async () => {
      const fx = await tenant();
      const id = (await q(`INSERT INTO incidents(tenant_id,fingerprint,category,severity,status,title,root_resource_type,root_resource_id) VALUES($1,'fp','DEVICE_OFFLINE','CRITICAL','OPEN','Down','router',$2) RETURNING id`, [fx.tenantId, fx.routerId])).rows[0].id;
      await q(`UPDATE incidents SET status='RESOLVED',resolved_at=now() WHERE id=$1`, [id]);
      expect((await events(fx.tenantId, 'INCIDENT.CREATED'))[0].payload).toMatchObject({ incidentId: id, routerId: fx.routerId });
      expect(await events(fx.tenantId, 'INCIDENT.STATUS_RESOLVED')).toHaveLength(1);
      expect(await events(fx.tenantId, 'INCIDENT.RESOLVED')).toHaveLength(0);
    });
    it('emits payment.completed / payment.failed from the payments state machine and never leaks raw provider payloads', async () => {
      const fx = await tenant();
      const pay = async (key: string) => (await q(`INSERT INTO payments(tenant_id,provider,amount,currency,idempotency_key,status,raw_payload) VALUES($1,'mpesa',100,'TZS',$2,'PENDING','{"secret":"s3"}') RETURNING id`, [fx.tenantId, key])).rows[0].id;
      const a = await pay('a'), b = await pay('b');
      await q(`UPDATE payments SET status='PAID' WHERE id=$1`, [a]);
      await q(`UPDATE payments SET status='FAILED' WHERE id=$1`, [b]);
      const done = await events(fx.tenantId, 'PAYMENT.COMPLETED'), failed = await events(fx.tenantId, 'PAYMENT.FAILED');
      expect(done).toHaveLength(1); expect(failed).toHaveLength(1);
      expect(JSON.stringify(done[0].payload)).not.toContain('s3');
    });
    it('emits entitlement.expired when an access grant expires', async () => {
      const fx = await tenant();
      const cust = (await q(`INSERT INTO customers(tenant_id,full_name,username) VALUES($1,'C','c1') RETURNING id`, [fx.tenantId])).rows[0].id;
      const pkg = (await q(`INSERT INTO packages(tenant_id,name,price,duration_seconds) VALUES($1,'P',1,60) RETURNING id`, [fx.tenantId])).rows[0].id;
      const pur = (await q(`INSERT INTO wifi_plan_purchases(tenant_id,customer_id,package_id,price,currency) VALUES($1,$2,$3,1,'TZS') RETURNING id`, [fx.tenantId, cust, pkg])).rows[0].id;
      const g = (await q(`INSERT INTO access_grants(tenant_id,purchase_id,customer_id,status,network_policy) VALUES($1,$2,$3,'PENDING','{"a":1}') RETURNING id`, [fx.tenantId, pur, cust])).rows[0].id;
      await q(`UPDATE access_grants SET status='ACTIVE' WHERE id=$1`, [g]);
      expect(await events(fx.tenantId, 'ENTITLEMENT.EXPIRED')).toHaveLength(0);
      await q(`UPDATE access_grants SET status='EXPIRED' WHERE id=$1`, [g]);
      expect((await events(fx.tenantId, 'ENTITLEMENT.EXPIRED'))[0].payload).toMatchObject({ grantId: g, customerId: cust });
    });
    it('emits provider.degraded only when a WAN connection becomes DEGRADED/UNAVAILABLE', async () => {
      const fx = await tenant();
      const w = (await q(`INSERT INTO wan_connections(tenant_id,router_id,name,provider,capacity_mbps) VALUES($1,$2,'wan1','Vodacom',100) RETURNING id`, [fx.tenantId, fx.routerId])).rows[0].id;
      await q(`UPDATE wan_connections SET health_state='HEALTHY' WHERE id=$1`, [w]);
      expect(await events(fx.tenantId, 'PROVIDER.DEGRADED')).toHaveLength(0);
      await q(`UPDATE wan_connections SET health_state='DEGRADED' WHERE id=$1`, [w]);
      await q(`UPDATE wan_connections SET health_state='UNAVAILABLE' WHERE id=$1`, [w]);
      const ev = await events(fx.tenantId, 'PROVIDER.DEGRADED');
      expect(ev).toHaveLength(2);
      expect(ev[0].payload).toMatchObject({ provider: 'Vodacom', state: 'DEGRADED', routerId: fx.routerId, locationId: fx.locationId });
    });
    it('emits bandwidth.threshold only on escalation into FAIRNESS_ACTIVE/AGGRESSIVE', async () => {
      const fx = await tenant();
      const ins = (mode: string) => q(`INSERT INTO traffic_enforcement_events(tenant_id,router_id,mode,command_count,applied) VALUES($1,$2,$3,0,true)`, [fx.tenantId, fx.routerId, mode]);
      await ins('NORMAL'); await ins('FAIRNESS_ACTIVE'); await ins('FAIRNESS_ACTIVE'); await ins('AGGRESSIVE'); await ins('RECOVERING'); await ins('NORMAL');
      const ev = await events(fx.tenantId, 'BANDWIDTH.THRESHOLD');
      expect(ev.map((e) => e.payload.mode)).toEqual(['FAIRNESS_ACTIVE', 'AGGRESSIVE']);
      expect(ev[1].payload.previousMode).toBe('FAIRNESS_ACTIVE');
    });
    it('bounds subscriber.auth_failed to one event per NAS/username/minute', async () => {
      const fx = await tenant();
      const nas = (await q(`INSERT INTO radius_nas_clients(tenant_id,name,address,secret_encrypted) VALUES($1,'n','10.0.0.1','x') RETURNING id`, [fx.tenantId])).rows[0].id;
      for (let i = 0; i < 25; i++) await q(`INSERT INTO radius_events(tenant_id,nas_client_id,packet_code,packet_identifier,username,result) VALUES($1,$2,1,$3,'Mallory','REJECT')`, [fx.tenantId, nas, i]);
      await q(`INSERT INTO radius_events(tenant_id,nas_client_id,packet_code,packet_identifier,username,result) VALUES($1,$2,1,99,'alice','REJECT')`, [fx.tenantId, nas]);
      await q(`INSERT INTO radius_events(tenant_id,nas_client_id,packet_code,packet_identifier,username,result) VALUES($1,$2,1,100,'alice','ACCEPT')`, [fx.tenantId, nas]);
      const ev = await events(fx.tenantId, 'SUBSCRIBER.AUTH_FAILED');
      expect(ev).toHaveLength(2); // Mallory (x25 collapsed) + alice; the ACCEPT emitted nothing
    });
    it('emits session.started on insert; session.ended is the existing SESSION.ENDED event (single source)', async () => {
      const fx = await tenant();
      const s = (await q(`INSERT INTO sessions(tenant_id,router_id,username,status) VALUES($1,$2,'bob','ACTIVE') RETURNING id`, [fx.tenantId, fx.routerId])).rows[0].id;
      await q(`UPDATE sessions SET status='ENDED',ended_at=now() WHERE id=$1`, [s]);
      expect(await events(fx.tenantId, 'SESSION.STARTED')).toHaveLength(1);
      expect(await events(fx.tenantId, 'SESSION.ENDED')).toHaveLength(0); // service emits it; triggers must not duplicate
    });
  });

  // ------------------------------------------------------------------ EVENT -> RULE -> POLICY -> ACTION -> RESULT -> AUDIT
  describe('end-to-end pipeline', () => {
    it('runs a rule from a real state change to a result, with an evaluation trail and audit entries', async () => {
      const fx = await tenant();
      const rule = await mkRule(fx, { conditions: [{ path: 'routerId', op: 'exists' }] });
      await settle();
      await q(`UPDATE routers SET status='OFFLINE' WHERE id=$1`, [fx.routerId]);
      await drain(fx.tenantId);
      const [job] = await jobs(fx.tenantId);
      expect(job).toMatchObject({ status: 'SUCCEEDED', action_type: 'CREATE_ALERT', event_type: 'device.offline', attempts: 1 });
      expect((await q(`SELECT count(*)::int n FROM automation_alerts WHERE tenant_id=$1 AND rule_id=$2`, [fx.tenantId, rule.id])).rows[0].n).toBe(1);
      expect((await q(`SELECT status FROM automation_rule_runs WHERE tenant_id=$1 AND rule_id=$2`, [fx.tenantId, rule.id])).rows[0].status).toBe('QUEUED');
      const actions = (await q(`SELECT action FROM audit_logs WHERE tenant_id=$1 AND resource_id=$2`, [fx.tenantId, job.id])).rows.map((r) => r.action);
      expect(actions).toContain('AUTOMATION_ACTION_SUCCEEDED');
      const detail = await ops.getJob(fx.tenantId, job.id);
      expect(detail.attempts).toHaveLength(1); expect(detail.attempts[0].outcome).toBe('SUCCEEDED'); expect(detail.audit.length).toBeGreaterThan(0);
    });
    it('records NO_MATCH for conditions that do not hold and queues nothing', async () => {
      const fx = await tenant();
      const rule = await mkRule(fx, { conditions: [{ path: 'name', op: 'eq', value: 'someone-else' }] });
      await settle();
      await q(`UPDATE routers SET status='OFFLINE' WHERE id=$1`, [fx.routerId]);
      await drain(fx.tenantId);
      expect(await jobs(fx.tenantId)).toHaveLength(0);
      expect((await q(`SELECT status FROM automation_rule_runs WHERE rule_id=$1`, [rule.id])).rows[0].status).toBe('NO_MATCH');
    });
    it('does not fire for events that happened before the rule was enabled', async () => {
      const fx = await tenant();
      await q(`UPDATE routers SET status='OFFLINE' WHERE id=$1`, [fx.routerId]);
      await settle();
      await mkRule(fx);
      await drain(fx.tenantId);
      expect(await jobs(fx.tenantId)).toHaveLength(0);
    });
    it('honors tenant scope: a rule never sees another tenant\'s events, and ops views are tenant-isolated', async () => {
      const a = await tenant(), b = await tenant();
      await mkRule(a);
      await settle();
      await q(`UPDATE routers SET status='OFFLINE' WHERE id=$1`, [b.routerId]);
      await q(`UPDATE routers SET status='OFFLINE' WHERE id=$1`, [a.routerId]);
      await drain(a.tenantId); await drain(b.tenantId);
      expect(await jobs(a.tenantId)).toHaveLength(1);
      expect(await jobs(b.tenantId)).toHaveLength(0);
      const aJob = (await jobs(a.tenantId))[0];
      await expect(ops.getJob(b.tenantId, aJob.id)).rejects.toThrow(/not found/);
      expect((await ops.listJobs(b.tenantId, {})).data).toHaveLength(0);
    });
    it('narrows by location/router scope and fails closed when the event cannot be placed', async () => {
      const fx = await tenant();
      const otherLoc = (await q(`INSERT INTO locations(tenant_id,name) VALUES($1,'Other') RETURNING id`, [fx.tenantId])).rows[0].id;
      const other = (await q(`INSERT INTO routers(tenant_id,name,location_id,status) VALUES($1,'R2',$2,'ONLINE') RETURNING id`, [fx.tenantId, otherLoc])).rows[0].id;
      const rule = await mkRule(fx, { scope: { locationIds: [fx.locationId] } });
      await settle();
      await q(`UPDATE routers SET status='OFFLINE' WHERE id=$1`, [other]);
      await q(`UPDATE routers SET status='OFFLINE' WHERE id=$1`, [fx.routerId]);
      await drain(fx.tenantId);
      expect(await jobs(fx.tenantId)).toHaveLength(1);
      const runs = (await q(`SELECT status FROM automation_rule_runs WHERE rule_id=$1 ORDER BY started_at`, [rule.id])).rows.map((r) => r.status).sort();
      expect(runs).toEqual(['OUT_OF_SCOPE', 'QUEUED']);
      await expect(rules.createRule(fx.tenantId, fx.ownerId, { name: 'x', eventType: 'device.offline', conditions: [], actions: [{ type: 'CREATE_ALERT', title: 'abc' }], scope: { routerIds: [randomUUID()] } } as never)).rejects.toThrow(/unknown router/);
    });
  });

  // ------------------------------------------------------------------ idempotency + cooldown
  describe('idempotency and cooldown', () => {
    it('never double-queues: reprocessing a receipt and replaying the same event yields one job', async () => {
      const fx = await tenant();
      await mkRule(fx); await settle();
      await q(`UPDATE routers SET status='OFFLINE' WHERE id=$1`, [fx.routerId]);
      await drain(fx.tenantId);
      await q(`UPDATE automation_event_receipts SET status='PENDING',attempts=0 WHERE tenant_id=$1`, [fx.tenantId]);
      await fanout.process(100); await fanout.process(100);
      expect(await jobs(fx.tenantId)).toHaveLength(1);
      const ev = (await events(fx.tenantId, 'DEVICE.OFFLINE'))[0];
      await q(`UPDATE routers SET status='OFFLINE' WHERE id=$1`, [fx.routerId]); // no state change => no new event
      expect(await events(fx.tenantId, 'DEVICE.OFFLINE')).toHaveLength(1);
      expect(ev).toBeDefined();
    });
    it('enforces one job per idempotency key at the database level', async () => {
      const fx = await tenant();
      await mkRule(fx); await settle();
      await q(`UPDATE routers SET status='OFFLINE' WHERE id=$1`, [fx.routerId]); await drain(fx.tenantId);
      const j = (await jobs(fx.tenantId))[0];
      await expect(q(`INSERT INTO automation_jobs(tenant_id,rule_id,rule_version,event_id,event_type,action_index,action_type,action,risk,idempotency_key,max_attempts,timeout_ms)
        VALUES($1,$2,1,$3,'x',0,'CREATE_ALERT','{}','LOW',$4,3,1000)`, [fx.tenantId, j.rule_id, j.event_id, j.idempotency_key])).rejects.toThrow(/duplicate key/);
    });
    it('suppresses repeats within the cooldown per subject, but not for different subjects', async () => {
      const fx = await tenant();
      const r2 = (await q(`INSERT INTO routers(tenant_id,name,location_id,status) VALUES($1,'R2',$2,'ONLINE') RETURNING id`, [fx.tenantId, fx.locationId])).rows[0].id;
      const rule = await mkRule(fx, { cooldownSeconds: 300 }); await settle();
      for (let i = 0; i < 3; i++) { await q(`UPDATE routers SET status='OFFLINE' WHERE id=$1`, [fx.routerId]); await q(`UPDATE routers SET status='ONLINE' WHERE id=$1`, [fx.routerId]); }
      await q(`UPDATE routers SET status='OFFLINE' WHERE id=$1`, [r2]);
      await drain(fx.tenantId);
      expect(await jobs(fx.tenantId)).toHaveLength(2); // R1 once, R2 once
      const suppressed = (await q(`SELECT count(*)::int n FROM automation_rule_runs WHERE rule_id=$1 AND status='SUPPRESSED' AND reason='COOLDOWN'`, [rule.id])).rows[0].n;
      expect(suppressed).toBe(2);
      expect((await q(`SELECT sum(suppressed_count)::int n FROM automation_cooldowns WHERE rule_id=$1`, [rule.id])).rows[0].n).toBe(2);
    });
    it('cooldown is atomic under concurrent fan-out (exactly one winner)', async () => {
      const fx = await tenant();
      const rule = await mkRule(fx, { cooldownSeconds: 300 });
      const fire = () => q(`INSERT INTO automation_cooldowns(tenant_id,rule_id,cooldown_key) VALUES($1,$2,'k')
        ON CONFLICT(tenant_id,rule_id,cooldown_key) DO UPDATE SET last_fired_at=now() WHERE automation_cooldowns.last_fired_at<=now()-make_interval(secs=>300) RETURNING 1`, [fx.tenantId, rule.id]);
      const results = await Promise.all(Array.from({ length: 20 }, fire));
      expect(results.filter((r) => r.rowCount === 1)).toHaveLength(1);
    });
  });

  // ------------------------------------------------------------------ retries, timeouts, dead letters
  describe('retries, timeout and dead-letter handling', () => {
    async function seedJob(fx: Fx, over: { maxAttempts?: number; timeoutMs?: number; ruleOver?: Record<string, unknown> } = {}) {
      const rule = await mkRule(fx, { maxAttempts: over.maxAttempts ?? 2, timeoutMs: over.timeoutMs ?? 1000, ...over.ruleOver }); await settle();
      await q(`UPDATE routers SET status='OFFLINE' WHERE id=$1`, [fx.routerId]);
      await q(`UPDATE communication_domain_events SET status='PROCESSED' WHERE tenant_id=$1`, [fx.tenantId]);
      await fanout.intake(); await fanout.process(10);
      return { rule, job: (await jobs(fx.tenantId))[0] };
    }
    const withExecutor = (fn: () => Promise<unknown>) => jest.spyOn(executor, 'execute').mockImplementation(fn as never);
    const makeDue = (id: string) => q(`UPDATE automation_jobs SET next_attempt_at=now() WHERE id=$1`, [id]);

    afterEach(() => jest.restoreAllMocks());

    it('retries with backoff, then dead-letters after max_attempts and NEVER attempts again', async () => {
      const fx = await tenant(); const { job } = await seedJob(fx, { maxAttempts: 2 });
      const spy = withExecutor(async () => { throw new Error('upstream 503'); });
      await runner.runBatch(5);
      let row = (await jobs(fx.tenantId))[0];
      expect(row).toMatchObject({ status: 'PENDING', attempts: 1 });
      expect(new Date(row.next_attempt_at).getTime()).toBeGreaterThan(Date.now() + 5000); // backoff, not immediate
      expect(await runner.runBatch(5)).toBe(0);                                             // not due yet
      await makeDue(job.id); await runner.runBatch(5);
      row = (await jobs(fx.tenantId))[0];
      expect(row).toMatchObject({ status: 'DEAD', attempts: 2, last_error_code: 'UNKNOWN' });
      const dl = (await q(`SELECT * FROM automation_dead_letters WHERE job_id=$1`, [job.id])).rows;
      expect(dl).toHaveLength(1); expect(dl[0]).toMatchObject({ reason: 'RETRIES_EXHAUSTED', status: 'OPEN', attempts: 2 });
      await makeDue(job.id);
      expect(await runner.runBatch(5)).toBe(0);
      expect(spy).toHaveBeenCalledTimes(2);
      const att = (await q(`SELECT attempt,outcome FROM automation_job_attempts WHERE job_id=$1 ORDER BY attempt`, [job.id])).rows;
      expect(att).toEqual([{ attempt: 1, outcome: 'FAILED' }, { attempt: 2, outcome: 'FAILED' }]);
    });
    it('the database itself rejects attempts beyond max_attempts (no infinite loop even with a buggy worker)', async () => {
      const fx = await tenant(); const { job } = await seedJob(fx, { maxAttempts: 2 });
      await expect(q(`UPDATE automation_jobs SET attempts=attempts+3 WHERE id=$1`, [job.id])).rejects.toThrow(/automation_jobs_attempts_bounded/);
      await expect(q(`UPDATE automation_jobs SET max_attempts=6 WHERE id=$1`, [job.id])).rejects.toThrow(/check/);
    });
    it('sends non-retryable errors straight to the dead-letter queue after one attempt', async () => {
      const fx = await tenant(); const { job } = await seedJob(fx, { maxAttempts: 5 });
      withExecutor(async () => { throw new NonRetryableError('BAD_TARGET', 'cannot work'); });
      await runner.runBatch(5);
      expect((await jobs(fx.tenantId))[0]).toMatchObject({ status: 'DEAD', attempts: 1, last_error_code: 'BAD_TARGET' });
      expect((await q(`SELECT reason FROM automation_dead_letters WHERE job_id=$1`, [job.id])).rows[0].reason).toBe('NON_RETRYABLE');
    });
    it('times out a hung action, records TIMEOUT, and retries within the budget', async () => {
      const fx = await tenant(); const { job } = await seedJob(fx, { maxAttempts: 2, timeoutMs: 1000 });
      withExecutor(() => new Promise(() => undefined));
      const t0 = Date.now(); await runner.runBatch(5);
      expect(Date.now() - t0).toBeLessThan(5000);
      expect((await jobs(fx.tenantId))[0]).toMatchObject({ status: 'PENDING', attempts: 1, last_error_code: 'TIMEOUT' });
      expect((await q(`SELECT outcome FROM automation_job_attempts WHERE job_id=$1`, [job.id])).rows[0].outcome).toBe('TIMEOUT');
    });
    it('recovers a crashed worker: expired lease is requeued, then dead-lettered when attempts run out', async () => {
      const fx = await tenant(); const { job } = await seedJob(fx, { maxAttempts: 2 });
      let claimed = await runner.claim(5); expect(claimed).toHaveLength(1);     // worker "dies" here without reporting
      expect(await runner.recoverExpiredLeases()).toEqual({ requeued: 0, dead: 0 }); // lease still valid
      await q(`UPDATE automation_jobs SET lease_expires_at=now()-interval '1 second' WHERE id=$1`, [job.id]);
      expect(await runner.recoverExpiredLeases()).toEqual({ requeued: 1, dead: 0 });
      expect((await jobs(fx.tenantId))[0]).toMatchObject({ status: 'PENDING', attempts: 1, last_error_code: 'LEASE_EXPIRED' });
      await makeDue(job.id); claimed = await runner.claim(5); expect(claimed).toHaveLength(1);
      await q(`UPDATE automation_jobs SET lease_expires_at=now()-interval '1 second' WHERE id=$1`, [job.id]);
      expect(await runner.recoverExpiredLeases()).toEqual({ requeued: 0, dead: 1 });
      expect((await q(`SELECT reason FROM automation_dead_letters WHERE job_id=$1`, [job.id])).rows[0].reason).toBe('LEASE_EXPIRED_EXHAUSTED');
    });
    it('fences stale workers: a worker that lost its lease cannot overwrite the new owner\'s result', async () => {
      const fx = await tenant(); const { job } = await seedJob(fx, { maxAttempts: 3 });
      const [claimed] = await runner.claim(1);
      await q(`UPDATE automation_jobs SET lease_expires_at=now()-interval '1s' WHERE id=$1`, [job.id]);
      await runner.recoverExpiredLeases(); await makeDue(job.id);
      const [second] = await runner.claim(1); expect(second.attempts).toBe(2);
      await runner.runClaimed(claimed); // stale owner finishes late (attempt 1)
      expect((await jobs(fx.tenantId))[0]).toMatchObject({ status: 'RUNNING', attempts: 2 });
      await runner.runClaimed(second);
      expect((await jobs(fx.tenantId))[0].status).toBe('SUCCEEDED');
    });
    it('requeue from the DLQ resets attempts but is capped at 3 requeues', async () => {
      const fx = await tenant(); const { job } = await seedJob(fx, { maxAttempts: 1 });
      withExecutor(async () => { throw new NonRetryableError('X', 'nope'); });
      const actor = { userId: fx.ownerId, role: 'OWNER' };
      for (let i = 0; i < 3; i++) {
        await runner.runBatch(5);
        const dl = (await q(`SELECT id FROM automation_dead_letters WHERE job_id=$1 AND status='OPEN'`, [job.id])).rows[0];
        await ops.requeueDeadLetter(fx.tenantId, actor, dl.id, 'retry after fix');
        expect((await jobs(fx.tenantId))[0]).toMatchObject({ status: 'PENDING', attempts: 0, requeue_count: i + 1 });
      }
      await runner.runBatch(5);
      const dl = (await q(`SELECT id FROM automation_dead_letters WHERE job_id=$1 AND status='OPEN'`, [job.id])).rows[0];
      await expect(ops.requeueDeadLetter(fx.tenantId, actor, dl.id, 'again')).rejects.toThrow(/already been requeued 3 times/);
      await ops.dismissDeadLetter(fx.tenantId, actor, dl.id, 'giving up');
      expect((await ops.listDeadLetters(fx.tenantId, 'OPEN')).data).toHaveLength(0);
    });
    it('dead-letters an event whose fan-out keeps failing instead of retrying forever', async () => {
      const fx = await tenant(); await mkRule(fx); await settle();
      await q(`UPDATE routers SET status='OFFLINE' WHERE id=$1`, [fx.routerId]);
      await q(`UPDATE communication_domain_events SET status='PROCESSED' WHERE tenant_id=$1`, [fx.tenantId]);
      await fanout.intake();
      const spy = jest.spyOn(fanout as never, 'processReceipt').mockRejectedValue(new Error('fan-out boom') as never);
      for (let i = 0; i < 6; i++) { await q(`UPDATE automation_event_receipts SET next_attempt_at=now() WHERE tenant_id=$1`, [fx.tenantId]); await fanout.process(10).catch(() => undefined); }
      spy.mockRestore();
      const receipt = (await q(`SELECT status,attempts FROM automation_event_receipts WHERE tenant_id=$1`, [fx.tenantId])).rows[0];
      expect(receipt).toEqual({ status: 'DEAD', attempts: 5 });
      expect((await q(`SELECT reason FROM automation_dead_letters WHERE tenant_id=$1 AND kind='EVENT'`, [fx.tenantId])).rows[0].reason).toBe('FANOUT_EXHAUSTED');
    });
  });

  // ------------------------------------------------------------------ concurrency control
  describe('concurrency control', () => {
    async function manyJobs(fx: Fx, n: number, ruleOver: Record<string, unknown>) {
      const rule = await mkRule(fx, ruleOver); await settle();
      for (let i = 0; i < n; i++) {
        const r = (await q(`INSERT INTO routers(tenant_id,name,location_id,status) VALUES($1,$2,$3,'ONLINE') RETURNING id`, [fx.tenantId, `rr${i}`, fx.locationId])).rows[0].id;
        await q(`UPDATE routers SET status='OFFLINE' WHERE id=$1`, [r]);
      }
      await q(`UPDATE communication_domain_events SET status='PROCESSED' WHERE tenant_id=$1`, [fx.tenantId]);
      await fanout.intake(); await fanout.process(100);
      return rule;
    }
    it('never runs more jobs of a rule than max_concurrency, even with racing workers', async () => {
      const fx = await tenant(); await manyJobs(fx, 8, { maxConcurrency: 2 });
      const batches = await Promise.all([runner.claim(10), runner.claim(10), runner.claim(10), runner.claim(10)]);
      expect(batches.flat()).toHaveLength(2);
      expect((await q(`SELECT count(*)::int n FROM automation_jobs WHERE tenant_id=$1 AND status='RUNNING'`, [fx.tenantId])).rows[0].n).toBe(2);
    });
    it('caps in-flight jobs per tenant', async () => {
      env.AUTOMATION_TENANT_MAX_INFLIGHT = '3';
      const fx = await tenant(); await manyJobs(fx, 8, { maxConcurrency: 10 });
      const claimed = (await Promise.all([runner.claim(10), runner.claim(10)])).flat();
      expect(claimed).toHaveLength(3);
    });
    it('does not let two workers claim the same job', async () => {
      const fx = await tenant(); await manyJobs(fx, 6, { maxConcurrency: 10 });
      const claimed = (await Promise.all([runner.claim(3), runner.claim(3), runner.claim(3)])).flat();
      expect(new Set(claimed.map((j) => j.id)).size).toBe(claimed.length);
      expect(claimed.length).toBeLessThanOrEqual(6);
    });
  });

  // ------------------------------------------------------------------ destructive actions share manual command authorization
  describe('destructive actions (TERMINATE_SESSION)', () => {
    async function destructive(fx: Fx, over: Record<string, unknown> = {}) {
      const rule = await rules.createRule(fx.tenantId, fx.ownerId, {
        name: `kill-${randomUUID().slice(0, 6)}`, eventType: 'session.started', conditions: [{ path: 'username', op: 'eq', value: 'abuser' }],
        actions: [{ type: 'TERMINATE_SESSION' }], enabled: true, autonomy: 'AUTO', ...over,
      } as never);
      await settle();
      return rule;
    }
    const startSession = async (fx: Fx) => (await q(`INSERT INTO sessions(tenant_id,router_id,username,status) VALUES($1,$2,'abuser','ACTIVE') RETURNING id`, [fx.tenantId, fx.routerId])).rows[0].id;
    const netCmds = async (t: string) => (await q(`SELECT * FROM network_commands WHERE tenant_id=$1`, [t])).rows;

    it('is DENIED while the platform flag is off (default), and nothing reaches the network', async () => {
      const fx = await tenant(); await destructive(fx); await rules.grantStandingApproval(fx.tenantId, { userId: fx.ownerId, role: 'OWNER' }, (await rules.listRules(fx.tenantId)).data[0].id, 'ok');
      await startSession(fx); await drain(fx.tenantId);
      expect((await jobs(fx.tenantId))[0]).toMatchObject({ status: 'DENIED', last_error_code: 'DESTRUCTIVE_DISABLED' });
      expect(await netCmds(fx.tenantId)).toHaveLength(0);
    });
    it('without standing approval it waits for an operator, then executes through the shared command fabric exactly once', async () => {
      env.AUTOMATION_DESTRUCTIVE_ACTIONS_ENABLED = 'true';
      const fx = await tenant(); await destructive(fx);
      const sid = await startSession(fx); await drain(fx.tenantId);
      const [job] = await jobs(fx.tenantId);
      expect(job).toMatchObject({ status: 'WAITING_APPROVAL', attempts: 0 });          // approval wait refunds the attempt
      expect(await netCmds(fx.tenantId)).toHaveLength(0);
      await expect(ops.decideApproval(fx.tenantId, { userId: fx.cashierId, role: 'CASHIER' }, job.id, true, 'pls')).rejects.toThrow(/Operator confirmation/);
      await ops.decideApproval(fx.tenantId, { userId: fx.ownerId, role: 'OWNER' }, job.id, true, 'verified abuse');
      await drain(fx.tenantId);
      expect((await jobs(fx.tenantId))[0]).toMatchObject({ status: 'SUCCEEDED', approved_by: fx.ownerId });
      const cmds = await netCmds(fx.tenantId);
      expect(cmds).toHaveLength(1);
      expect(cmds[0]).toMatchObject({ command_type: 'DISCONNECT_SESSION', status: 'QUEUED', correlation_id: `automation:${job.id}` });
      expect(cmds[0].actor).toMatch(/^automation:/);
      expect(cmds[0].target.sessionId).toBe(sid);
      const exec = (await q(`SELECT result,actor_user_id FROM command_executions WHERE tenant_id=$1`, [fx.tenantId])).rows;
      expect(exec).toHaveLength(1); expect(exec[0].result.origin).toBe('AUTOMATION');
    });
    it('AUTO + valid standing approval runs unattended; editing the rule voids the approval and falls back to human approval', async () => {
      env.AUTOMATION_DESTRUCTIVE_ACTIONS_ENABLED = 'true';
      const fx = await tenant(); const rule = await destructive(fx);
      await rules.grantStandingApproval(fx.tenantId, { userId: fx.ownerId, role: 'OWNER' }, rule.id, 'reviewed');
      await startSession(fx); await drain(fx.tenantId);
      expect((await jobs(fx.tenantId))[0].status).toBe('SUCCEEDED');
      expect((await netCmds(fx.tenantId))).toHaveLength(1);

      const edited = await rules.updateRule(fx.tenantId, fx.ownerId, rule.id, { name: rule.name, eventType: 'session.started', conditions: [{ path: 'username', op: 'eq', value: 'abuser' }, { path: 'routerId', op: 'exists' }], actions: [{ type: 'TERMINATE_SESSION' }], enabled: true, autonomy: 'AUTO' } as never);
      expect(edited.standingApprovalValid).toBe(false); expect(edited.version).toBe(2);
      await settle(); await startSession(fx); await drain(fx.tenantId);
      expect((await jobs(fx.tenantId, `AND rule_version=2`))[0].status).toBe('WAITING_APPROVAL');
      expect(await netCmds(fx.tenantId)).toHaveLength(1);
    });
    it('denies when the run-as user lacks operator authority, even with standing approval (same decision as a manual command)', async () => {
      env.AUTOMATION_DESTRUCTIVE_ACTIONS_ENABLED = 'true';
      const fx = await tenant(); const rule = await destructive(fx);
      await rules.grantStandingApproval(fx.tenantId, { userId: fx.ownerId, role: 'OWNER' }, rule.id, 'ok');
      await q(`UPDATE users SET role='CASHIER' WHERE id=$1`, [fx.ownerId]);   // demoted after the rule was created
      await startSession(fx); await drain(fx.tenantId);
      const [job] = await jobs(fx.tenantId);
      expect(job.status).toBe('DENIED'); expect(['PERMISSION_REVOKED', 'COMMAND_DENIED']).toContain(job.last_error_code);
      expect(await netCmds(fx.tenantId)).toHaveLength(0);
    });
    it('denies when the run-as user is deactivated, and refuses to create rules beyond the author\'s own permissions', async () => {
      env.AUTOMATION_DESTRUCTIVE_ACTIONS_ENABLED = 'true';
      const fx = await tenant(); const rule = await destructive(fx);
      await rules.grantStandingApproval(fx.tenantId, { userId: fx.ownerId, role: 'OWNER' }, rule.id, 'ok');
      await q(`UPDATE users SET is_active=false WHERE id=$1`, [fx.ownerId]);
      await startSession(fx); await drain(fx.tenantId);
      expect((await jobs(fx.tenantId)).length === 0 || (await jobs(fx.tenantId))[0].status === 'DENIED').toBe(true);
      await expect(rules.createRule(fx.tenantId, fx.cashierId, { name: 'x', eventType: 'session.started', conditions: [], actions: [{ type: 'TERMINATE_SESSION' }] } as never)).rejects.toThrow(/cannot create or enable|not active|Forbidden/i);
    });
    it('enforces the hourly destructive budget', async () => {
      env.AUTOMATION_DESTRUCTIVE_ACTIONS_ENABLED = 'true'; env.AUTOMATION_DESTRUCTIVE_MAX_PER_HOUR = '2';
      const fx = await tenant(); const rule = await destructive(fx, { cooldownSeconds: 60, maxConcurrency: 1 });
      await rules.grantStandingApproval(fx.tenantId, { userId: fx.ownerId, role: 'OWNER' }, rule.id, 'ok');
      for (let i = 0; i < 4; i++) await startSession(fx);
      await drain(fx.tenantId, 20);
      const byStatus = (await jobs(fx.tenantId)).map((j) => j.status).sort();
      expect(byStatus.filter((s) => s === 'SUCCEEDED').length).toBe(2);
      expect(byStatus.filter((s) => s === 'DENIED').length).toBe(2);
    });
    it('treats an already-ended session as a successful no-op rather than retrying', async () => {
      env.AUTOMATION_DESTRUCTIVE_ACTIONS_ENABLED = 'true';
      const fx = await tenant(); const rule = await destructive(fx);
      await rules.grantStandingApproval(fx.tenantId, { userId: fx.ownerId, role: 'OWNER' }, rule.id, 'ok');
      const sid = await startSession(fx);
      await q(`UPDATE sessions SET status='ENDED',ended_at=now() WHERE id=$1`, [sid]);
      await drain(fx.tenantId);
      const [job] = await jobs(fx.tenantId);
      expect(job).toMatchObject({ status: 'SUCCEEDED', attempts: 1 }); expect(job.result.noop).toBe(true);
      expect(await netCmds(fx.tenantId)).toHaveLength(0);
    });
    it('disabling a rule cancels its pending and approval-waiting jobs (kill switch)', async () => {
      env.AUTOMATION_DESTRUCTIVE_ACTIONS_ENABLED = 'true';
      const fx = await tenant(); const rule = await destructive(fx);
      await startSession(fx); await drain(fx.tenantId);
      expect((await jobs(fx.tenantId))[0].status).toBe('WAITING_APPROVAL');
      await rules.setEnabled(fx.tenantId, fx.ownerId, rule.id, false);
      expect((await jobs(fx.tenantId))[0]).toMatchObject({ status: 'CANCELLED', last_error_code: 'RULE_DISABLED' });
    });
    it('expires unattended approval requests', async () => {
      env.AUTOMATION_DESTRUCTIVE_ACTIONS_ENABLED = 'true';
      const fx = await tenant(); await destructive(fx);
      await startSession(fx); await drain(fx.tenantId);
      await q(`UPDATE automation_jobs SET approval_expires_at=now()-interval '1 minute' WHERE tenant_id=$1`, [fx.tenantId]);
      expect(await runner.expireApprovals()).toBe(1);
      expect((await jobs(fx.tenantId))[0].status).toBe('EXPIRED');
    });
  });

  // ------------------------------------------------------------------ operational visibility
  describe('operational visibility', () => {
    it('reports queue state, dead letters and health', async () => {
      const fx = await tenant();
      await mkRule(fx, { maxAttempts: 1 }); await settle();
      await q(`UPDATE routers SET status='OFFLINE' WHERE id=$1`, [fx.routerId]);
      await q(`UPDATE communication_domain_events SET status='PROCESSED' WHERE tenant_id=$1`, [fx.tenantId]);
      await fanout.intake(); await fanout.process(10);
      let o = await ops.overview(fx.tenantId);
      expect(o.jobs.byStatus.PENDING).toBe(1); expect(o.jobs.ready).toBe(1);
      jest.spyOn(executor, 'execute').mockRejectedValue(new NonRetryableError('X', 'bad'));
      await runner.runBatch(5);
      jest.restoreAllMocks();
      o = await ops.overview(fx.tenantId);
      expect(o.jobs.byStatus.DEAD).toBe(1); expect(o.deadLetters.open).toBe(1);
      expect(o.health.reasons).toContain('OPEN_DEAD_LETTERS'); expect(['DEGRADED', 'STALLED']).toContain(o.health.status);
      expect(o.topFailingRules[0].failures).toBe(1);
      expect((await ops.listJobs(fx.tenantId, { status: 'DEAD' })).data).toHaveLength(1);
      await expect(ops.listJobs(fx.tenantId, { status: 'BOGUS' })).rejects.toThrow(/Unknown job status/);
    });
    it('exposes the event and action catalog', () => {
      const c = ops.catalog();
      expect(c.events).toHaveLength(12); expect(c.actions.map((a) => a.type)).toContain('TERMINATE_SESSION');
    });
  });
});
