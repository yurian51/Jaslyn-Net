import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { PaymentsService } from '../payments/payments.service';
import { compileNetworkPolicy } from '../modules/traffic/network-policy.compiler';
import { ConfirmPurchasePaymentDto, CreatePurchaseDto } from './purchases.dto';
import { getCorrelationId } from '../common/correlation-context';

@Injectable()
export class PurchasesService {
  constructor(
    @Inject(PG_POOL) private readonly db: Pool,
    private readonly payments: PaymentsService,
  ) {}

  async list(tenantId: string, customerId?: string) {
    const result = await this.db.query(
      `SELECT p.id, p.customer_id AS "customerId", c.full_name AS "customerName", p.package_id AS "packageId", k.name AS "packageName", p.router_id AS "routerId", p.price, p.currency, p.status, p.correlation_id AS "correlationId", pay.provider, ag.status AS "accessStatus", p.starts_at AS "startsAt", p.ends_at AS "endsAt", ag.network_policy AS "networkPolicy", p.created_at AS "createdAt", p.updated_at AS "updatedAt"
       FROM wifi_plan_purchases p
       JOIN customers c ON c.tenant_id = p.tenant_id AND c.id = p.customer_id
       JOIN packages k ON k.tenant_id = p.tenant_id AND k.id = p.package_id
       LEFT JOIN access_grants ag ON ag.tenant_id = p.tenant_id AND ag.purchase_id = p.id
       LEFT JOIN LATERAL (
         SELECT provider FROM payments
         WHERE tenant_id = p.tenant_id AND purchase_id = p.id
         ORDER BY created_at DESC
         LIMIT 1
       ) pay ON true
       WHERE p.tenant_id = $1 AND ($2::uuid IS NULL OR p.customer_id = $2)
       ORDER BY p.created_at DESC
       LIMIT 200`,
      [tenantId, customerId ?? null],
    );
    return { data: result.rows };
  }

  async get(tenantId: string, id: string) {
    const result = await this.db.query(
      `SELECT p.id, p.customer_id AS "customerId", c.full_name AS "customerName", p.package_id AS "packageId", k.name AS "packageName", p.router_id AS "routerId", p.price, p.currency, p.status, pay.provider, ag.status AS "accessStatus", p.starts_at AS "startsAt", p.ends_at AS "endsAt", ag.network_policy AS "networkPolicy", p.created_at AS "createdAt", p.updated_at AS "updatedAt"
       FROM wifi_plan_purchases p
       JOIN customers c ON c.tenant_id = p.tenant_id AND c.id = p.customer_id
       JOIN packages k ON k.tenant_id = p.tenant_id AND k.id = p.package_id
       LEFT JOIN access_grants ag ON ag.tenant_id = p.tenant_id AND ag.purchase_id = p.id
       LEFT JOIN LATERAL (
         SELECT provider FROM payments
         WHERE tenant_id = p.tenant_id AND purchase_id = p.id
         ORDER BY created_at DESC
         LIMIT 1
       ) pay ON true
       WHERE p.tenant_id = $1 AND p.id = $2`,
      [tenantId, id],
    );
    if (!result.rowCount) throw new NotFoundException('Purchase not found');
    return result.rows[0];
  }

  async create(tenantId: string, input: CreatePurchaseDto) {
    const client = await this.db.connect();
    const correlationId = getCorrelationId() ?? `purchase:${input.customerId}:${input.packageId}`;
    try {
      await client.query('BEGIN');
      const packageResult = await client.query(
        `SELECT id, name, price, currency, duration_seconds, data_limit_bytes, download_bps, upload_bps FROM packages WHERE tenant_id = $1 AND id = $2 AND is_active = true FOR UPDATE`,
        [tenantId, input.packageId],
      );
      if (!packageResult.rowCount) throw new NotFoundException('Active WiFi plan not found');
      const customerResult = await client.query(
        `SELECT id FROM customers WHERE tenant_id = $1 AND id = $2 AND is_active = true FOR UPDATE`,
        [tenantId, input.customerId],
      );
      if (!customerResult.rowCount) throw new NotFoundException('Active customer not found');
      if (input.routerId) {
        const routerResult = await client.query(`SELECT id FROM routers WHERE tenant_id = $1 AND id = $2`, [tenantId, input.routerId]);
        if (!routerResult.rowCount) throw new NotFoundException('Router not found');
      }
      const plan = packageResult.rows[0];
      const result = await client.query(
        `INSERT INTO wifi_plan_purchases (tenant_id, customer_id, package_id, router_id, price, currency, status, correlation_id) VALUES ($1,$2,$3,$4,$5,$6,'PENDING_PAYMENT',$7) RETURNING id, customer_id AS "customerId", package_id AS "packageId", router_id AS "routerId", price, currency, status, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [tenantId, input.customerId, input.packageId, input.routerId ?? null, plan.price, plan.currency, correlationId],
      );
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async confirmPayment(tenantId: string, purchaseId: string, input: ConfirmPurchasePaymentDto) {
    const client = await this.db.connect();
    const provider = input.provider.trim().toLowerCase();
    const providerReference = input.providerReference.trim();
    const requestedStatus = input.status === 'FAILED' ? 'FAILED' : 'SUCCESS';
    let correlationId = getCorrelationId() ?? null;
    try {
      await client.query('BEGIN');
      const purchase = await client.query(
        `SELECT id, customer_id, package_id, router_id, price, currency, status, correlation_id FROM wifi_plan_purchases WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [tenantId, purchaseId],
      );
      if (!purchase.rowCount) throw new NotFoundException('Purchase not found');
      const current = purchase.rows[0];
      correlationId ??= current.correlation_id ?? `purchase:${purchaseId}`;
      if (current.status === 'ACTIVE' || current.status === 'PAID') {
        await client.query('COMMIT');
        return this.get(tenantId, purchaseId);
      }
      if (current.status !== 'PENDING_PAYMENT') throw new BadRequestException(`Purchase cannot be paid from ${current.status}`);

      await this.payments.assertMethodCanSettle(tenantId, provider, current.currency, client);
      // Direct operator confirmation is intentionally limited to the manual settlement boundary.
      // External providers must transition through their authenticated webhook/verification path.
      if (provider !== 'manual') {
        throw new ConflictException('External payment providers must be verified through their provider webhook');
      }

      const key = input.idempotencyKey?.trim() || `purchase:${purchaseId}:${providerReference}`;
      const existingByKey = await client.query(
        `SELECT id, customer_id AS "customerId", purchase_id AS "purchaseId", provider, provider_reference AS "providerReference", amount, currency, status
         FROM payments WHERE tenant_id = $1 AND idempotency_key = $2 FOR UPDATE`,
        [tenantId, key],
      );
      if (existingByKey.rowCount) {
        const existing = existingByKey.rows[0];
        if (existing.purchaseId !== purchaseId) throw new ConflictException('Idempotency key is already bound to another purchase');
        if (existing.provider !== provider) throw new ConflictException('Idempotency key is already bound to another provider');
        if (existing.status === 'SUCCESS') {
          await client.query('COMMIT');
          return this.get(tenantId, purchaseId);
        }
        if (existing.status !== 'PENDING') throw new ConflictException(`Payment cannot be confirmed from ${existing.status}`);

        if (requestedStatus === 'FAILED') {
          await client.query(
            `UPDATE payments SET provider_reference=$2, status='FAILED', correlation_id=COALESCE(correlation_id,$4), updated_at=now() WHERE tenant_id=$1 AND id=$3`,
            [tenantId, providerReference, existing.id, correlationId],
          );
          await client.query(`UPDATE wifi_plan_purchases SET status='CANCELED', updated_at=now() WHERE tenant_id=$1 AND id=$2`, [tenantId, purchaseId]);
          await client.query('COMMIT');
          return { purchase: await this.get(tenantId, purchaseId), paymentId: existing.id };
        }

        await client.query(
          `UPDATE payments SET provider_reference=$2, status='SUCCESS', correlation_id=COALESCE(correlation_id,$4), updated_at=now() WHERE tenant_id=$1 AND id=$3`,
          [tenantId, providerReference, existing.id, correlationId],
        );
        await this.payments.recordVerifiedSettlement(client, tenantId, existing.id, current.price, current.currency, provider);
        const packageResult = await client.query(
          `SELECT id, name, duration_seconds, data_limit_bytes, download_bps, upload_bps FROM packages WHERE tenant_id=$1 AND id=$2 FOR SHARE`,
          [tenantId, current.package_id],
        );
        if (!packageResult.rowCount) throw new NotFoundException('Package not found');
        const plan = packageResult.rows[0];
        const networkPolicy = compileNetworkPolicy({
          packageId: plan.id,
          name: plan.name,
          durationSeconds: plan.duration_seconds,
          dataLimitBytes: plan.data_limit_bytes,
          downloadBps: plan.download_bps,
          uploadBps: plan.upload_bps,
        });
        await client.query(`UPDATE wifi_plan_purchases SET status='PAID', starts_at=now(), ends_at=now() + ($3::bigint * interval '1 second'), updated_at=now() WHERE tenant_id=$1 AND id=$2`, [tenantId, purchaseId, plan.duration_seconds]);
        await client.query(`INSERT INTO access_grants (tenant_id, purchase_id, customer_id, router_id, status, starts_at, ends_at, network_policy, correlation_id) SELECT tenant_id, id, customer_id, router_id, 'ACTIVE', starts_at, ends_at, $3::jsonb, correlation_id FROM wifi_plan_purchases WHERE tenant_id=$1 AND id=$2 ON CONFLICT (purchase_id) DO UPDATE SET status='ACTIVE', starts_at=EXCLUDED.starts_at, ends_at=EXCLUDED.ends_at, network_policy=EXCLUDED.network_policy, updated_at=now()`, [tenantId, purchaseId, JSON.stringify(networkPolicy)]);
        await client.query('COMMIT');
        return { purchase: await this.get(tenantId, purchaseId), paymentId: existing.id };
      }

      const pending = await client.query(
        `SELECT id, provider, status FROM payments WHERE tenant_id=$1 AND purchase_id=$2 AND status='PENDING' ORDER BY created_at ASC LIMIT 1 FOR UPDATE`,
        [tenantId, purchaseId],
      );
      if (pending.rowCount && pending.rows[0].provider !== provider) {
        throw new ConflictException(`A pending payment already exists for provider ${pending.rows[0].provider}`);
      }

      let paymentId: string;
      if (pending.rowCount) {
        paymentId = pending.rows[0].id;
        if (requestedStatus === 'FAILED') {
          await client.query(`UPDATE payments SET provider_reference=$2, status='FAILED', idempotency_key=$3, correlation_id=COALESCE(correlation_id,$5), updated_at=now() WHERE tenant_id=$1 AND id=$4`, [tenantId, providerReference, key, paymentId, correlationId]);
          await client.query(`UPDATE wifi_plan_purchases SET status='CANCELED', updated_at=now() WHERE tenant_id=$1 AND id=$2`, [tenantId, purchaseId]);
          await client.query('COMMIT');
          return { purchase: await this.get(tenantId, purchaseId), paymentId };
        }
        await client.query(`UPDATE payments SET provider_reference=$2, status='SUCCESS', idempotency_key=$3, correlation_id=COALESCE(correlation_id,$5), updated_at=now() WHERE tenant_id=$1 AND id=$4`, [tenantId, providerReference, key, paymentId, correlationId]);
        await this.payments.recordVerifiedSettlement(client, tenantId, paymentId, current.price, current.currency, provider);
      } else {
        const payment = await client.query(
          `INSERT INTO payments (tenant_id, customer_id, purchase_id, provider, provider_reference, amount, currency, status, idempotency_key, correlation_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
          [tenantId, current.customer_id, current.id, provider, providerReference, current.price, current.currency, requestedStatus, key, correlationId],
        );
        paymentId = payment.rows[0].id;
        if (requestedStatus === 'FAILED') {
          await client.query(`UPDATE wifi_plan_purchases SET status='CANCELED', updated_at=now() WHERE tenant_id=$1 AND id=$2`, [tenantId, purchaseId]);
          await client.query('COMMIT');
          return { purchase: await this.get(tenantId, purchaseId), paymentId };
        }
      }

      const packageResult = await client.query(`SELECT id, name, duration_seconds, data_limit_bytes, download_bps, upload_bps FROM packages WHERE tenant_id=$1 AND id=$2 FOR SHARE`, [tenantId, current.package_id]);
      if (!packageResult.rowCount) throw new NotFoundException('Package not found');
      const plan = packageResult.rows[0];
      const networkPolicy = compileNetworkPolicy({
        packageId: plan.id,
        name: plan.name,
        durationSeconds: plan.duration_seconds,
        dataLimitBytes: plan.data_limit_bytes,
        downloadBps: plan.download_bps,
        uploadBps: plan.upload_bps,
      });
      await client.query(`UPDATE wifi_plan_purchases SET status='PAID', starts_at=now(), ends_at=now() + ($3::bigint * interval '1 second'), updated_at=now() WHERE tenant_id=$1 AND id=$2`, [tenantId, purchaseId, plan.duration_seconds]);
      await client.query(`INSERT INTO access_grants (tenant_id, purchase_id, customer_id, router_id, status, starts_at, ends_at, network_policy, correlation_id) SELECT tenant_id, id, customer_id, router_id, 'ACTIVE', starts_at, ends_at, $3::jsonb, correlation_id FROM wifi_plan_purchases WHERE tenant_id=$1 AND id=$2 ON CONFLICT (purchase_id) DO UPDATE SET status='ACTIVE', starts_at=EXCLUDED.starts_at, ends_at=EXCLUDED.ends_at, network_policy=EXCLUDED.network_policy, updated_at=now()`, [tenantId, purchaseId, JSON.stringify(networkPolicy)]);
      await client.query('COMMIT');
      return { purchase: await this.get(tenantId, purchaseId), paymentId };
    } catch (error: any) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (error?.code === '23505') throw new ConflictException('Payment reference or idempotency key already exists');
      throw error;
    } finally {
      client.release();
    }
  }
}
