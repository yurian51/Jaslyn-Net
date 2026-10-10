import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

@Injectable()
export class SubscriptionsService {
  constructor(@Inject(PG_POOL) private readonly db: Pool) {}

  async catalogue() {
    const result = await this.db.query(
      `SELECT id, code, name, description, price::text AS price, currency,
              billing_interval AS "billingInterval", max_routers AS "maxRouters",
              max_sites AS "maxSites", max_customers AS "maxCustomers"
       FROM saas_plans
       WHERE is_active = true
       ORDER BY price ASC, billing_interval ASC, name ASC`,
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
              p.max_customers AS "maxCustomers"
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
