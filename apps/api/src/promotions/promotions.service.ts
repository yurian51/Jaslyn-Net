import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { CreatePromoCodeDto } from './promotions.dto';

@Injectable()
export class PromotionsService {
  constructor(@Inject(PG_POOL) private readonly db: Pool) {}

  async list(tenantId: string) {
    const result = await this.db.query(
      `SELECT id, code, type, value, status, expires_at AS "expiresAt",
              usage_limit_total AS "usageLimitTotal", usage_limit_per_customer AS "usageLimitPerCustomer",
              times_redeemed AS "timesRedeemed", min_amount AS "minAmount", max_discount AS "maxDiscount",
              eligible_package_ids AS "eligiblePackageIds", first_payment_only AS "firstPaymentOnly",
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM promo_codes WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 500`,
      [tenantId],
    );
    return { data: result.rows };
  }

  async create(tenantId: string, input: CreatePromoCodeDto) {
    const code = input.code.trim().toUpperCase();
    if (input.type === 'PERCENTAGE' && input.value > 100) throw new BadRequestException('Percentage promo value cannot exceed 100');
    if (input.expiresAt && Number.isNaN(new Date(input.expiresAt).getTime())) throw new BadRequestException('Invalid expiresAt');

    try {
      const result = await this.db.query(
        `INSERT INTO promo_codes
          (tenant_id, code, type, value, expires_at, usage_limit_total, usage_limit_per_customer,
           min_amount, max_discount, eligible_package_ids, first_payment_only)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
         RETURNING id, code, type, value, status, expires_at AS "expiresAt",
                   usage_limit_total AS "usageLimitTotal", usage_limit_per_customer AS "usageLimitPerCustomer",
                   times_redeemed AS "timesRedeemed", min_amount AS "minAmount", max_discount AS "maxDiscount",
                   eligible_package_ids AS "eligiblePackageIds", first_payment_only AS "firstPaymentOnly"`,
        [
          tenantId, code, input.type, input.value, input.expiresAt ?? null,
          input.usageLimitTotal ?? null, input.usageLimitPerCustomer ?? null,
          input.minAmount ?? null, input.maxDiscount ?? null,
          JSON.stringify(input.eligiblePackageIds ?? null), input.firstPaymentOnly ?? false,
        ],
      );
      return result.rows[0];
    } catch (error: any) {
      if (error?.code === '23505') throw new ConflictException('Promo code already exists');
      throw error;
    }
  }

  async validate(tenantId: string, input: { code: string; customerId: string; packageId: string; subtotal: number }, client?: PoolClient) {
    const db = client ?? this.db;
    const promoResult = await db.query(
      `SELECT * FROM promo_codes WHERE tenant_id=$1 AND code=$2 FOR SHARE`,
      [tenantId, input.code.trim().toUpperCase()],
    );
    if (!promoResult.rowCount) throw new NotFoundException('Promo code does not exist');
    const promo = promoResult.rows[0];
    const now = Date.now();

    if (promo.status === 'DISABLED') throw new ConflictException('Promo code is disabled');
    if (promo.status === 'EXPIRED' || (promo.expires_at && new Date(promo.expires_at).getTime() < now)) {
      throw new ConflictException('Promo code has expired');
    }
    if (promo.usage_limit_total !== null && promo.times_redeemed >= promo.usage_limit_total) {
      throw new ConflictException('Promo code has reached its usage limit');
    }

    const eligible = promo.eligible_package_ids as string[] | null;
    if (eligible && !eligible.includes(input.packageId)) throw new ConflictException('Promo code is not valid for this package');
    if (promo.min_amount !== null && Number(input.subtotal) < Number(promo.min_amount)) {
      throw new ConflictException(`Promo code requires a minimum order of ${promo.min_amount}`);
    }

    if (promo.first_payment_only) {
      const prior = await db.query(
        `SELECT 1 FROM payments WHERE tenant_id=$1 AND customer_id=$2 AND status='SUCCESS' LIMIT 1`,
        [tenantId, input.customerId],
      );
      if (prior.rowCount) throw new ConflictException('Promo code is only valid on a customer first payment');
    }

    if (promo.usage_limit_per_customer !== null) {
      const used = await db.query(
        `SELECT COUNT(*)::int AS count FROM promo_redemptions WHERE tenant_id=$1 AND promo_code_id=$2 AND customer_id=$3`,
        [tenantId, promo.id, input.customerId],
      );
      if (Number(used.rows[0].count) >= Number(promo.usage_limit_per_customer)) {
        throw new ConflictException('Promo code customer usage limit reached');
      }
    }

    let discount = promo.type === 'PERCENTAGE'
      ? Number(input.subtotal) * Number(promo.value) / 100
      : Number(promo.value);
    if (promo.max_discount !== null) discount = Math.min(discount, Number(promo.max_discount));
    discount = Math.min(discount, Number(input.subtotal));
    discount = Math.round(discount * 100) / 100;

    return {
      promoId: promo.id,
      code: promo.code,
      type: promo.type,
      value: Number(promo.value),
      subtotal: Number(input.subtotal),
      discountAmount: discount,
      payableAmount: Math.max(0, Number(input.subtotal) - discount),
    };
  }

  async recordRedemption(client: PoolClient, params: { tenantId: string; promoCodeId: string; customerId: string; purchaseId: string; discountAmount: number; correlationId?: string }) {
    const inserted = await client.query(
      `INSERT INTO promo_redemptions
        (tenant_id, promo_code_id, customer_id, purchase_id, discount_amount, correlation_id)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (tenant_id, promo_code_id, purchase_id) DO NOTHING
       RETURNING id`,
      [params.tenantId, params.promoCodeId, params.customerId, params.purchaseId, params.discountAmount, params.correlationId ?? null],
    );
    if (!inserted.rowCount) return false;

    await client.query(
      `UPDATE promo_codes
       SET times_redeemed=times_redeemed+1,
           status=CASE WHEN usage_limit_total IS NOT NULL AND times_redeemed+1 >= usage_limit_total THEN 'EXHAUSTED' ELSE status END,
           updated_at=now()
       WHERE tenant_id=$1 AND id=$2`,
      [params.tenantId, params.promoCodeId],
    );
    return true;
  }
}
