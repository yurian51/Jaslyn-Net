import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

const planColumns = `id,code,name,description,price,currency,billing_interval AS "billingInterval",
  pricing_mode AS "pricingMode",max_routers AS "maxRouters",max_sites AS "maxSites",
  max_customers AS "maxCustomers",limits,features,sort_order AS "sortOrder"`;

@Injectable()
export class SubscriptionService {
  constructor(@Inject(PG_POOL) private readonly db: Pool) {}

  async plans() {
    const result = await this.db.query(
      `SELECT ${planColumns}
       FROM saas_plans
       WHERE is_active=true
       ORDER BY sort_order ASC, price ASC, name ASC`,
    );
    return { data: result.rows };
  }

  async current(tenantId: string) {
    const result = await this.db.query(
      `SELECT s.id AS "subscriptionId",s.status,s.starts_at AS "startsAt",
              s.current_period_start AS "currentPeriodStart",s.current_period_end AS "currentPeriodEnd",
              s.cancel_at_period_end AS "cancelAtPeriodEnd",
              ${planColumns.replace(/^id,/, 'p.id,').replace(/^/, '')}
       FROM organization_subscriptions s
       JOIN saas_plans p ON p.id=s.saas_plan_id
       WHERE s.tenant_id=$1
       ORDER BY s.created_at DESC
       LIMIT 1`,
      [tenantId],
    );
    if (!result.rowCount) throw new NotFoundException('No active Jaslyn Net plan is assigned to this workspace');
    return result.rows[0];
  }

  async usage(tenantId: string) {
    const subscription = await this.current(tenantId);
    const counts = await Promise.all([
      this.count('customers', tenantId),
      this.count('routers', tenantId),
      this.count('locations', tenantId),
      this.count('packages', tenantId),
    ]);
    const [customers, routers, sites, packages] = counts;
    const limits = subscription.limits ?? {};
    const usage = {
      subscribers: { used: customers, limit: this.limit(limits.subscribers ?? limits.maxCustomers) },
      routers: { used: routers, limit: this.limit(limits.routers ?? subscription.maxRouters) },
      sites: { used: sites, limit: this.limit(limits.sites ?? subscription.maxSites) },
      packages: { used: packages, limit: this.limit(limits.packages) },
      admins: { used: await this.count('users', tenantId, 'role IN (\'OWNER\',\'ADMIN\')'), limit: this.limit(limits.admins) },
    };
    return { plan: subscription.name, status: subscription.status, usage };
  }

  async feature(tenantId: string, key: string) {
    const subscription = await this.current(tenantId);
    const normalized = key.trim();
    return { key: normalized, enabled: subscription.features?.[normalized] === true, plan: subscription.code };
  }

  private limit(value: unknown) {
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private async count(table: string, tenantId: string, where?: string) {
    const safeTables = new Set(['customers','routers','locations','packages','users']);
    if (!safeTables.has(table)) throw new Error('Unsupported usage table');
    const suffix = where ? ` AND ${where}` : '';
    const result = await this.db.query(`SELECT count(*)::int AS count FROM ${table} WHERE tenant_id=$1${suffix}`, [tenantId]);
    return result.rows[0]?.count ?? 0;
  }
}
