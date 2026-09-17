import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { SessionsService } from '../sessions/sessions.service';

const RECONCILIATION_INTERVAL_MS = 60_000;

type ExpiryResult = {
  expiredBindings: number;
  suspendedCustomers: number;
};

type ExpiredBinding = {
  id: string;
  tenantId: string;
};

type SuspendedCustomer = {
  tenantId: string;
  customerId: string;
};

@Injectable()
export class IspExpiryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IspExpiryService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @Inject(PG_POOL) private readonly db: Pool,
    private readonly sessions: SessionsService,
  ) {}

  onModuleInit() {
    void this.reconcile().catch((error: unknown) => {
      this.logger.error(
        error instanceof Error ? error.stack ?? error.message : String(error),
        'Initial expiry reconciliation failed',
      );
    });

    this.timer = setInterval(() => {
      void this.reconcile().catch((error: unknown) => {
        this.logger.error(
          error instanceof Error ? error.stack ?? error.message : String(error),
          'Scheduled expiry reconciliation failed',
        );
      });
    }, RECONCILIATION_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async reconcile(): Promise<ExpiryResult> {
    if (this.running) return { expiredBindings: 0, suspendedCustomers: 0 };
    this.running = true;
    let client: Awaited<ReturnType<Pool['connect']>> | undefined;
    try {
      client = await this.db.connect();
      await client.query('BEGIN');

      const expiredBindings = await client.query<ExpiredBinding>(
        `WITH expired AS (
           UPDATE customer_access_bindings
              SET state='EXPIRED', updated_at=now()
            WHERE state='ACTIVE'
              AND expires_at IS NOT NULL
              AND expires_at <= now()
            RETURNING tenant_id AS "tenantId", id
         )
         INSERT INTO access_state_events
           (tenant_id, access_binding_id, previous_state, new_state, reason, source)
         SELECT "tenantId", id, 'ACTIVE', 'EXPIRED', 'Access binding expired', 'SYSTEM_EXPIRY'
           FROM expired
         RETURNING tenant_id AS "tenantId", access_binding_id AS id`,
      );

      await client.query(
        `UPDATE customer_service_state s
            SET expires_at = active.max_expires_at,
                updated_at = now()
           FROM (
             SELECT tenant_id, customer_id, MAX(expires_at) AS max_expires_at
               FROM customer_access_bindings
              WHERE state='ACTIVE'
              GROUP BY tenant_id, customer_id
           ) active
          WHERE s.tenant_id=active.tenant_id
            AND s.customer_id=active.customer_id
            AND s.state='ACTIVE'`,
      );

      const suspendedCustomers = await client.query<SuspendedCustomer>(
        `WITH suspended AS (
           UPDATE customer_service_state s
              SET state='SUSPENDED',
                  reason='Service expired',
                  source='SYSTEM_EXPIRY',
                  effective_at=now(),
                  updated_at=now()
            WHERE s.state='ACTIVE'
              AND s.expires_at IS NOT NULL
              AND s.expires_at <= now()
              AND NOT EXISTS (
                SELECT 1
                  FROM customer_access_bindings b
                 WHERE b.tenant_id=s.tenant_id
                   AND b.customer_id=s.customer_id
                   AND b.state='ACTIVE'
              )
            RETURNING s.tenant_id AS "tenantId", s.customer_id AS "customerId"
         )
         INSERT INTO customer_service_state_events
           (tenant_id, customer_id, previous_state, new_state, reason, source, effective_at)
         SELECT "tenantId", "customerId", 'ACTIVE', 'SUSPENDED', 'Service expired', 'SYSTEM_EXPIRY', now()
           FROM suspended
         RETURNING tenant_id AS "tenantId", customer_id AS "customerId"`,
      );

      await client.query('COMMIT');

      const affectedTenantIds = new Set<string>([
        ...expiredBindings.rows.map((row) => row.tenantId),
        ...suspendedCustomers.rows.map((row) => row.tenantId),
      ]);

      for (const tenantId of affectedTenantIds) {
        try {
          await this.sessions.reconcileAccessState(tenantId, { requestId: `system-expiry:${tenantId}` });
        } catch (error: unknown) {
          this.logger.error(
            error instanceof Error ? error.stack ?? error.message : String(error),
            `Network access reconciliation failed for tenant ${tenantId}`,
          );
        }
      }

      return {
        expiredBindings: expiredBindings.rowCount ?? 0,
        suspendedCustomers: suspendedCustomers.rowCount ?? 0,
      };
    } catch (error: unknown) {
      if (client) await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client?.release();
      this.running = false;
    }
  }
}
