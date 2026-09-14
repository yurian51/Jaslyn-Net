import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { CreateWifiPurchaseDto, InitiatePaymentDto } from './billing.dto';

type DatabaseError = { code?: string };

@Injectable()
export class BillingService {
  constructor(@Inject(PG_POOL) private readonly db: Pool) {}

  async listPurchases(tenantId: string, customerId?: string) {
    const result = await this.db.query(
      `SELECT
         p.id, p.customer_id, p.package_id, p.router_id, p.status,
         p.price, p.currency, p.starts_at, p.ends_at, p.created_at,
         c.full_name AS customer_name, pkg.name AS package_name
       FROM wifi_plan_purchases p
       JOIN customers c ON c.id = p.customer_id AND c.tenant_id = p.tenant_id
       JOIN packages pkg ON pkg.id = p.package_id AND pkg.tenant_id = p.tenant_id
       WHERE p.tenant_id = $1
         AND ($2::uuid IS NULL OR p.customer_id = $2::uuid)
       ORDER BY p.created_at DESC LIMIT 100`,
      [tenantId, customerId ?? null],
    );
    return result.rows;
  }

  async createPurchase(tenantId: string, dto: CreateWifiPurchaseDto) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const customer = await client.query(
        'SELECT id FROM customers WHERE tenant_id = $1 AND id = $2',
        [tenantId, dto.customerId],
      );
      const pkg = await client.query(
        'SELECT id, price, currency FROM packages WHERE tenant_id = $1 AND id = $2 AND is_active = TRUE',
        [tenantId, dto.packageId],
      );
      if (!customer.rowCount) throw new NotFoundException('Customer not found');
      if (!pkg.rowCount) throw new NotFoundException('Active WiFi plan not found');
      if (dto.routerId) {
        const router = await client.query(
          'SELECT id FROM routers WHERE tenant_id = $1 AND id = $2',
          [tenantId, dto.routerId],
        );
        if (!router.rowCount) throw new NotFoundException('Router not found');
      }
      const row = pkg.rows[0];
      const result = await client.query(
        `INSERT INTO wifi_plan_purchases
          (tenant_id, customer_id, package_id, router_id, price, currency, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'PENDING_PAYMENT')
         RETURNING id, customer_id, package_id, router_id, status, price, currency, starts_at, ends_at, created_at`,
        [tenantId, dto.customerId, dto.packageId, dto.routerId ?? null, row.price, row.currency],
      );
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error: unknown) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async initiatePayment(tenantId: string, dto: InitiatePaymentDto) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const purchase = await client.query(
        `SELECT id, customer_id, price, currency, status
         FROM wifi_plan_purchases
         WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [tenantId, dto.purchaseId],
      );
      if (!purchase.rowCount) throw new NotFoundException('WiFi purchase not found');
      if (purchase.rows[0].status !== 'PENDING_PAYMENT') {
        throw new ConflictException('Purchase is not awaiting payment');
      }

      const existing = await client.query(
        `SELECT id, purchase_id, provider, provider_reference, status, amount,
                currency, idempotency_key, created_at
         FROM payments WHERE tenant_id = $1 AND idempotency_key = $2`,
        [tenantId, dto.idempotencyKey],
      );
      if (existing.rowCount) {
        const payment = existing.rows[0];
        if (payment.purchase_id !== dto.purchaseId) {
          throw new ConflictException('Idempotency key is already used for another purchase');
        }
        await client.query('COMMIT');
        return payment;
      }

      try {
        const payment = await client.query(
          `INSERT INTO payments
            (tenant_id, customer_id, purchase_id, provider, amount, currency, status, idempotency_key)
           VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7)
           RETURNING id, purchase_id, provider, amount, currency, status, idempotency_key, created_at`,
          [tenantId, purchase.rows[0].customer_id, dto.purchaseId, dto.provider,
           purchase.rows[0].price, purchase.rows[0].currency, dto.idempotencyKey],
        );
        await client.query('COMMIT');
        return payment.rows[0];
      } catch (error: unknown) {
        if ((error as DatabaseError)?.code !== '23505') throw error;
        const concurrent = await client.query(
          `SELECT id, purchase_id, provider, provider_reference, status, amount,
                  currency, idempotency_key, created_at
           FROM payments WHERE tenant_id = $1 AND idempotency_key = $2`,
          [tenantId, dto.idempotencyKey],
        );
        if (concurrent.rowCount) {
          const payment = concurrent.rows[0];
          if (payment.purchase_id !== dto.purchaseId) {
            throw new ConflictException('Idempotency key is already used for another purchase');
          }
          await client.query('COMMIT');
          return payment;
        }
        const pending = await client.query(
          `SELECT id FROM payments
           WHERE tenant_id = $1 AND purchase_id = $2 AND status = 'PENDING' LIMIT 1`,
          [tenantId, dto.purchaseId],
        );
        if (pending.rowCount) {
          throw new ConflictException('A payment is already pending for this purchase');
        }
        throw error;
      }
    } catch (error: unknown) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
