import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

type NotificationChannel = 'SMS' | 'EMAIL' | 'WHATSAPP' | 'WEBHOOK';
export type SmsCategory = 'TRANSACTIONAL' | 'EXPIRY' | 'PAYMENT' | 'PURCHASE' | 'MARKETING';

function normalizeTanzaniaPhone(input: string) {
  const digits = input.trim().replace(/[\s().-]/g, '').replace(/^\+/, '');
  const normalized = digits.startsWith('0') ? `255${digits.slice(1)}` : digits;
  if (!/^255\d{9}$/.test(normalized)) {
    throw new BadRequestException('Phone number must be a Tanzanian mobile number, for example 255712345678');
  }
  return normalized;
}

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

  async enqueueSms(
    tenantId: string,
    input: { recipient: string; message: string; category: SmsCategory; idempotencyKey: string; availableAt?: Date },
  ) {
    const recipient = normalizeTanzaniaPhone(input.recipient);
    const message = input.message.trim();
    const category = input.category;
    const idempotencyKey = input.idempotencyKey.trim();
    if (!message || message.length > 1600) throw new BadRequestException('SMS message must contain 1-1600 characters');
    if (!idempotencyKey || idempotencyKey.length > 180) throw new BadRequestException('An idempotency key of 1-180 characters is required');
    if (!['TRANSACTIONAL', 'EXPIRY', 'PAYMENT', 'PURCHASE', 'MARKETING'].includes(category)) {
      throw new BadRequestException('Unsupported SMS category');
    }
    if (category === 'MARKETING') {
      const consent = await this.db.query(
        `SELECT id FROM customers
          WHERE tenant_id=$1 AND CASE WHEN regexp_replace(coalesce(phone,''),'[^0-9]','','g') LIKE '0%' THEN '255'||substring(regexp_replace(coalesce(phone,''),'[^0-9]','','g') FROM 2) ELSE regexp_replace(coalesce(phone,''),'[^0-9]','','g') END = $2
            AND sms_marketing_consent=true
          LIMIT 1`,
        [tenantId, recipient],
      );
      if (!consent.rowCount) throw new ForbiddenException('Marketing SMS requires recorded customer opt-in for this tenant and number');
    }
    const result = await this.db.query(
      `INSERT INTO notification_outbox
        (tenant_id,channel,recipient,event_type,payload,available_at,dedupe_key,category)
       VALUES ($1,'SMS',$2,$3,$4::jsonb,$5,$6,$7)
       ON CONFLICT (tenant_id,dedupe_key) WHERE dedupe_key IS NOT NULL
       DO UPDATE SET updated_at=notification_outbox.updated_at
       RETURNING id,status,attempts,available_at AS "availableAt",created_at AS "createdAt",
                 dedupe_key AS "dedupeKey",category,
                 recipient=$2 AND event_type=$3 AND payload=$4::jsonb AND category IS NOT DISTINCT FROM $7 AS "requestMatches"`,
      [tenantId, recipient, category, JSON.stringify({ message }), input.availableAt ?? new Date(), idempotencyKey, category],
    );
    if (result.rows[0]?.requestMatches === false) {
      throw new ConflictException('SMS idempotency key is already bound to a different message');
    }
    return result.rows[0];
  }

  async enqueueBulkSms(
    tenantId: string,
    input: { recipients: string[]; message: string; category: SmsCategory; idempotencyKey: string; name?: string },
  ) {
    const message = input.message.trim();
    const idempotencyKey = input.idempotencyKey.trim();
    const category = input.category;
    if (!message || message.length > 1600) throw new BadRequestException('SMS message must contain 1-1600 characters');
    if (!idempotencyKey || idempotencyKey.length > 160) throw new BadRequestException('An idempotency key of 1-160 characters is required');
    if (!['TRANSACTIONAL', 'EXPIRY', 'PAYMENT', 'PURCHASE', 'MARKETING'].includes(category)) {
      throw new BadRequestException('Unsupported SMS category');
    }
    if (!Array.isArray(input.recipients) || input.recipients.length === 0 || input.recipients.length > 1000) {
      throw new BadRequestException('Bulk SMS requires between 1 and 1000 recipients');
    }
    const recipients = [...new Set(input.recipients.map(normalizeTanzaniaPhone))];
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      if (category === 'MARKETING') {
        const consent = await client.query(
          `SELECT DISTINCT CASE WHEN regexp_replace(coalesce(phone,''),'[^0-9]','','g') LIKE '0%'
                    THEN '255'||substring(regexp_replace(coalesce(phone,''),'[^0-9]','','g') FROM 2)
                    ELSE regexp_replace(coalesce(phone,''),'[^0-9]','','g') END AS phone
             FROM customers
            WHERE tenant_id=$1 AND sms_marketing_consent=true
              AND CASE WHEN regexp_replace(coalesce(phone,''),'[^0-9]','','g') LIKE '0%'
                       THEN '255'||substring(regexp_replace(coalesce(phone,''),'[^0-9]','','g') FROM 2)
                       ELSE regexp_replace(coalesce(phone,''),'[^0-9]','','g') END = ANY($2::text[])`,
          [tenantId, recipients],
        );
        const consented = new Set(consent.rows.map((row: { phone: string }) => row.phone));
        const missing = recipients.filter((phone) => !consented.has(phone));
        if (missing.length) throw new ForbiddenException(`Marketing SMS requires recorded opt-in for every recipient; ${missing.length} recipient(s) are not opted in`);
      }
      const campaign = await client.query(
        `INSERT INTO sms_campaigns (tenant_id,name,category,message,recipient_count,queued_count,idempotency_key)
         VALUES ($1,$2,$3,$4,$5,0,$6)
         ON CONFLICT (tenant_id,idempotency_key) DO UPDATE SET updated_at=sms_campaigns.updated_at
         RETURNING id,tenant_id AS "tenantId",name,category,status,recipient_count AS "recipientCount",
                   queued_count AS "queuedCount",created_at AS "createdAt",idempotency_key AS "idempotencyKey"`,
        [tenantId, (input.name || `SMS ${category.toLowerCase()} campaign`).trim().slice(0,120), category, message, recipients.length, idempotencyKey],
      );
      const row = campaign.rows[0];
      if (row.queuedCount > 0 || row.status !== 'QUEUED') {
        await client.query('COMMIT');
        return row;
      }
      for (const recipient of recipients) {
        await client.query(
          `INSERT INTO notification_outbox
             (tenant_id,channel,recipient,event_type,payload,available_at,dedupe_key,category,campaign_id)
           VALUES ($1,'SMS',$2,$3,$4::jsonb,now(),$5,$3,$6)
           ON CONFLICT (tenant_id,dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
          [tenantId, recipient, category, JSON.stringify({ message }), `campaign:${row.id}:${recipient}`, row.id],
        );
      }
      const counts = await client.query(
        `SELECT count(*)::int AS queued_count FROM notification_outbox WHERE tenant_id=$1 AND campaign_id=$2`,
        [tenantId, row.id],
      );
      const updated = await client.query(
        `UPDATE sms_campaigns SET queued_count=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2
         RETURNING id,tenant_id AS "tenantId",name,category,status,recipient_count AS "recipientCount",
                   queued_count AS "queuedCount",created_at AS "createdAt",idempotency_key AS "idempotencyKey"`,
        [tenantId, row.id, counts.rows[0].queued_count],
      );
      await client.query('COMMIT');
      return updated.rows[0];
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async listSmsCampaigns(tenantId: string, limit = 50) {
    const safeLimit = Math.min(Math.max(Math.trunc(limit || 50), 1), 200);
    const result = await this.db.query(
      `SELECT c.id,c.name,c.category,
              CASE
                WHEN count(o.id) FILTER (WHERE o.status IN ('PENDING','PROCESSING')) > 0
                  THEN CASE WHEN count(o.id) FILTER (WHERE o.status='PROCESSING') > 0 THEN 'PROCESSING' ELSE 'QUEUED' END
                WHEN c.recipient_count > 0 AND count(o.id) FILTER (WHERE o.status='FAILED') >= c.recipient_count THEN 'FAILED'
                WHEN count(o.id) FILTER (WHERE o.status='FAILED') > 0 AND count(o.id) FILTER (WHERE o.status='SENT') > 0 THEN 'PARTIAL'
                WHEN c.recipient_count > 0 AND count(o.id) FILTER (WHERE o.status='SENT') >= c.recipient_count THEN 'COMPLETED'
                ELSE c.status
              END AS status,
              c.recipient_count AS "recipientCount",c.queued_count AS "queuedCount",c.created_at AS "createdAt",
              count(o.id) FILTER (WHERE o.status='PENDING')::int AS pending,
              count(o.id) FILTER (WHERE o.status='PROCESSING')::int AS processing,
              count(o.id) FILTER (WHERE o.status='SENT')::int AS accepted,
              count(o.id) FILTER (WHERE o.status='FAILED')::int AS failed
         FROM sms_campaigns c LEFT JOIN notification_outbox o
           ON o.tenant_id=c.tenant_id AND o.campaign_id=c.id
        WHERE c.tenant_id=$1
        GROUP BY c.id
        ORDER BY c.created_at DESC LIMIT $2`,
      [tenantId, safeLimit],
    );
    return { data: result.rows, count: result.rowCount ?? 0 };
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

  async claimSms(limit = 25) {
    const safeLimit = Math.min(Math.max(Math.trunc(limit || 25), 1), 100);
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `SELECT id,tenant_id AS "tenantId",recipient,payload,attempts,dedupe_key AS "dedupeKey"
           FROM notification_outbox
          WHERE channel='SMS' AND status='PENDING' AND available_at<=now() AND attempts<8
          ORDER BY available_at,created_at
          FOR UPDATE SKIP LOCKED
          LIMIT $1`,
        [safeLimit],
      );
      if (result.rowCount) {
        await client.query(
          `UPDATE notification_outbox
              SET status='PROCESSING',locked_at=now(),attempts=attempts+1,updated_at=now()
            WHERE id=ANY($1::uuid[])`,
          [result.rows.map((row) => row.id)],
        );
      }
      await client.query('COMMIT');
      return result.rows.map((row) => ({ ...row, attempts: Number(row.attempts) + 1 }));
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

  async deferSms(id: string, reason: string) {
    const result = await this.db.query(
      `UPDATE notification_outbox
       SET status='PENDING', attempts=GREATEST(attempts-1,0), available_at=now() + interval '5 minutes',
           locked_at=NULL, last_error=left($2,500), updated_at=now()
       WHERE id=$1 AND status='PROCESSING'
       RETURNING id,status,attempts,available_at AS "availableAt"`,
      [id, reason || 'SMS provider is not configured'],
    );
    return result.rows[0] ?? null;
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

  async markSent(id: string, providerMessageId?: string) {
    const result = await this.db.query(
      `UPDATE notification_outbox
       SET status = 'SENT', sent_at = now(), locked_at = NULL, provider_message_id=$2, last_error=NULL, updated_at = now()
       WHERE id = $1 AND status = 'PROCESSING'
       RETURNING id, status, sent_at AS "sentAt", provider_message_id AS "providerMessageId"`,
      [id, providerMessageId ?? null],
    );
    return result.rows[0] ?? null;
  }

  async markPermanentlyFailed(id: string, error: string) {
    const result = await this.db.query(
      `UPDATE notification_outbox
       SET status='FAILED',locked_at=NULL,last_error=left($2,2000),updated_at=now()
       WHERE id=$1 AND status='PROCESSING'
       RETURNING id,status,attempts,last_error AS "lastError"`,
      [id, error || 'Permanent SMS provider rejection'],
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
              dedupe_key AS "dedupeKey", category, provider_message_id AS "providerMessageId"
       FROM notification_outbox
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [tenantId, safeLimit],
    );
    return { data: result.rows, count: result.rowCount ?? 0 };
  }
}
