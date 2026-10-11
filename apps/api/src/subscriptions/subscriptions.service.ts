import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

@Injectable()
export class SubscriptionsService {
  constructor(@Inject(PG_POOL) private readonly db: Pool) {}

  async catalogue() {
    const result = await this.db.query(
      `SELECT p.id, p.code, p.name, p.description, p.price::text AS price, p.currency,
              p.billing_interval AS "billingInterval", p.max_routers AS "maxRouters",
              p.max_sites AS "maxSites", p.max_customers AS "maxCustomers",
              p.pricing_mode AS "pricingMode", p.limits, p.features, p.sort_order AS "sortOrder"
       FROM saas_plans p
       WHERE p.is_active = true
       ORDER BY p.sort_order ASC, p.price ASC, p.billing_interval ASC, p.name ASC`,
    );
    return { data: result.rows };
  }

  async current(tenantId: string) {
    const result = await this.db.query(
      `SELECT s.id, s.status, s.starts_at AS "startsAt",
              s.current_period_start AS "currentPeriodStart",
              s.current_period_end AS "currentPeriodEnd",
              s.cancel_at_period_end AS "cancelAtPeriodEnd",
              p.id AS "planId", p.code AS "planCode", p.name AS "planName",
              p.description AS "planDescription", p.price::text AS "planPrice",
              p.currency AS "planCurrency", p.billing_interval AS "billingInterval",
              p.max_routers AS "maxRouters", p.max_sites AS "maxSites",
              p.max_customers AS "maxCustomers", p.pricing_mode AS "pricingMode",
              p.limits, p.features, p.sort_order AS "sortOrder"
       FROM organization_subscriptions s
       JOIN saas_plans p ON p.id = s.saas_plan_id
       WHERE s.tenant_id = $1
       ORDER BY CASE WHEN s.status IN ('TRIALING','ACTIVE','PAST_DUE') THEN 0 ELSE 1 END,
                s.created_at DESC
       LIMIT 1`,
      [tenantId],
    );
    return { data: result.rows[0] ?? null };
  }
}
