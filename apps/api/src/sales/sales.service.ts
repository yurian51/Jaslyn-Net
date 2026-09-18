import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

type Period = 'today'|'week'|'month'|'all';

@Injectable()
export class SalesService {
  constructor(@Inject(PG_POOL) private readonly db: Pool) {}

  private sqlRange(period: Period, month?: string) {
    if (month) {
      if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequestException('month must be YYYY-MM');
      return { start: '$2::date', end: `(date_trunc('month', $2::date) + interval '1 month')`, params: (tenantId: string) => [tenantId, month] };
    }
    if (period === 'today') return { start: `date_trunc('day', now())`, end: `now()`, params: (tenantId: string) => [tenantId] };
    if (period === 'week') return { start: `date_trunc('week', now())`, end: `now()`, params: (tenantId: string) => [tenantId] };
    if (period === 'all') return { start: `to_timestamp(0)`, end: `now()`, params: (tenantId: string) => [tenantId] };
    return { start: `date_trunc('month', now())`, end: `now()`, params: (tenantId: string) => [tenantId] };
  }

  async summary(tenantId: string, query: { period?: Period; month?: string }) {
    const period = query.period ?? 'month';
    const range = this.sqlRange(period, query.month);
    const params = range.params(tenantId);
    const [online, voucher, byPackage, bySite] = await Promise.all([
      this.db.query(
        `SELECT COUNT(*)::int AS count, COALESCE(SUM(amount),0)::numeric AS amount
         FROM payments
         WHERE tenant_id=$1 AND status='SUCCESS'
           AND created_at >= ${range.start} AND created_at < ${range.end}`,
        params,
      ),
      this.db.query(
        `SELECT COUNT(*)::int AS count, COALESCE(SUM(p.price),0)::numeric AS amount
         FROM vouchers v
         JOIN access_grants ag ON ag.tenant_id=v.tenant_id
         JOIN wifi_plan_purchases p ON p.tenant_id=v.tenant_id AND p.id=ag.purchase_id
         WHERE v.tenant_id=$1 AND v.status='USED'
           AND v.used_at >= ${range.start} AND v.used_at < ${range.end}`,
        params,
      ),
      this.db.query(
        `WITH sales AS (
           SELECT p.package_id, p.price::numeric AS amount
           FROM payments pay JOIN wifi_plan_purchases p ON p.tenant_id=pay.tenant_id AND p.id=pay.purchase_id
           WHERE pay.tenant_id=$1 AND pay.status='SUCCESS' AND pay.created_at >= ${range.start} AND pay.created_at < ${range.end}
           UNION ALL
           SELECT p.package_id, p.price::numeric
           FROM vouchers v
           JOIN access_grants ag ON ag.tenant_id=v.tenant_id
           JOIN wifi_plan_purchases p ON p.tenant_id=v.tenant_id AND p.id=ag.purchase_id
           WHERE v.tenant_id=$1 AND v.status='USED' AND v.used_at >= ${range.start} AND v.used_at < ${range.end}
         )
         SELECT s.package_id AS "packageId", pkg.name AS "packageName", COUNT(*)::int AS count,
                COALESCE(SUM(s.amount),0)::numeric AS amount
         FROM sales s JOIN packages pkg ON pkg.tenant_id=$1 AND pkg.id=s.package_id
         GROUP BY s.package_id,pkg.name ORDER BY amount DESC`,
        params,
      ),
      this.db.query(
        `WITH sales AS (
           SELECT p.router_id, p.price::numeric AS amount
           FROM payments pay JOIN wifi_plan_purchases p ON p.tenant_id=pay.tenant_id AND p.id=pay.purchase_id
           WHERE pay.tenant_id=$1 AND pay.status='SUCCESS' AND pay.created_at >= ${range.start} AND pay.created_at < ${range.end}
           UNION ALL
           SELECT p.router_id, p.price::numeric
           FROM vouchers v
           JOIN access_grants ag ON ag.tenant_id=v.tenant_id
           JOIN wifi_plan_purchases p ON p.tenant_id=v.tenant_id AND p.id=ag.purchase_id
           WHERE v.tenant_id=$1 AND v.status='USED' AND v.used_at >= ${range.start} AND v.used_at < ${range.end}
         )
         SELECT s.router_id AS "routerId", COALESCE(r.name,'Unassigned') AS "routerName",
                COALESCE(l.name,'Unassigned') AS "siteName", COUNT(*)::int AS count,
                COALESCE(SUM(s.amount),0)::numeric AS amount
         FROM sales s
         LEFT JOIN routers r ON r.tenant_id=$1 AND r.id=s.router_id
         LEFT JOIN locations l ON l.tenant_id=$1 AND l.id=r.location_id
         GROUP BY s.router_id,r.name,l.name ORDER BY amount DESC`,
        params,
      ),
    ]);
    const onlineAmount = Number(online.rows[0]?.amount ?? 0);
    const voucherAmount = Number(voucher.rows[0]?.amount ?? 0);
    const onlineCount = Number(online.rows[0]?.count ?? 0);
    const voucherCount = Number(voucher.rows[0]?.count ?? 0);
    return {
      period, month: query.month ?? null,
      totals: {
        online: { count: onlineCount, amount: onlineAmount },
        voucher: { count: voucherCount, amount: voucherAmount },
        combined: { count: onlineCount + voucherCount, amount: onlineAmount + voucherAmount },
      },
      byPackage: byPackage.rows.map(r => ({ ...r, count: Number(r.count), amount: Number(r.amount) })),
      bySite: bySite.rows.map(r => ({ ...r, count: Number(r.count), amount: Number(r.amount) })),
    };
  }

  async customers(tenantId: string, query: { period?: Period; month?: string }) {
    const period = query.period ?? 'month';
    const range = this.sqlRange(period, query.month);
    const params = range.params(tenantId);
    const result = await this.db.query(
      `SELECT p.id AS "orderId", c.id AS "customerId", c.phone,
              pay.provider_reference AS "paymentReference",
              pkg.name AS "packageName", p.starts_at AS "startsAt", p.ends_at AS "endsAt",
              p.price AS amount, p.currency
       FROM wifi_plan_purchases p
       JOIN customers c ON c.tenant_id=p.tenant_id AND c.id=p.customer_id
       JOIN packages pkg ON pkg.tenant_id=p.tenant_id AND pkg.id=p.package_id
       LEFT JOIN payments pay ON pay.tenant_id=p.tenant_id AND pay.purchase_id=p.id AND pay.status='SUCCESS'
       WHERE p.tenant_id=$1 AND p.created_at >= ${range.start} AND p.created_at < ${range.end}
       ORDER BY p.created_at DESC LIMIT 500`,
      params,
    );
    return { data: result.rows };
  }

  async searchPayments(tenantId: string, q: string) {
    const term = q.trim();
    if (term.length < 2) throw new BadRequestException('Search term must contain at least 2 characters');
    const result = await this.db.query(
      `SELECT pay.id AS "paymentId", pay.status, pay.provider, pay.provider_reference AS "paymentReference",
              pay.amount, pay.currency, pay.created_at AS "createdAt",
              p.id AS "orderId", c.id AS "customerId", c.full_name AS "customerName", c.phone,
              pkg.name AS "packageName"
       FROM payments pay
       LEFT JOIN wifi_plan_purchases p ON p.tenant_id=pay.tenant_id AND p.id=pay.purchase_id
       LEFT JOIN customers c ON c.tenant_id=pay.tenant_id AND c.id=pay.customer_id
       LEFT JOIN packages pkg ON pkg.tenant_id=pay.tenant_id AND pkg.id=p.package_id
       LEFT JOIN vouchers v ON v.tenant_id=pay.tenant_id
       WHERE pay.tenant_id=$1
         AND (c.phone ILIKE '%'||$2||'%' OR c.id::text ILIKE '%'||$2||'%'
              OR pay.provider_reference ILIKE '%'||$2||'%' OR pay.id::text ILIKE '%'||$2||'%'
              OR p.id::text ILIKE '%'||$2||'%' OR v.code ILIKE '%'||$2||'%')
       ORDER BY pay.created_at DESC LIMIT 100`,
      [tenantId, term],
    );
    return { data: result.rows };
  }
}
