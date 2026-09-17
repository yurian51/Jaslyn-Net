import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

const RECONCILIATION_INTERVAL_MS = 60_000;

type ExpiryResult = {
  expiredBindings: number;
  suspendedCustomers: number;
};

@Injectable()
export class IspExpiryService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(@Inject(PG_POOL) private readonly db: Pool) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.reconcile().catch(() => undefined);
    }, RECONCILIATION_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async reconcile(): Promise<ExpiryResult> {
    if (this.running) return { expiredBindings: 0, suspendedCustomers: 0 };
    this.running = true;
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      const expiredBindings = await client.query<{ id: string; previous_state: string }>(
        `UPDATE customer_access_bindings
            SET state='EXPIRED', updated_at=now()
          WHERE state='ACTIVE'
            AND expires_at IS NOT NULL
            AND expires_at <= now()
          RETURNING id, state AS previous_state`,
      );

      for (const binding of expiredBindings.rows) {
        await client.query(
          `INSERT INTO access_state_events
             (tenant_id, access_binding_id, previous_state, new_state, reason, source)
           SELECT tenant_id, id, 'ACTIVE', 'EXPIRED', 'Access binding expired', 'SYSTEM_EXPIRY'
             FROM customer_access_bindings
            WHERE id=$1`,
          [binding.id],
        );
      }

      const suspendedCustomers = await client.query<{ tenant_id: string; customer_id: string; state: string }>(
        `UPDATE customer_service_state s
            SET state='SUSPENDED',
                reason='Service expired',
                source='SYSTEM_EXPIRY',
                effective_at=now()
          WHERE s.state='ACTIVE'
            AND s.expires_at IS NOT NULL
            AND s.expires_at <= now()
          RETURNING s.tenant_id, s.customer_id, 'ACTIVE' AS state`,
      );

      for (const customer of suspendedCustomers.rows) {
        await client.query(
          `INSERT INTO customer_service_state_events
             (tenant_id, customer_id, previous_state, new_state, reason, source, effective_at)
           VALUES ($1,$2,'ACTIVE','SUSPENDED','Service expired','SYSTEM_EXPIRY',now())`,
          [customer.tenant_id, customer.customer_id],
        );
      }

      await client.query('COMMIT');
      return {
        expiredBindings: expiredBindings.rowCount ?? 0,
        suspendedCustomers: suspendedCustomers.rowCount ?? 0,
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
      this.running = false;
    }
  }
}
