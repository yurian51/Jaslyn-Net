import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AutomationConfig } from './automation.config';
import { AutomationFanoutService } from './automation.fanout.service';
import { AutomationJobRunner } from './automation.runner';

const SHUTDOWN_GRACE_MS = 20_000;
const MAINTENANCE_EVERY_MS = 10 * 60_000;

/**
 * Drives the pipeline: intake -> fan-out -> housekeeping -> execute. Safe to run on many instances at once
 * (all claiming uses SKIP LOCKED / advisory locks). Ticks never overlap within a process.
 */
@Injectable()
export class AutomationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutomationWorker.name);
  private timer?: NodeJS.Timeout;
  private running: Promise<void> | null = null;
  private stopping = false;
  private lastMaintenance = 0;
  private readonly startedAt = new Date();

  constructor(
    @Inject(PG_POOL) private readonly db: Pool,
    private readonly fanout: AutomationFanoutService,
    private readonly runner: AutomationJobRunner,
    private readonly config: AutomationConfig,
  ) {}

  onModuleInit() {
    if (!this.config.engineEnabled) { this.logger.warn('Automation engine disabled by AUTOMATION_ENGINE_ENABLED=false'); return; }
    this.timer = setInterval(() => { void this.tick(); }, this.config.tickMs);
    void this.tick();
  }

  /** Stop claiming new work, then give in-flight jobs a bounded grace period. Leases cover anything still running after that. */
  async onModuleDestroy() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    if (this.running) await Promise.race([this.running, new Promise((r) => setTimeout(r, SHUTDOWN_GRACE_MS))]);
  }

  tick(): Promise<void> {
    if (this.running || this.stopping) return this.running ?? Promise.resolve();
    this.running = this.cycle().finally(() => { this.running = null; });
    return this.running;
  }

  private async cycle() {
    const began = Date.now();
    const stats: Record<string, unknown> = {};
    let error: string | null = null;
    try {
      stats.intake = await this.fanout.intake();
      stats.fanout = await this.fanout.process();
      stats.leases = await this.runner.recoverExpiredLeases();
      stats.expiredApprovals = await this.runner.expireApprovals();
      if (!this.stopping) stats.executed = await this.runner.runBatch(this.config.batchSize);
      if (Date.now() - this.lastMaintenance > MAINTENANCE_EVERY_MS) { this.lastMaintenance = Date.now(); stats.purged = await this.runner.purge(); }
    } catch (e) {
      error = (e instanceof Error ? e.message : String(e)).slice(0, 1000);
      this.logger.error(`Automation cycle failed: ${e instanceof Error ? e.stack : e}`);
    }
    await this.heartbeat(Date.now() - began, stats, error).catch(() => undefined);
  }

  private async heartbeat(ms: number, stats: Record<string, unknown>, error: string | null) {
    await this.db.query(
      `INSERT INTO automation_worker_heartbeats(worker_id,started_at,last_tick_at,last_tick_ms,stats,last_error,last_error_at)
       VALUES($1,$2,now(),$3,$4::jsonb,$5,CASE WHEN $5::text IS NULL THEN NULL ELSE now() END)
       ON CONFLICT(worker_id) DO UPDATE SET last_tick_at=now(),last_tick_ms=$3,stats=$4::jsonb,
         last_error=COALESCE($5,automation_worker_heartbeats.last_error),
         last_error_at=CASE WHEN $5::text IS NULL THEN automation_worker_heartbeats.last_error_at ELSE now() END`,
      [this.runner.workerId, this.startedAt, ms, JSON.stringify(stats), error]);
  }
}
