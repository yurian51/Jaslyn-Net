import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

export const THROTTLE_WINDOW_SECONDS = 900;
export const THROTTLE_LOCK_SECONDS = 900;
export const THROTTLE_LIMITS = { pair: 5, ip: 30, email: 50 } as const;
type Scope = keyof typeof THROTTLE_LIMITS;

const digest = (scope: string, value: string) => createHash('sha256').update(`${scope}:${value}`).digest('hex').slice(0, 40);

/**
 * Database-backed so limits hold across API instances. Fails OPEN on store errors (logged): an outage of the
 * throttle table must not lock every user out of signing in.
 */
@Injectable()
export class LoginThrottleService {
  private readonly logger = new Logger(LoginThrottleService.name);
  constructor(@Inject(PG_POOL) private readonly db: Pool) {}

  private keys(email: string, ip?: string): Array<{ scope: Scope; key: string }> {
    const e = email.trim().toLowerCase();
    const out: Array<{ scope: Scope; key: string }> = [{ scope: 'email', key: digest('email', e) }];
    if (ip) { out.push({ scope: 'ip', key: digest('ip', ip) }, { scope: 'pair', key: digest('pair', `${e}|${ip}`) }); }
    return out;
  }

  /** Throws 429 with Retry-After semantics if any key is currently locked. Same response whether or not the account exists. */
  async assertAllowed(email: string, ip?: string): Promise<void> {
    try {
      const keys = this.keys(email, ip);
      const r = await this.db.query(
        `SELECT GREATEST(extract(epoch FROM max(locked_until)-now()),0)::int AS wait
           FROM auth_login_throttle WHERE locked_until>now() AND (scope,key) IN (${keys.map((_, i) => `($${i * 2 + 1},$${i * 2 + 2})`).join(',')})`,
        keys.flatMap((k) => [k.scope, k.key]));
      const wait = r.rows[0]?.wait as number | null;
      if (wait && wait > 0) throw new HttpException({ statusCode: 429, message: 'Too many failed sign-in attempts. Try again later.', retryAfterSeconds: wait }, HttpStatus.TOO_MANY_REQUESTS, { cause: 'login-throttle' });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Login throttle check failed open: ${error instanceof Error ? error.message : error}`);
    }
  }

  async recordFailure(email: string, ip?: string): Promise<void> {
    try {
      for (const { scope, key } of this.keys(email, ip)) {
        await this.db.query(
          `INSERT INTO auth_login_throttle(scope,key,failures,window_started_at) VALUES($1,$2,1,now())
           ON CONFLICT(scope,key) DO UPDATE SET
             failures=CASE WHEN auth_login_throttle.window_started_at<now()-make_interval(secs=>$3) THEN 1 ELSE auth_login_throttle.failures+1 END,
             window_started_at=CASE WHEN auth_login_throttle.window_started_at<now()-make_interval(secs=>$3) THEN now() ELSE auth_login_throttle.window_started_at END,
             locked_until=CASE WHEN (CASE WHEN auth_login_throttle.window_started_at<now()-make_interval(secs=>$3) THEN 1 ELSE auth_login_throttle.failures+1 END)>=$4
                               THEN now()+make_interval(secs=>$5) ELSE auth_login_throttle.locked_until END`,
          [scope, key, THROTTLE_WINDOW_SECONDS, THROTTLE_LIMITS[scope], THROTTLE_LOCK_SECONDS]);
      }
    } catch (error) { this.logger.error(`Login throttle record failed: ${error instanceof Error ? error.message : error}`); }
  }

  /** A good sign-in clears only the pair counter; ip/email counters keep protecting against spraying. */
  async recordSuccess(email: string, ip?: string): Promise<void> {
    if (!ip) return;
    try { await this.db.query('DELETE FROM auth_login_throttle WHERE scope=$1 AND key=$2', ['pair', digest('pair', `${email.trim().toLowerCase()}|${ip}`)]); }
    catch (error) { this.logger.error(`Login throttle reset failed: ${error instanceof Error ? error.message : error}`); }
  }
}
