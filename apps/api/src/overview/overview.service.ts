import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

@Injectable()
export class OverviewService {
  constructor(@Inject(PG_POOL) private readonly db: Pool) {}

  async getOverview(tenantId: string) {
    const [tenant, customers, sessions, routers, payments, locations, liveSessions, revenueSeries, commandHealth, sessionHealth, accessHealth] = await Promise.all([
      this.db.query(`SELECT id, name, currency, timezone, status FROM tenants WHERE id = $1`, [tenantId]),
      this.db.query(
        `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_active)::int AS active
         FROM customers WHERE tenant_id = $1`,
        [tenantId],
      ),
      this.db.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active
         FROM sessions WHERE tenant_id = $1`,
        [tenantId],
      ),
      this.db.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status = 'ONLINE')::int AS online,
                COUNT(*) FILTER (WHERE status = 'DEGRADED')::int AS degraded,
                COUNT(*) FILTER (WHERE status = 'OFFLINE')::int AS offline
         FROM routers WHERE tenant_id = $1`,
        [tenantId],
      ),
      this.db.query(
        `SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'SUCCESS'), 0)::numeric AS revenue,
                COUNT(*) FILTER (WHERE status = 'SUCCESS')::int AS successful,
                COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed
         FROM payments
         WHERE tenant_id = $1 AND created_at >= date_trunc('month', now())`,
        [tenantId],
      ),
      this.db.query(
        `SELECT l.id, l.name,
                COUNT(DISTINCT r.id)::int AS routers,
                COALESCE(SUM(r.active_users), 0)::int AS active_users,
                COUNT(DISTINCT CASE WHEN r.status = 'ONLINE' THEN r.id END)::int AS online_routers
         FROM locations l
         LEFT JOIN routers r ON r.location_id = l.id AND r.tenant_id = $1
         WHERE l.tenant_id = $1
         GROUP BY l.id, l.name
         ORDER BY active_users DESC, l.name ASC
         LIMIT 10`,
        [tenantId],
      ),
      this.db.query(
        `SELECT s.id, COALESCE(c.full_name, s.username, 'Unknown customer') AS customer,
                COALESCE(l.name, 'Unassigned') AS location,
                COALESCE(r.name, 'Unknown router') AS router,
                s.ip_address::text AS ip_address,
                s.started_at,
                s.bytes_in,
                s.bytes_out,
                s.status
         FROM sessions s
         LEFT JOIN customers c ON c.id = s.customer_id
         LEFT JOIN routers r ON r.id = s.router_id
         LEFT JOIN locations l ON l.id = r.location_id
         WHERE s.tenant_id = $1 AND s.status = 'ACTIVE'
         ORDER BY s.started_at DESC
         LIMIT 10`,
        [tenantId],
      ),
      this.db.query(
        `SELECT EXTRACT(DAY FROM day)::int AS day,
                COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'SUCCESS'), 0)::numeric AS revenue
         FROM generate_series(date_trunc('month', now()), date_trunc('month', now()) + interval '1 month' - interval '1 day', interval '1 day') day
         LEFT JOIN payments p ON p.tenant_id = $1 AND p.created_at >= day AND p.created_at < day + interval '1 day'
         GROUP BY day
         ORDER BY day`,
        [tenantId],
      ),
      this.db.query(
        `SELECT
           COUNT(*) FILTER (WHERE status IN ('QUEUED','SENT','ACCEPTED','RETRYING'))::int AS pending,
           COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed,
           COUNT(*) FILTER (WHERE status = 'VERIFIED')::int AS verified,
           COUNT(*) FILTER (WHERE status = 'ABANDONED')::int AS abandoned
         FROM network_commands
         WHERE tenant_id = $1`,
        [tenantId],
      ),
      this.db.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'ACTIVE' AND last_accounting_at IS NULL)::int AS active_without_accounting,
           COUNT(*) FILTER (WHERE status = 'STALE')::int AS stale,
           COUNT(*) FILTER (WHERE status = 'ACTIVE' AND last_accounting_at < now() - interval '10 minutes')::int AS accounting_lagging
         FROM sessions
         WHERE tenant_id = $1`,
        [tenantId],
      ),
      this.db.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'ACTIVE' AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now()))::int AS active_valid,
           COUNT(*) FILTER (WHERE status = 'ACTIVE' AND ends_at <= now())::int AS expired_but_active,
           COUNT(*) FILTER (WHERE status = 'ACTIVE' AND ends_at > now() AND ends_at <= now() + interval '24 hours')::int AS expiring_24h
         FROM access_grants
         WHERE tenant_id = $1`,
        [tenantId],
      ),
    ]);

    if (!tenant.rowCount) throw new Error('Tenant not found');

    const t = tenant.rows[0];
    const customer = customers.rows[0];
    const session = sessions.rows[0];
    const router = routers.rows[0];
    const payment = payments.rows[0];
    const commands = commandHealth.rows[0];
    const sessionTruth = sessionHealth.rows[0];
    const access = accessHealth.rows[0];

    const totalRouters = Number(router.total);
    const onlineRouters = Number(router.online);
    const availability = totalRouters === 0 ? null : Number(((onlineRouters / totalRouters) * 100).toFixed(2));

    return {
      tenant: t,
      kpis: {
        monthlyRevenue: Number(payment.revenue),
        activeCustomers: Number(customer.active),
        onlineSessions: Number(session.active),
        networkAvailability: availability,
        paymentFailures: Number(payment.failed),
      },
      network: {
        totalRouters,
        online: onlineRouters,
        degraded: Number(router.degraded),
        offline: Number(router.offline),
      },
      operations: {
        networkCommands: {
          pending: Number(commands.pending),
          failed: Number(commands.failed),
          verified: Number(commands.verified),
          abandoned: Number(commands.abandoned),
        },
        sessions: {
          stale: Number(sessionTruth.stale),
          activeWithoutAccounting: Number(sessionTruth.active_without_accounting),
          accountingLagging: Number(sessionTruth.accounting_lagging),
        },
        access: {
          activeValid: Number(access.active_valid),
          expiredButActive: Number(access.expired_but_active),
          expiring24h: Number(access.expiring_24h),
        },
      },
      locations: locations.rows.map((row) => ({
        id: row.id,
        name: row.name,
        routers: Number(row.routers),
        activeUsers: Number(row.active_users),
        onlineRouters: Number(row.online_routers),
      })),
      revenueSeries: revenueSeries.rows.map((row) => Number(row.revenue)),
      sessions: liveSessions.rows.map((row) => ({
        ...row,
        bytesIn: Number(row.bytes_in),
        bytesOut: Number(row.bytes_out),
      })),
    };
  }
}
