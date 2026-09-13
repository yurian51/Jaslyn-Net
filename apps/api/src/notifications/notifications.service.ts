import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

type NotificationChannel = 'SMS' | 'EMAIL' | 'WHATSAPP' | 'WEBHOOK';

@Injectable()
export class NotificationsService {
  constructor(@Inject(PG_POOL) private readonly db: Pool) {}

  async enqueue(
    tenantId: string,
    channel: NotificationChannel,
    recipient: string,
    eventType: string,
    payload: Record<string, unknown> = {},
    availableAt?: Date,
    dedupeKey?: string,
  ) {
    const result = await this.db.query(
      `INSERT INTO notification_outbox
        (tenant_id, channel, recipient, event_type, payload, available_at, dedupe_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (tenant_id, dedupe_key) WHERE dedupe_key IS NOT NULL
       DO UPDATE SET updated_at = notification_outbox.updated_at
       RETURNING id, status, attempts, available_at AS "availableAt", created_at AS "createdAt", dedupe_key AS "dedupeKey"`,
      [tenantId, channel, recipient.trim(), eventType.trim().toUpperCase(), payload, availableAt ?? new Date(), dedupeKey?.trim() || null],
    );
    return result.rows[0];
  }

  async claim(limit = 25) {
    const safeLimit = Math.min(Math.max(Math.trunc(limit || 25), 1), 100);
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `SELECT id, tenant_id AS "tenantId", channel, recipient, event_type AS "eventType", payload, attempts
         FROM notification_outbox
         WHERE status = 'PENDING' AND available_at <= now() AND attempts < 8
         ORDER BY created_at
         FOR UPDATE SKIP LOCKED
         LIMIT $1`,
        [safeLimit],
      );
      if (result.rowCount) {
        const ids = result.rows.map((row) => row.id);
        await client.query(
          `UPDATE notification_outbox
           SET status = 'PROCESSING', locked_at = now(), attempts = attempts + 1, updated_at = now()
           WHERE id = ANY($1::uuid[])`,
          [ids],
        );
      }
      await client.query('COMMIT');
      return result.rows;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async recoverStaleProcessing(tenantId?: string, maxAgeMinutes = 15) {
    const age = Math.min(Math.max(Math.trunc(maxAgeMinutes), 1), 1440);
    const result = await this.db.query(
      `UPDATE notification_outbox
       SET status = CASE WHEN attempts >= 8 THEN 'FAILED' ELSE 'PENDING' END,
           available_at = CASE WHEN attempts >= 8 THEN available_at ELSE now() END,
           locked_at = NULL,
           last_error = CASE WHEN attempts >= 8 THEN 'Retry budget exhausted after stale lock recovery' ELSE 'Recovered stale processing lock' END,
           updated_at = now()
       WHERE status = 'PROCESSING'
         AND locked_at < now() - ($1 * interval '1 minute')
         AND ($2::uuid IS NULL OR tenant_id = $2::uuid)
       RETURNING id, tenant_id AS "tenantId", status, attempts`,
      [age, tenantId ?? null],
    );
    return { recovered: result.rowCount ?? 0, data: result.rows };
  }

  async stats(tenantId: string) {
    const result = await this.db.query(
      `SELECT status, count(*)::int AS count
       FROM notification_outbox
       WHERE tenant_id = $1
       GROUP BY status
       ORDER BY status`,
      [tenantId],
    );
    const totals = { PENDING: 0, PROCESSING: 0, SENT: 0, FAILED: 0, CANCELED: 0 };
    for (const row of result.rows) totals[row.status as keyof typeof totals] = Number(row.count);
    return totals;
  }

  async markSent(id: string) {
    const result = await this.db.query(
      `UPDATE notification_outbox
       SET status = 'SENT', sent_at = now(), locked_at = NULL, updated_at = now()
       WHERE id = $1 AND status = 'PROCESSING'
       RETURNING id, status, sent_at AS "sentAt"`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async markFailed(id: string, error: string, retryDelaySeconds = 60) {
    const delay = Math.min(Math.max(Math.trunc(retryDelaySeconds), 5), 86400);
    const result = await this.db.query(
      `UPDATE notification_outbox
       SET status = CASE WHEN attempts >= 8 THEN 'FAILED' ELSE 'PENDING' END,
           available_at = CASE WHEN attempts >= 8 THEN available_at ELSE now() + ($2 * interval '1 second') END,
           locked_at = NULL,
           last_error = left($3, 2000),
           updated_at = now()
       WHERE id = $1 AND status = 'PROCESSING'
       RETURNING id, status, attempts, available_at AS "availableAt"`,
      [id, delay, error || 'Unknown notification delivery error'],
    );
    return result.rows[0] ?? null;
  }

  async list(tenantId: string, limit = 100) {
    const safeLimit = Math.min(Math.max(Math.trunc(limit || 100), 1), 500);
    const result = await this.db.query(
      `SELECT id, channel, recipient, event_type AS "eventType", payload, status, attempts,
              available_at AS "availableAt", locked_at AS "lockedAt", sent_at AS "sentAt",
              last_error AS "lastError", created_at AS "createdAt", updated_at AS "updatedAt",
              dedupe_key AS "dedupeKey"
       FROM notification_outbox
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [tenantId, safeLimit],
    );
    return { data: result.rows, count: result.rowCount ?? 0 };
  }
}
