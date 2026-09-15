import { ConflictException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { CreatePaymentIntentDto, PaymentWebhookDto } from './payments.dto';
import { PAYMENT_METHOD_CATALOG } from './payment-method.catalog';

type DatabaseError = { code?: string; constraint?: string };
type PaymentRecord = { id: string; provider: string; status: string; purchaseId: string | null };

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(PG_POOL) private readonly db: Pool,
    private readonly config: ConfigService,
  ) {}

  async list(tenantId: string) {
    const result = await this.db.query(
      `SELECT id, customer_id AS "customerId", purchase_id AS "purchaseId", provider, provider_reference AS "providerReference", amount, currency, status, idempotency_key AS "idempotencyKey", created_at AS "createdAt", updated_at AS "updatedAt" FROM payments WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 200`,
      [tenantId],
    );
    return { data: result.rows };
  }

  async listMethods(tenantId: string) {
    const configured = await this.db.query<{ provider: string; isActive: boolean; metadata: Record<string, unknown> }>(
      `SELECT provider, is_active AS "isActive", metadata
       FROM payment_provider_configs
       WHERE tenant_id=$1`,
      [tenantId],
    );
    const configuredByProvider = new Map(configured.rows.map(row => [row.provider.trim().toLowerCase(), row]));

    return {
      data: PAYMENT_METHOD_CATALOG.map(method => {
        const config = configuredByProvider.get(method.code);
        return {
          ...method,
          configured: method.code === 'manual' || Boolean(config?.isActive),
          enabled: method.code === 'manual' || Boolean(config?.isActive),
          metadata: config?.metadata ?? {},
        };
      }),
    };
  }

  async createIntent(tenantId: string, input: CreatePaymentIntentDto) {
    const client = await this.db.connect();
    const provider = input.provider.trim().toLowerCase();
    const key = input.idempotencyKey?.trim() || `intent:${input.purchaseId}:${provider}`;
    try {
      await client.query('BEGIN');
      const purchase = await client.query(
        `SELECT id, customer_id, price, currency, status FROM wifi_plan_purchases WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
        [tenantId, input.purchaseId],
      );
      if (!purchase.rowCount) throw new NotFoundException('Purchase not found');
      if (purchase.rows[0].status !== 'PENDING_PAYMENT') throw new ConflictException(`Purchase is ${purchase.rows[0].status}`);
      const method = PAYMENT_METHOD_CATALOG.find(item => item.code === provider);
      if (!method) throw new ConflictException(`Unsupported payment method: ${provider}`);
      if (provider !== 'manual') {
        const configured = await client.query(
          `SELECT 1 FROM payment_provider_configs WHERE tenant_id=$1 AND provider=$2 AND is_active=true LIMIT 1`,
          [tenantId, provider],
        );
        if (!configured.rowCount) throw new ConflictException(`Payment method ${provider} is not configured for this organization`);
      }
      const existing = await client.query(`SELECT id, status, provider FROM payments WHERE tenant_id=$1 AND idempotency_key=$2`, [tenantId, key]);
      if (existing.rowCount) {
        if (existing.rows[0].provider !== provider) throw new ConflictException('Idempotency key is already bound to another provider');
        await client.query('COMMIT');
        return { id: existing.rows[0].id, status: existing.rows[0].status, provider: existing.rows[0].provider, idempotencyKey: key, reused: true };
      }
      const result = await client.query(
        `INSERT INTO payments (tenant_id, customer_id, purchase_id, provider, amount, currency, status, idempotency_key) VALUES ($1,$2,$3,$4,$5,$6,'PENDING',$7) RETURNING id, customer_id AS "customerId", purchase_id AS "purchaseId", provider, amount, currency, status, idempotency_key AS "idempotencyKey", created_at AS "createdAt"`,
        [tenantId, purchase.rows[0].customer_id, input.purchaseId, provider, purchase.rows[0].price, purchase.rows[0].currency, key],
      );
      await client.query('COMMIT');
      return { ...result.rows[0], reused: false };
    } catch (error: unknown) {
      await client.query('ROLLBACK').catch(() => undefined);
      const dbError = error as DatabaseError;
      if (dbError.code === '23505' && dbError.constraint === 'payments_one_pending_per_purchase_uq') {
        const existing = await this.db.query(
          `SELECT id, status, provider, idempotency_key AS "idempotencyKey" FROM payments WHERE tenant_id=$1 AND purchase_id=$2 AND status='PENDING' ORDER BY created_at ASC LIMIT 1`,
          [tenantId, input.purchaseId],
        );
        if (existing.rowCount) {
          if (existing.rows[0].provider !== provider) throw new ConflictException('A pending payment already exists for another provider');
          return { ...existing.rows[0], reused: true };
        }
      }
      if (dbError.code === '23505') {
        const existing = await this.db.query(
          `SELECT id, status, provider, idempotency_key AS "idempotencyKey" FROM payments WHERE tenant_id=$1 AND idempotency_key=$2`,
          [tenantId, key],
        );
        if (existing.rowCount) {
          if (existing.rows[0].provider !== provider) throw new ConflictException('Idempotency key is already bound to another provider');
          return { ...existing.rows[0], reused: true };
        }
      }
      throw error;
    } finally { client.release(); }
  }

  private async resolveWebhookSecret(tenantId: string, provider: string): Promise<string> {
    const result = await this.db.query(
      `SELECT webhook_secret_ref AS "webhookSecretRef" FROM payment_provider_configs WHERE tenant_id=$1 AND provider=$2 AND is_active=true`,
      [tenantId, provider],
    );
    const ref = result.rows[0]?.webhookSecretRef as string | undefined;
    const secret = ref ? this.config.get<string>(ref) : undefined;
    if (!secret) throw new UnauthorizedException('Webhook provider is not configured');
    return secret;
  }

  private verifyWebhookSignature(secret: string, rawBody: Buffer, signature: string | undefined) {
    if (!signature) throw new UnauthorizedException('Missing webhook signature');
    const supplied = signature.trim().replace(/^sha256=/i, '');
    if (!/^[a-f0-9]{64}$/i.test(supplied)) throw new UnauthorizedException('Invalid webhook signature');
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const left = Buffer.from(supplied, 'hex');
    const right = Buffer.from(expected, 'hex');
    if (left.length !== right.length || !timingSafeEqual(left, right)) throw new UnauthorizedException('Invalid webhook signature');
  }

  async webhook(tenantId: string, input: PaymentWebhookDto, rawBody: Buffer, signature?: string) {
    const provider = input.provider.trim().toLowerCase();
    const providerEventId = input.providerEventId.trim();
    const secret = await this.resolveWebhookSecret(tenantId, provider);
    this.verifyWebhookSignature(secret, rawBody, signature);

    const eventClient = await this.db.connect();
    let eventId: string;
    try {
      await eventClient.query('BEGIN');
      const inserted = await eventClient.query(
        `INSERT INTO payment_events (tenant_id, payment_id, provider, provider_event_id, event_type, payload, signature_valid, processing_status)
         VALUES ($1,NULL,$2,$3,$4,$5,true,'RECEIVED')
         ON CONFLICT (tenant_id, provider, provider_event_id) WHERE provider_event_id IS NOT NULL
         DO NOTHING
         RETURNING id, processing_status AS "processingStatus", payment_id AS "paymentId"`,
        [tenantId, provider, providerEventId, input.eventType.trim(), input.payload ?? {}],
      );

      if (inserted.rowCount) {
        eventId = inserted.rows[0].id;
        await eventClient.query('COMMIT');
      } else {
        const existing = await eventClient.query(
          `SELECT id, event_type AS "eventType", processing_status AS "processingStatus", payment_id AS "paymentId"
           FROM payment_events
           WHERE tenant_id=$1 AND provider=$2 AND provider_event_id=$3
           FOR UPDATE`,
          [tenantId, provider, providerEventId],
        );
        if (!existing.rowCount) throw new ConflictException('Payment event could not be resolved after conflict');
        if (existing.rows[0].eventType !== input.eventType.trim()) {
          throw new ConflictException('Payment event identifier is already bound to a different event type');
        }
        eventId = existing.rows[0].id;
        if (existing.rows[0].processingStatus === 'PROCESSED') {
          await eventClient.query('COMMIT');
          return { accepted: true, duplicate: true, paymentId: existing.rows[0].paymentId };
        }
        await eventClient.query('COMMIT');
      }
    } catch (error: unknown) {
      await eventClient.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally { eventClient.release(); }

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      let payment: PaymentRecord | undefined;
      if (input.purchaseId) {
        const result = await client.query<PaymentRecord>(
          `SELECT id, provider, status, purchase_id AS "purchaseId" FROM payments WHERE tenant_id=$1 AND purchase_id=$2 ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
          [tenantId, input.purchaseId],
        );
        payment = result.rows[0];
      } else if (input.providerReference) {
        const result = await client.query<PaymentRecord>(
          `SELECT id, provider, status, purchase_id AS "purchaseId" FROM payments WHERE tenant_id=$1 AND provider=$2 AND provider_reference=$3 FOR UPDATE`,
          [tenantId, provider, input.providerReference.trim()],
        );
        payment = result.rows[0];
      }
      if (!payment) throw new NotFoundException('Payment could not be resolved');
      if (payment.provider !== provider) throw new ConflictException('Webhook provider does not match payment provider');

      await client.query(`UPDATE payment_events SET payment_id=$1 WHERE tenant_id=$2 AND id=$3`, [payment.id, tenantId, eventId]);

      if (payment.status === 'SUCCESS') {
        await client.query(`UPDATE payment_events SET processing_status='PROCESSED', processed_at=now() WHERE tenant_id=$1 AND id=$2`, [tenantId, eventId]);
        await client.query('COMMIT');
        return { accepted: true, duplicate: false, paymentId: payment.id, alreadySuccessful: true, statePreserved: input.status !== 'SUCCESS' };
      }

      const nextStatus = input.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED';
      await client.query(
        `UPDATE payments SET provider_reference=COALESCE($2, provider_reference), status=$3, raw_payload=$4, updated_at=now() WHERE tenant_id=$1 AND id=$5`,
        [tenantId, input.providerReference?.trim() ?? null, nextStatus, input.payload ?? {}, payment.id],
      );

      if (nextStatus === 'SUCCESS' && payment.purchaseId) {
        const purchase = await client.query(`SELECT id, package_id, customer_id, router_id, status FROM wifi_plan_purchases WHERE tenant_id=$1 AND id=$2 FOR UPDATE`, [tenantId, payment.purchaseId]);
        if (purchase.rowCount && purchase.rows[0].status === 'PENDING_PAYMENT') {
          const pkg = await client.query(`SELECT duration_seconds FROM packages WHERE tenant_id=$1 AND id=$2`, [tenantId, purchase.rows[0].package_id]);
          if (!pkg.rowCount) throw new NotFoundException('Package not found');
          await client.query(`UPDATE wifi_plan_purchases SET status='PAID', starts_at=now(), ends_at=now()+($3::bigint * interval '1 second'), updated_at=now() WHERE tenant_id=$1 AND id=$2`, [tenantId, purchase.rows[0].id, pkg.rows[0].duration_seconds]);
          await client.query(`INSERT INTO access_grants (tenant_id,purchase_id,customer_id,router_id,status,starts_at,ends_at) SELECT tenant_id,id,customer_id,router_id,'ACTIVE',starts_at,ends_at FROM wifi_plan_purchases WHERE tenant_id=$1 AND id=$2 ON CONFLICT (purchase_id) DO UPDATE SET status='ACTIVE',starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,updated_at=now()`, [tenantId, purchase.rows[0].id]);
        }
      }
      if (nextStatus === 'FAILED' && payment.purchaseId) {
        await client.query(`UPDATE wifi_plan_purchases SET status='CANCELED', updated_at=now() WHERE tenant_id=$1 AND id=$2 AND status='PENDING_PAYMENT'`, [tenantId, payment.purchaseId]);
      }
      await client.query(`UPDATE payment_events SET processing_status='PROCESSED', processed_at=now() WHERE tenant_id=$1 AND id=$2`, [tenantId, eventId]);
      await client.query('COMMIT');
      return { accepted: true, duplicate: false, paymentId: payment.id };
    } catch (error: unknown) {
      await client.query('ROLLBACK').catch(() => undefined);
      await this.db.query(`UPDATE payment_events SET processing_status='FAILED' WHERE tenant_id=$1 AND id=$2`, [tenantId, eventId]).catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }
}
