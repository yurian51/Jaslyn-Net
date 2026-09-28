import { ConflictException, Inject, Injectable, NotFoundException, Optional, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { CreatePaymentIntentDto, PaymentWebhookDto } from './payments.dto';
import { PAYMENT_METHOD_CATALOG, getPaymentMethod } from './payment-method.catalog';
import { getCorrelationId } from '../common/correlation-context';
import { CommunicationDomainEventsService } from '../communication/communication.domain-events';
import { AuditService } from '../audit/audit.service';

type DatabaseError = { code?: string; constraint?: string };
type PaymentRecord = { id: string; provider: string; status: string; purchaseId: string | null };
type Queryable = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>;

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(PG_POOL) private readonly db: Pool,
    private readonly config: ConfigService,
    @Optional() private readonly domainEvents?: CommunicationDomainEventsService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  async list(tenantId: string) {
    const result = await this.db.query(
      `SELECT id, customer_id AS "customerId", purchase_id AS "purchaseId", provider, provider_reference AS "providerReference", amount, currency, status, idempotency_key AS "idempotencyKey", correlation_id AS "correlationId", created_at AS "createdAt", updated_at AS "updatedAt" FROM payments WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 200`,
      [tenantId],
    );
    return { data: result.rows };
  }

  async listMethods(tenantId: string) {
    const configured = await this.db.query<{ provider: string; isActive: boolean; metadata: Record<string, unknown> }>(
      `SELECT provider, is_active AS "isActive", metadata FROM payment_provider_configs WHERE tenant_id=$1`,
      [tenantId],
    );
    const configuredByProvider = new Map(configured.rows.map(row => [row.provider.trim().toLowerCase(), row]));
    return {
      data: PAYMENT_METHOD_CATALOG.map(method => {
        const config = configuredByProvider.get(method.code);
        return { ...method, configured: method.code === 'manual' || Boolean(config?.isActive), enabled: method.code === 'manual' || Boolean(config?.isActive), metadata: config?.metadata ?? {} };
      }),
    };
  }

  async assertMethodCanSettle(tenantId: string, providerInput: string, currency: string, db: Queryable = this.db) {
    const provider = providerInput.trim().toLowerCase();
    const normalizedCurrency = currency.trim().toUpperCase();
    const method = getPaymentMethod(provider);
    if (!method) throw new ConflictException(`Unsupported payment method: ${provider}`);
    if (!method.currencies.includes('*') && !method.currencies.includes(normalizedCurrency)) throw new ConflictException(`Payment method ${provider} does not support currency ${normalizedCurrency}`);
    if (provider === 'manual') return method;
    const configured = await db.query<{ metadata: Record<string, unknown> }>(`SELECT metadata FROM payment_provider_configs WHERE tenant_id=$1 AND provider=$2 AND is_active=true LIMIT 1`, [tenantId, provider]);
    if (!configured.rowCount) throw new ConflictException(`Payment method ${provider} is not configured for this organization`);
    const metadata = configured.rows[0]?.metadata ?? {};
    const configuredCurrencies = Array.isArray(metadata.currencies) ? metadata.currencies.map(value => String(value).toUpperCase()) : null;
    if (configuredCurrencies?.length && !configuredCurrencies.includes('*') && !configuredCurrencies.includes(normalizedCurrency)) throw new ConflictException(`Payment method ${provider} is not configured for currency ${normalizedCurrency}`);
    return method;
  }

  async createIntent(tenantId: string, input: CreatePaymentIntentDto) {
    const client = await this.db.connect();
    const provider = input.provider.trim().toLowerCase();
    const key = input.idempotencyKey?.trim() || `intent:${input.purchaseId}:${provider}`;
    let correlationId = getCorrelationId() ?? null;
    try {
      await client.query('BEGIN');
      const purchase = await client.query(`SELECT id, customer_id, price, currency, status, correlation_id FROM wifi_plan_purchases WHERE tenant_id=$1 AND id=$2 FOR UPDATE`, [tenantId, input.purchaseId]);
      if (!purchase.rowCount) throw new NotFoundException('Purchase not found');
      if (purchase.rows[0].status !== 'PENDING_PAYMENT') throw new ConflictException(`Purchase is ${purchase.rows[0].status}`);
      correlationId ??= purchase.rows[0].correlation_id ?? `payment-intent:${input.purchaseId}`;
      await this.assertMethodCanSettle(tenantId, provider, purchase.rows[0].currency, client);
      const existing = await client.query(`SELECT id, status, provider FROM payments WHERE tenant_id=$1 AND idempotency_key=$2`, [tenantId, key]);
      if (existing.rowCount) {
        if (existing.rows[0].provider !== provider) throw new ConflictException('Idempotency key is already bound to another provider');
        await client.query('COMMIT');
        return { id: existing.rows[0].id, status: existing.rows[0].status, provider: existing.rows[0].provider, idempotencyKey: key, reused: true };
      }
      const result = await client.query(`INSERT INTO payments (tenant_id, customer_id, purchase_id, provider, amount, currency, status, idempotency_key, correlation_id) VALUES ($1,$2,$3,$4,$5,$6,'INITIATED',$7,$8) RETURNING id, customer_id AS "customerId", purchase_id AS "purchaseId", provider, amount, currency, status, idempotency_key AS "idempotencyKey", created_at AS "createdAt"`, [tenantId, purchase.rows[0].customer_id, input.purchaseId, provider, purchase.rows[0].price, purchase.rows[0].currency, key, correlationId]);
      await client.query('COMMIT');
      return { ...result.rows[0], reused: false };
    } catch (error: unknown) {
      await client.query('ROLLBACK').catch(() => undefined);
      const dbError = error as DatabaseError;
      if (dbError.code === '23505' && dbError.constraint === 'payments_one_active_attempt_per_purchase_uq') {
        const existing = await this.db.query(`SELECT id, status, provider, idempotency_key AS "idempotencyKey" FROM payments WHERE tenant_id=$1 AND purchase_id=$2 AND status IN ('INITIATED','PENDING','AUTHORIZED') ORDER BY created_at ASC LIMIT 1`, [tenantId, input.purchaseId]);
        if (existing.rowCount) {
          if (existing.rows[0].provider !== provider) throw new ConflictException('A pending payment already exists for another provider');
          return { ...existing.rows[0], reused: true };
        }
      }
      if (dbError.code === '23505') {
        const existing = await this.db.query(`SELECT id, status, provider, idempotency_key AS "idempotencyKey" FROM payments WHERE tenant_id=$1 AND idempotency_key=$2`, [tenantId, key]);
        if (existing.rowCount) {
          if (existing.rows[0].provider !== provider) throw new ConflictException('Idempotency key is already bound to another provider');
          return { ...existing.rows[0], reused: true };
        }
      }
      throw error;
    } finally { client.release(); }
  }

  async recordVerifiedSettlement(client: Pick<PoolClient, 'query'>, tenantId: string, paymentId: string, amount: string | number, currency: string, provider: string) {
    const payment = await client.query<{ status: string; amount: string; currency: string; provider: string; correlationId: string | null }>(
      `SELECT status, amount, currency, provider, correlation_id AS "correlationId" FROM payments WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
      [tenantId, paymentId],
    );
    const settledPayment = payment.rows[0];
    const correlationId = settledPayment?.correlationId ?? getCorrelationId() ?? `payment:${paymentId}`;
    if (!settledPayment || settledPayment.status !== 'PAID') throw new ConflictException('Only a PAID payment can be settled');
    if (settledPayment.provider !== provider) throw new ConflictException('Settlement provider does not match payment provider');
    if (String(settledPayment.amount) !== String(amount) || settledPayment.currency !== currency) throw new ConflictException('Settlement amount or currency does not match payment');
    await client.query(
      `UPDATE payments
          SET verification_status='VERIFIED',
              verified_at=COALESCE(verified_at,now()),
              verification_source=COALESCE(verification_source,'MANUAL_SETTLEMENT'),
              updated_at=now()
        WHERE tenant_id=$1 AND id=$2 AND status='PAID'`,
      [tenantId, paymentId],
    );
    const cashCode = `CASH:${provider}:${currency}`.slice(0, 64);
    const revenueCode = `REVENUE:WIFI:${currency}`.slice(0, 64);
    const cashAccount = await client.query<{ id: string }>(
      `INSERT INTO financial_ledger_accounts (tenant_id, code, name, account_type, currency)
       VALUES ($1,$2,$3,'ASSET',$4)
       ON CONFLICT (tenant_id, code) DO UPDATE SET name=EXCLUDED.name, currency=EXCLUDED.currency
       RETURNING id`,
      [tenantId, cashCode, `Settlement ${provider}`, currency],
    );
    const revenueAccount = await client.query<{ id: string }>(
      `INSERT INTO financial_ledger_accounts (tenant_id, code, name, account_type, currency)
       VALUES ($1,$2,'WiFi service revenue','REVENUE',$3)
       ON CONFLICT (tenant_id, code) DO UPDATE SET name=EXCLUDED.name, currency=EXCLUDED.currency
       RETURNING id`,
      [tenantId, revenueCode, currency],
    );
    const transaction = await client.query<{ id: string }>(
      `INSERT INTO financial_ledger_transactions
         (tenant_id,transaction_type,reference_type,reference_id,correlation_id,description)
       VALUES ($1,'PAYMENT','PAYMENT',$2,$3,$4)
       ON CONFLICT (tenant_id,transaction_type,reference_type,reference_id) WHERE reference_id IS NOT NULL DO NOTHING
       RETURNING id`,
      [tenantId, paymentId, correlationId, `Verified payment settlement via ${provider}`],
    );
    let transactionId = transaction.rows[0]?.id;
    if (!transactionId) {
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM financial_ledger_transactions
         WHERE tenant_id=$1 AND transaction_type='PAYMENT' AND reference_type='PAYMENT' AND reference_id=$2
         LIMIT 1`,
        [tenantId, paymentId],
      );
      transactionId = existing.rows[0]?.id;
    }
    if (!transactionId) throw new ConflictException('Verified payment settlement ledger transaction could not be created');

    const existingEntries = await client.query(
      `SELECT 1 FROM financial_ledger_entries WHERE tenant_id=$1 AND transaction_id=$2 LIMIT 1`,
      [tenantId, transactionId],
    );
    if (!existingEntries.rowCount) {
      await client.query(
        `INSERT INTO financial_ledger_entries
           (tenant_id,transaction_id,account_id,currency,debit,credit)
         VALUES ($1,$2,$3,$4,$5,0),($1,$2,$6,$4,0,$5)`,
        [tenantId, transactionId, cashAccount.rows[0]?.id, currency, amount, revenueAccount.rows[0]?.id],
      );
    }
    return transactionId;
  }

  private async resolveWebhookSecret(tenantId: string, provider: string): Promise<string> {
    const result = await this.db.query(`SELECT webhook_secret_ref AS "webhookSecretRef" FROM payment_provider_configs WHERE tenant_id=$1 AND provider=$2 AND is_active=true`, [tenantId, provider]);
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

  private async applyVerifiedWebhook(
    client: Pick<PoolClient, 'query'>,
    tenantId: string,
    input: PaymentWebhookDto,
    eventId: string,
  ) {
    const targetStatus = input.status === 'SUCCESS' ? 'PAID' : input.status === 'FAILED' ? 'FAILED' : 'REFUNDED';
    const paymentResult = await client.query<{
      id: string; status: string; amount: string; currency: string; provider: string;
      purchaseId: string | null; correlationId: string | null;
    }>(
      `SELECT id,status,amount,currency,provider,purchase_id AS "purchaseId",correlation_id AS "correlationId"
         FROM payments
        WHERE tenant_id=$1
          AND (
            ($2::uuid IS NOT NULL AND id=$2)
            OR ($3::text IS NOT NULL AND provider=$3 AND provider_reference=$4)
            OR ($5::uuid IS NOT NULL AND purchase_id=$5 AND provider=$3)
          )
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE`,
      [tenantId, input.paymentId ?? null, input.provider.trim().toLowerCase(), input.providerReference?.trim() ?? null, input.purchaseId ?? null],
    );
    if (!paymentResult.rowCount) throw new NotFoundException('Payment not found for verified provider event');

    const payment = paymentResult.rows[0];
    if (payment.provider !== input.provider.trim().toLowerCase()) {
      throw new ConflictException('Provider response does not match payment provider');
    }

    const payloadAmount = input.amount ?? (typeof input.payload?.amount === 'number' ? input.payload.amount : typeof input.payload?.amount === 'string' ? Number(input.payload.amount) : undefined);
    const payloadCurrency = (input.currency ?? (typeof input.payload?.currency === 'string' ? input.payload.currency : undefined))?.trim().toUpperCase();
    if (payloadAmount !== undefined && (!Number.isFinite(payloadAmount) || String(payloadAmount) !== String(payment.amount))) {
      throw new ConflictException('Provider response amount does not match server-side payment amount');
    }
    if (payloadCurrency && payloadCurrency !== payment.currency) {
      throw new ConflictException('Provider response currency does not match server-side payment currency');
    }

    const correlationId = payment.correlationId ?? getCorrelationId() ?? `payment:${payment.id}`;

    if (targetStatus === 'REFUNDED') {
      if (!['PAID','REVERSED'].includes(payment.status)) {
        throw new ConflictException(`Payment cannot be refunded from ${payment.status}`);
      }
      const refundAmount = payloadAmount ?? Number(payment.amount);
      const prior = await client.query<{ total: string }>(
        `SELECT COALESCE(SUM(amount),0) AS total
           FROM refunds
          WHERE tenant_id=$1 AND payment_id=$2 AND status IN ('REQUESTED','APPROVED','PROCESSING','SUCCEEDED')`,
        [tenantId, payment.id],
      );
      const remaining = Number(payment.amount) - Number(prior.rows[0]?.total ?? 0);
      if (refundAmount <= 0 || refundAmount > remaining) throw new ConflictException('Provider refund exceeds the remaining refundable payment amount');

      const refundKey = `webhook:${input.provider.trim().toLowerCase()}:${input.providerEventId.trim()}`;
      const refund = await client.query<{ id: string }>(
        `INSERT INTO refunds(tenant_id,payment_id,amount,currency,reason,status,provider_reference,idempotency_key,processed_at)
         VALUES($1,$2,$3,$4,'Provider webhook refund','SUCCEEDED',$5,$6,now())
         ON CONFLICT (tenant_id,idempotency_key) DO UPDATE SET updated_at=now()
         RETURNING id`,
        [tenantId, payment.id, refundAmount, payment.currency, input.providerReference?.trim() ?? null, refundKey],
      );
      if (refund.rowCount) {
        const cashCode = `CASH:${payment.provider}:${payment.currency}`.slice(0,64);
        const revenueCode = `REVENUE:WIFI:${payment.currency}`.slice(0,64);
        const cash = await client.query<{id:string}>(`SELECT id FROM financial_ledger_accounts WHERE tenant_id=$1 AND code=$2`,[tenantId,cashCode]);
        const revenue = await client.query<{id:string}>(`SELECT id FROM financial_ledger_accounts WHERE tenant_id=$1 AND code=$2`,[tenantId,revenueCode]);
        if (cash.rowCount && revenue.rowCount) {
          const tx = await client.query<{id:string}>(
            `INSERT INTO financial_ledger_transactions(tenant_id,transaction_type,reference_type,reference_id,correlation_id,description)
             VALUES($1,'REFUND','REFUND',$2,$3,'Provider refund')
             ON CONFLICT (tenant_id,transaction_type,reference_type,reference_id) WHERE reference_id IS NOT NULL DO NOTHING
             RETURNING id`,
            [tenantId, refund.rows[0].id, correlationId],
          );
          let txId = tx.rows[0]?.id;
          if (!txId) {
            const existingTx = await client.query<{id:string}>(`SELECT id FROM financial_ledger_transactions WHERE tenant_id=$1 AND transaction_type='REFUND' AND reference_type='REFUND' AND reference_id=$2`,[tenantId,refund.rows[0].id]);
            txId = existingTx.rows[0]?.id;
          }
          if (txId) {
            await client.query(
              `INSERT INTO financial_ledger_entries(tenant_id,transaction_id,account_id,currency,debit,credit)
               VALUES($1,$2,$3,$4,$5,0),($1,$2,$6,$4,0,$5)
               ON CONFLICT DO NOTHING`,
              [tenantId,txId,revenue.rows[0].id,payment.currency,refundAmount,cash.rows[0].id],
            );
          }
        }
      }
      if (Number(refundAmount) === Number(payment.amount)) {
        await client.query(`UPDATE payments SET status='REFUNDED',provider_event_id=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2`,[tenantId,payment.id,input.providerEventId.trim()]);
      }
    } else {
      if (targetStatus === 'PAID' && !['INITIATED','PENDING','AUTHORIZED','PAID'].includes(payment.status)) {
        throw new ConflictException(`Payment cannot be paid from ${payment.status}`);
      }
      if (targetStatus === 'FAILED' && !['INITIATED','PENDING','AUTHORIZED','FAILED'].includes(payment.status)) {
        throw new ConflictException(`Payment cannot fail from ${payment.status}`);
      }
      await client.query(
        `UPDATE payments
            SET status=$3,provider_reference=COALESCE($4,provider_reference),provider_event_id=$5,
                verification_status='VERIFIED',verified_at=COALESCE(verified_at,now()),
                verification_source='SIGNED_PROVIDER_WEBHOOK',raw_payload=$6,correlation_id=COALESCE(correlation_id,$7),updated_at=now()
          WHERE tenant_id=$1 AND id=$2`,
        [tenantId,payment.id,targetStatus,input.providerReference?.trim() ?? null,input.providerEventId.trim(),JSON.stringify(input.payload ?? {}),correlationId],
      );
    }

    await client.query(
      `UPDATE payment_events
          SET payment_id=$2,processing_status='PROCESSED',processed_at=now(),
              verification_status='VERIFIED',verified_at=now(),verification_source='SIGNED_PROVIDER_WEBHOOK'
        WHERE tenant_id=$1 AND id=$3`,
      [tenantId,payment.id,eventId],
    );

    return { paymentId: payment.id, status: targetStatus, correlationId };
  }

  async webhook(tenantId: string, input: PaymentWebhookDto, rawBody: Buffer, signature?: string) {
    const provider = input.provider.trim().toLowerCase();
    const providerEventId = input.providerEventId.trim();
    let correlationId = getCorrelationId() ?? null;
    const secret = await this.resolveWebhookSecret(tenantId, provider);
    this.verifyWebhookSignature(secret, rawBody, signature);

    const eventClient = await this.db.connect();
    try {
      await eventClient.query('BEGIN');

      const inserted = await eventClient.query(
        `INSERT INTO payment_events
           (tenant_id, payment_id, provider, provider_event_id, event_type, payload, signature_valid, processing_status, correlation_id)
         VALUES ($1,$2,$3,$4,$5,$6,true,'RECEIVED',$7)
         ON CONFLICT (tenant_id, provider, provider_event_id)
         WHERE provider_event_id IS NOT NULL
         DO NOTHING
         RETURNING id`,
        [tenantId, input.paymentId ?? null, provider, providerEventId, input.eventType.trim(), input.payload ?? {}, correlationId],
      );

      if (!inserted.rowCount) {
        const existing = await eventClient.query(
          `SELECT id,event_type AS "eventType",processing_status AS "processingStatus",payment_id AS "paymentId"
             FROM payment_events
            WHERE tenant_id=$1 AND provider=$2 AND provider_event_id=$3
            FOR UPDATE`,
          [tenantId, provider, providerEventId],
        );
        if (!existing.rowCount) throw new ConflictException('Payment event could not be resolved after conflict');
        if (existing.rows[0].eventType !== input.eventType.trim()) {
          throw new ConflictException('Payment event identifier is already bound to a different event type');
        }
        await eventClient.query('COMMIT');
        return { accepted:true, duplicate:true, paymentId:existing.rows[0].paymentId, processingStatus:existing.rows[0].processingStatus, requiresVerification:existing.rows[0].processingStatus !== 'PROCESSED' };
      }

      const eventId = inserted.rows[0].id as string;
      const processed = await this.applyVerifiedWebhook(eventClient, tenantId, input, eventId);
      await eventClient.query('COMMIT');

      await this.audit?.record(tenantId, `PAYMENT_${input.status}`, 'payment', processed.paymentId, {
        provider, providerEventId, eventType: input.eventType.trim(), status: processed.status,
        amount: input.amount ?? input.payload?.amount ?? null, currency: input.currency ?? input.payload?.currency ?? null,
      }, { correlationId: processed.correlationId }).catch(() => undefined);

      await this.domainEvents?.enqueue({
        tenantId,
        eventKey: `payment-webhook:${provider}:${providerEventId}`,
        eventType: 'PAYMENT.WEBHOOK_PROCESSED',
        aggregateType: 'payment',
        aggregateId: processed.paymentId,
        payload: { provider, providerEventId, status: processed.status, targetRoles:['OWNER','ADMIN','SUPER_ADMIN','BILLING_ADMIN'] },
      });

      return { accepted:true, duplicate:false, eventId, processingStatus:'PROCESSED', requiresVerification:false, paymentId:processed.paymentId, status:processed.status };
    } catch (error: unknown) {
      await eventClient.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      eventClient.release();
    }
  }

}
