/** Real PostgreSQL. TEST_DATABASE_URL=postgresql://... (skipped when unset). */
import { HttpException } from '@nestjs/common';
import { Pool } from 'pg';
import { LoginThrottleService, THROTTLE_LIMITS } from './login-throttle.service';

const url = process.env.TEST_DATABASE_URL ?? process.env.AUTOMATION_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite('LoginThrottleService (PostgreSQL)', () => {
  let pool: Pool; let svc: LoginThrottleService;
  beforeAll(() => { pool = new Pool({ connectionString: url }); svc = new LoginThrottleService(pool); });
  afterAll(async () => { await pool.end(); });
  beforeEach(async () => { await pool.query('DELETE FROM auth_login_throttle'); });

  const fail = async (email: string, ip: string, n: number) => { for (let i = 0; i < n; i++) await svc.recordFailure(email, ip); };
  const blocked = async (email: string, ip?: string) => svc.assertAllowed(email, ip).then(() => null, (e) => e as HttpException);

  it('allows sign-in until the pair limit, then answers 429 with a retry hint', async () => {
    await fail('owner@x.test', '1.1.1.1', THROTTLE_LIMITS.pair - 1);
    expect(await blocked('owner@x.test', '1.1.1.1')).toBeNull();
    await svc.recordFailure('owner@x.test', '1.1.1.1');
    const err = await blocked('owner@x.test', '1.1.1.1');
    expect(err?.getStatus()).toBe(429);
    expect((err!.getResponse() as { retryAfterSeconds: number }).retryAfterSeconds).toBeGreaterThan(800);
  });
  it('an attacker guessing from one IP cannot lock the real owner out from another IP', async () => {
    await fail('owner@x.test', '6.6.6.6', THROTTLE_LIMITS.pair);
    expect(await blocked('owner@x.test', '6.6.6.6')).not.toBeNull();
    expect(await blocked('owner@x.test', '2.2.2.2')).toBeNull();
  });
  it('blocks one IP spraying many accounts, but not other IPs', async () => {
    for (let i = 0; i < THROTTLE_LIMITS.ip; i++) await svc.recordFailure(`user${i}@x.test`, '9.9.9.9');
    expect(await blocked('brand-new@x.test', '9.9.9.9')).not.toBeNull();
    expect(await blocked('brand-new@x.test', '8.8.8.8')).toBeNull();
  });
  it('slows distributed attacks on one account (email scope)', async () => {
    for (let i = 0; i < THROTTLE_LIMITS.email; i++) await svc.recordFailure('target@x.test', `10.0.${Math.floor(i / 250)}.${i % 250}`);
    expect(await blocked('target@x.test', '203.0.113.5')).not.toBeNull();
  });
  it('a successful sign-in clears only the pair counter', async () => {
    await fail('owner@x.test', '1.1.1.1', 3);
    await svc.recordSuccess('owner@x.test', '1.1.1.1');
    const rows = await pool.query(`SELECT scope FROM auth_login_throttle ORDER BY scope`);
    expect(rows.rows.map((r) => r.scope)).toEqual(['email', 'ip']);
  });
  it('is identical for unknown and known accounts (no enumeration through the limiter)', async () => {
    await fail('ghost@nowhere.test', '1.1.1.1', THROTTLE_LIMITS.pair);
    expect((await blocked('ghost@nowhere.test', '1.1.1.1'))?.getStatus()).toBe(429);
  });
  it('stores hashes only, never raw emails or IPs', async () => {
    await fail('Secret.Person@x.test', '198.51.100.7', 1);
    const dump = JSON.stringify((await pool.query('SELECT * FROM auth_login_throttle')).rows);
    expect(dump).not.toMatch(/secret|198\.51\.100/i);
  });
  it('treats email case-insensitively', async () => {
    await fail('Owner@X.test', '1.1.1.1', THROTTLE_LIMITS.pair);
    expect(await blocked('owner@x.test', '1.1.1.1')).not.toBeNull();
  });
  it('skips ip/pair scopes when the client IP is unknown instead of locking everyone together', async () => {
    await fail('a@x.test', undefined as never, 10);
    expect(await blocked('b@x.test', undefined)).toBeNull();
  });
  it('restarts the window after it expires', async () => {
    await fail('owner@x.test', '1.1.1.1', THROTTLE_LIMITS.pair);
    await pool.query(`UPDATE auth_login_throttle SET window_started_at=now()-interval '20 minutes',locked_until=now()-interval '5 minutes'`);
    expect(await blocked('owner@x.test', '1.1.1.1')).toBeNull();
    await svc.recordFailure('owner@x.test', '1.1.1.1');
    expect(await blocked('owner@x.test', '1.1.1.1')).toBeNull(); // counter restarted at 1, not 6
  });
  it('fails open (does not block sign-in) if the throttle store is down', async () => {
    const broken = new LoginThrottleService({ query: jest.fn().mockRejectedValue(new Error('db down')) } as never);
    await expect(broken.assertAllowed('a@x.test', '1.1.1.1')).resolves.toBeUndefined();
    await expect(broken.recordFailure('a@x.test', '1.1.1.1')).resolves.toBeUndefined();
  });
});
