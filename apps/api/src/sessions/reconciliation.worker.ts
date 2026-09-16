import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { SessionsService } from './sessions.service';

const DEFAULT_INTERVAL_MS = 60_000;
const MIN_INTERVAL_MS = 30_000;
const MAX_INTERVAL_MS = 15 * 60_000;
const DEFAULT_STALE_MINUTES = 30;

@Injectable()
export class ReconciliationWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @Inject(PG_POOL) private readonly db: Pool,
    private readonly config: ConfigService,
    private readonly sessions: SessionsService,
  ) {}

  onModuleInit() {
    const interval = this.intervalMs();
    this.timer = setInterval(() => void this.run(), interval);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private intervalMs() {
    const configured = Number(this.config.get<string>('JASLYN_RECONCILIATION_INTERVAL_MS', String(DEFAULT_INTERVAL_MS)));
    return Math.min(Math.max(Number.isFinite(configured) ? Math.trunc(configured) : DEFAULT_INTERVAL_MS, MIN_INTERVAL_MS), MAX_INTERVAL_MS);
  }

  private staleMinutes() {
    const configured = Number(this.config.get<string>('JASLYN_STALE_SESSION_MINUTES', String(DEFAULT_STALE_MINUTES)));
    return Math.min(Math.max(Number.isFinite(configured) ? Math.trunc(configured) : DEFAULT_STALE_MINUTES, 5), 1440);
  }

  private async tryAcquireLock(client: PoolClient) {
    const result = await client.query<{ locked: boolean }>(`SELECT pg_try_advisory_lock(hashtextextended('jaslyn-net:reconciliation', 0)) AS locked`);
    return Boolean(result.rows[0]?.locked);
  }

  private async releaseLock(client: PoolClient) {
    await client.query(`SELECT pg_advisory_unlock(hashtextextended('jaslyn-net:reconciliation', 0))`).catch(() => undefined);
  }

  private async run() {
    if (this.running) return;
    this.running = true;
    let client: PoolClient | undefined;
    try {
      client = await this.db.connect();
      if (!(await this.tryAcquireLock(client))) return;

      const tenants = await client.query<{ id: string }>(
        `SELECT id FROM tenants WHERE status IN ('TRIAL','ACTIVE') ORDER BY id`,
      );
      for (const tenant of tenants.rows) {
        try {
          await this.sessions.reconcileAccessState(tenant.id);
          await this.sessions.reconcileStale(tenant.id, this.staleMinutes());
        } catch {
          // One tenant must not prevent reconciliation for every other tenant.
        }
      }
    } catch {
      // Reconciliation is best-effort and must never crash the API process.
    } finally {
      if (client) {
        await this.releaseLock(client);
        client.release();
      }
      this.running = false;
    }
  }
}
