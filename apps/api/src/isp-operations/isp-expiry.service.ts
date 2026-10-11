import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { SessionsService } from '../sessions/sessions.service';
import { NotificationsService } from '../notifications/notifications.service';

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
    private readonly notifications: NotificationsService,
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
    let client: PoolClient | undefined;
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

      // Queue reminders for services expiring within 24 hours. Stable idempotency
      // keys prevent the minute scheduler from creating duplicate messages.
      try {
        const reminders = await this.db.query(
          `SELECT s.tenant_id AS "tenantId", s.customer_id AS "customerId",
                  c.full_name AS "fullName", c.phone, s.expires_at AS "expiresAt"
             FROM customer_service_state s
             JOIN customers c ON c.tenant_id=s.tenant_id AND c.id=s.customer_id AND c.is_active=true
            WHERE s.state='ACTIVE' AND s.expires_at>now()
              AND s.expires_at<=now()+interval '24 hours' AND c.phone IS NOT NULL
            ORDER BY s.expires_at ASC LIMIT 200`,
        );
        for (const row of reminders.rows) {
          try {
            const expiry = new Date(row.expiresAt);
            await this.notifications.enqueueSms(row.tenantId, {
              recipient: row.phone,
              category: 'EXPIRY',
              message: `Habari ${row.fullName}, kifurushi chako kinakaribia kuisha tarehe ${expiry.toLocaleString('en-GB', { timeZone: 'Africa/Dar_es_Salaam' })}. Nunua kifurushi kingine kuendelea kutumia huduma.`,
              idempotencyKey: `expiry-reminder:${row.customerId}:${expiry.toISOString()}`,
            });
          } catch (error: unknown) {
            this.logger.warn(error instanceof Error ? error.message : 'Unable to queue expiry reminder');
          }
        }
      } catch (error: unknown) {
        this.logger.warn(error instanceof Error ? error.message : 'Unable to query expiry reminders');
      }

      // A suspension transition happens once; send a final expiry notice once.
      for (const row of suspendedCustomers.rows) {
        try {
          const result = await this.db.query(
            `SELECT full_name AS "fullName", phone FROM customers
              WHERE tenant_id=$1 AND id=$2 AND is_active=true`,
            [row.tenantId, row.customerId],
          );
          if (!result.rowCount || !result.rows[0].phone) continue;
          await this.notifications.enqueueSms(row.tenantId, {
            recipient: result.rows[0].phone,
            category: 'EXPIRY',
            message: `Habari ${result.rows[0].fullName}, kifurushi chako kimeisha na huduma imesitishwa. Tafadhali nunua kifurushi kingine ili kuendelea.`,
            idempotencyKey: `expiry-final:${row.customerId}`,
          });
        } catch (error: unknown) {
          this.logger.warn(error instanceof Error ? error.message : 'Unable to queue final expiry notice');
        }
      }

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
