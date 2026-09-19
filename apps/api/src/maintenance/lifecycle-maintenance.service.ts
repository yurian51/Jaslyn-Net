import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { SessionsService } from '../sessions/sessions.service';
import { AuditService } from '../audit/audit.service';
import { RoutersService } from '../routers/routers.service';

const MAINTENANCE_INTERVAL_MS = 60_000;
const MAINTENANCE_LOCK_KEY = 9_184_731;

@Injectable()
export class LifecycleMaintenanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LifecycleMaintenanceService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(PG_POOL) private readonly db: Pool,
    private readonly sessions: SessionsService,
    private readonly audit: AuditService,
    private readonly routers: RoutersService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.runOnce().catch((error: unknown) => {
        this.logger.error(error instanceof Error ? error.message : String(error));
      });
    }, MAINTENANCE_INTERVAL_MS);
    this.timer.unref();
    void this.runOnce().catch((error: unknown) => {
      this.logger.error(error instanceof Error ? error.message : String(error));
    });
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async runOnce() {
    const lock = await this.db.query<{ acquired: boolean }>(
      'SELECT pg_try_advisory_lock($1) AS acquired',
      [MAINTENANCE_LOCK_KEY],
    );
    if (!lock.rows[0]?.acquired) return;

    try {
      const tenants = await this.db.query<{ id: string }>(
        `SELECT id FROM tenants WHERE status IN ('TRIAL','ACTIVE') ORDER BY id`,
      );

      for (const tenant of tenants.rows) {
        try {
          await this.sessions.reconcileAccessState(tenant.id, { correlationId: `maintenance:${tenant.id}` });
          await this.sessions.reconcileStale(tenant.id, 30);
          await this.routers.markOfflineStale(tenant.id, 5, { correlationId: `maintenance:${tenant.id}` });
        } catch (error: unknown) {
          const reason = error instanceof Error ? error.message : String(error);
          await this.audit.record(
            tenant.id,
            'LIFECYCLE_MAINTENANCE_FAILED',
            'tenant',
            tenant.id,
            { operation: 'lifecycle-maintenance', reason },
            { correlationId: `maintenance:${tenant.id}` },
          ).catch(() => undefined);
          this.logger.error(JSON.stringify({
            tenantId: tenant.id,
            operation: 'lifecycle-maintenance',
            result: 'FAILED',
            reason,
          }));
        }
      }
    } finally {
      await this.db.query('SELECT pg_advisory_unlock($1)', [MAINTENANCE_LOCK_KEY]).catch(() => undefined);
    }
  }
}
