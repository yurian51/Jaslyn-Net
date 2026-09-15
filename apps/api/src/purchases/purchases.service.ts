import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { PaymentsService } from '../payments/payments.service';
import { ConfirmPurchasePaymentDto, CreatePurchaseDto } from './purchases.dto';

@Injectable()
export class PurchasesService {
  constructor(
    @Inject(PG_POOL) private readonly db: Pool,
    private readonly payments: PaymentsService,
  ) {}

  async list(tenantId: string, customerId?: string) {
    const result = await this.db.query(
      `SELECT p.id, p.customer_id AS "customerId", c.full_name AS "customerName", p.package_id AS "packageId", k.name AS "packageName", p.router_id AS "routerId", p.price, p.currency, p.status, p.starts_at AS "startsAt", p.ends_at AS "endsAt", p.created_at AS "createdAt", p.updated_at AS "updatedAt"
       FROM wifi_plan_purchases p
       JOIN customers c ON c.tenant_id = p.tenant_id AND c.id = p.customer_id
       JOIN packages k ON k.tenant_id = p.tenant_id AND k.id = p.package_id
       WHERE p.tenant_id = $1 AND ($2::uuid IS NULL OR p.customer_id = $2)
       ORDER BY p.created_at DESC
       LIMIT 200`,
      [tenantId, customerId ?? null],
    );
    return { data: result.rows };
  }

  async get(tenantId: string, id: string) {
    const result = await this.db.query(
      `SELECT p.id, p.customer_id AS "customerId", c.full_name AS "customerName", p.package_id AS "packageId", k.name AS "packageName", p.router_id AS "routerId", p.price, p.currency, p.status, p.starts_at AS "startsAt", p.ends_at AS "endsAt", p.created_at AS "createdAt", p.updated_at AS "updatedAt"
       FROM wifi_plan_purchases p
       JOIN customers c ON c.tenant_id = p.tenant_id AND c.id = p.customer_id
       JOIN packages k ON k.tenant_id = p.tenant_id AND k.id = p.package_id
       WHERE p.tenant_id = $1 AND p.id = $2`,
      [tenantId, id],
    );
    if (!result.rowCount) throw new NotFoundException('Purchase not found');
    return result.rows[0];
  }

  async create(tenantId: string, input: CreatePurchaseDto) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const packageResult = await client.query(
        `SELECT id, price, currency, duration_seconds FROM packages WHERE tenant_id = $1 AND id = $2 AND is_active = true FOR UPDATE`,
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
        `INSERT INTO wifi_plan_purchases (tenant_id, customer_id, package_id, router_id, price, currency, status) VALUES ($1,$2,$3,$4,$5,$6,'PENDING_PAYMENT') RETURNING id, customer_id AS "customerId", package_id AS "packageId", router_id AS "routerId", price, currency, status, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [tenantId, input.customerId, input.packageId, input.routerId ?? null, plan.price, plan.currency],
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
    try {
      await client.query('BEGIN');
      const purchase = await client.query(
        `SELECT id, customer_id, package_id, router_id, price, currency, status FROM wifi_plan_purchases WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [tenantId, purchaseId],
      );
      if (!purchase.rowCount) throw new NotFoundException('Purchase not found');
      const current = purchase.rows[0];
      if (current.status === 'ACTIVE' || current.status === 'PAID') {
        await client.query('COMMIT');
        return this.get(tenantId, purchaseId);
      }
      if (current.status !== 'PENDING_PAYMENT') throw new BadRequestException(`Purchase cannot be paid from ${current.status}`);

      await this.payments.assertMethodCanSettle(tenantId, input.provider, current.currency, client);

      const key = input.idempotencyKey?.trim() || `purchase:${purchaseId}:${input.providerReference.trim()}`;
      const existing = await client.query(`SELECT id, status FROM payments WHERE tenant_id = $1 AND idempotency_key = $2`, [tenantId, key]);
      if (existing.rowCount) {
        await client.query('COMMIT');
        return this.get(tenantId, purchaseId);
      }

      const payment = await client.query(
        `INSERT INTO payments (tenant_id, customer_id, purchase_id, provider, provider_reference, amount, currency, status, idempotency_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [tenantId, current.customer_id, current.id, input.provider.trim().toLowerCase(), input.providerReference.trim(), current.price, current.currency, input.status === 'FAILED' ? 'FAILED' : 'SUCCESS', key],
      );
      if (input.status === 'FAILED') {
        await client.query(`UPDATE wifi_plan_purchases SET status='CANCELED', updated_at=now() WHERE tenant_id=$1 AND id=$2`, [tenantId, purchaseId]);
      } else {
        const packageResult = await client.query(`SELECT duration_seconds FROM packages WHERE tenant_id=$1 AND id=$2`, [tenantId, current.package_id]);
        if (!packageResult.rowCount) throw new NotFoundException('Package not found');
        await client.query(`UPDATE wifi_plan_purchases SET status='PAID', starts_at=now(), ends_at=now() + ($3::bigint * interval '1 second'), updated_at=now() WHERE tenant_id=$1 AND id=$2`, [tenantId, purchaseId, packageResult.rows[0].duration_seconds]);
        await client.query(`INSERT INTO access_grants (tenant_id, purchase_id, customer_id, router_id, status, starts_at, ends_at) SELECT tenant_id, id, customer_id, router_id, 'ACTIVE', starts_at, ends_at FROM wifi_plan_purchases WHERE tenant_id=$1 AND id=$2 ON CONFLICT (purchase_id) DO UPDATE SET status='ACTIVE', starts_at=EXCLUDED.starts_at, ends_at=EXCLUDED.ends_at, updated_at=now()`, [tenantId, purchaseId]);
      }
      await client.query('COMMIT');
      return { purchase: await this.get(tenantId, purchaseId), paymentId: payment.rows[0].id };
    } catch (error: any) {
      await client.query('ROLLBACK');
      if (error?.code === '23505') throw new ConflictException('Payment reference or idempotency key already exists');
      throw error;
    } finally {
      client.release();
    }
  }
}
