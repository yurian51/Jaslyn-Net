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
         LEFT JOIN customers c ON c.id = s.customer_id AND c.tenant_id = s.tenant_id
         LEFT JOIN routers r ON r.id = s.router_id AND r.tenant_id = s.tenant_id
         LEFT JOIN locations l ON l.id = r.location_id AND l.tenant_id = s.tenant_id
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
           COUNT(*) FILTER (
             WHERE s.status = 'ACTIVE'
               AND NOT EXISTS (
                 SELECT 1 FROM traffic_samples ts
                 WHERE ts.tenant_id = s.tenant_id AND ts.session_id = s.id
               )
           )::int AS active_without_accounting,
           COUNT(*) FILTER (WHERE s.status = 'STALE')::int AS stale,
           COUNT(*) FILTER (
             WHERE s.status = 'ACTIVE'
               AND NOT EXISTS (
                 SELECT 1 FROM traffic_samples ts
                 WHERE ts.tenant_id = s.tenant_id AND ts.session_id = s.id
                   AND ts.sampled_at >= now() - interval '10 minutes'
               )
           )::int AS accounting_lagging
         FROM sessions s
         WHERE s.tenant_id = $1`,
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

  async getCommandCenter(tenantId: string) {
    const [tenant, health, devices, sessions, incidents, commands, authFailures, paymentFailures, providerFailures, criticalEvents] = await Promise.all([
      this.db.query("SELECT id, name, currency, timezone, status FROM tenants WHERE id=$1", [tenantId]),
      this.db.query("SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='ONLINE')::int AS online, COUNT(*) FILTER (WHERE status='DEGRADED')::int AS degraded, COUNT(*) FILTER (WHERE status='OFFLINE')::int AS offline FROM routers WHERE tenant_id=$1", [tenantId]),
      this.db.query("SELECT r.id,r.name,r.vendor,r.model,r.ip_address::text AS \"ipAddress\",r.mac_address::text AS \"macAddress\",r.status,r.active_users AS \"activeUsers\",r.updated_at AS \"updatedAt\",r.management_protocol AS \"managementProtocol\",r.management_enabled AS \"managementEnabled\",r.capabilities FROM routers r WHERE r.tenant_id=$1 ORDER BY CASE r.status WHEN 'OFFLINE' THEN 0 WHEN 'DEGRADED' THEN 1 ELSE 2 END,r.name LIMIT 200", [tenantId]),
      this.db.query("SELECT s.id,s.customer_id AS \"customerId\",COALESCE(c.full_name,s.username,'Unknown subscriber') AS subscriber,s.router_id AS \"routerId\",COALESCE(r.name,'Unknown device') AS device,s.ip_address::text AS ip,s.username,s.started_at AS \"startedAt\",s.bytes_in AS \"bytesIn\",s.bytes_out AS \"bytesOut\",s.status,CASE WHEN EXISTS (SELECT 1 FROM radius_events re WHERE re.tenant_id=s.tenant_id AND re.username=COALESCE(s.username,c.username) AND re.result='ACCEPT' AND re.created_at >= s.started_at) THEN 'ACCEPTED' ELSE 'NOT_CONFIRMED' END AS \"authenticationState\",CASE WHEN EXISTS (SELECT 1 FROM traffic_samples ts WHERE ts.tenant_id=s.tenant_id AND ts.session_id=s.id) THEN 'REPORTED' ELSE 'NOT_REPORTED' END AS \"accountingState\" FROM sessions s LEFT JOIN customers c ON c.tenant_id=s.tenant_id AND c.id=s.customer_id LEFT JOIN routers r ON r.tenant_id=s.tenant_id AND r.id=s.router_id WHERE s.tenant_id=$1 AND s.status IN ('ACTIVE','STALE') ORDER BY s.started_at DESC LIMIT 100", [tenantId]),
      this.db.query("SELECT i.id,i.category,i.severity,i.status,i.title,i.summary,i.root_resource_type AS \"rootResourceType\",i.root_resource_id AS \"rootResourceId\",i.started_at AS \"startedAt\",i.last_seen_at AS \"lastSeenAt\",i.acknowledged_at AS \"acknowledgedAt\",i.resolved_at AS \"resolvedAt\",i.resolution,COUNT(ii.id) FILTER (WHERE ii.resource_type='ROUTER' AND ii.state='AFFECTED')::int AS \"affectedDevices\",COUNT(ii.id) FILTER (WHERE ii.resource_type='CUSTOMER' AND ii.state='AFFECTED')::int AS \"affectedSubscribers\" FROM incidents i LEFT JOIN incident_impacts ii ON ii.tenant_id=i.tenant_id AND ii.incident_id=i.id WHERE i.tenant_id=$1 AND i.status IN ('OPEN','ACKNOWLEDGED') GROUP BY i.id ORDER BY CASE i.severity WHEN 'CRITICAL' THEN 0 WHEN 'WARNING' THEN 1 ELSE 2 END,i.last_seen_at DESC LIMIT 100", [tenantId]),
      this.db.query("SELECT n.id,n.command_type AS \"commandType\",n.actor,n.provider,n.status,n.error,n.correlation_id AS \"correlationId\",n.created_at AS \"createdAt\",n.sent_at AS \"sentAt\",n.completed_at AS \"completedAt\",n.verified_at AS \"verifiedAt\",n.router_id AS \"routerId\",n.target,n.request,n.response,n.verification FROM network_commands n WHERE n.tenant_id=$1 ORDER BY n.created_at DESC LIMIT 100", [tenantId]),
      this.db.query("SELECT COUNT(*)::int AS count FROM radius_events WHERE tenant_id=$1 AND result='REJECT' AND created_at >= now()-interval '24 hours'", [tenantId]),
      this.db.query("SELECT COUNT(*)::int AS count FROM payments WHERE tenant_id=$1 AND status='FAILED' AND created_at >= now()-interval '24 hours'", [tenantId]),
      this.db.query("SELECT provider,COUNT(*)::int AS failures FROM network_commands WHERE tenant_id=$1 AND status='FAILED' AND created_at >= now()-interval '24 hours' GROUP BY provider ORDER BY failures DESC,provider LIMIT 20", [tenantId]),
      this.db.query("SELECT id,title,summary,severity,category,started_at AS \"occurredAt\",root_resource_type AS \"resourceType\",root_resource_id AS \"resourceId\" FROM incidents WHERE tenant_id=$1 AND severity='CRITICAL' ORDER BY last_seen_at DESC LIMIT 20", [tenantId]),
    ]);

    if (!tenant.rowCount) throw new Error('Tenant not found');
    const router = health.rows[0] ?? { total: 0, online: 0, degraded: 0, offline: 0 };
    const activeIncidents = incidents.rows;
    const degradedServices = activeIncidents.filter((i) => ['SERVICE_IMPACT','UPSTREAM_FAILURE','RADIUS_FAILURE','PAYMENT_FAILURE','AUTHENTICATION_FAILURE'].includes(i.category));
    const pendingCommands = commands.rows.filter((c) => ['QUEUED','SENT','ACCEPTED','RETRYING'].includes(c.status));

    return {
      generatedAt: new Date().toISOString(),
      tenant: tenant.rows[0],
      systemHealth: {
        status: Number(router.offline) > 0 || activeIncidents.some((i) => i.severity === 'CRITICAL') ? 'DEGRADED' : Number(router.degraded) > 0 ? 'ATTENTION' : 'OPERATIONAL',
        devices: { total: Number(router.total), online: Number(router.online), degraded: Number(router.degraded), unreachable: Number(router.offline) },
        activeIncidents: activeIncidents.length,
        degradedServices: degradedServices.length,
        activeSessions: sessions.rows.filter((s) => s.status === 'ACTIVE').length,
        authenticationFailures24h: Number(authFailures.rows[0]?.count || 0),
        paymentFailures24h: Number(paymentFailures.rows[0]?.count || 0),
        providerFailures24h: providerFailures.rows.map((row) => ({ provider: row.provider ?? 'UNSPECIFIED', failures: Number(row.failures) })),
        commandQueue: { pending: pendingCommands.length, failed: commands.rows.filter((c) => c.status === 'FAILED').length },
      },
      devices: devices.rows.map((row) => ({
        ...row,
        telemetry: { uptime: null, cpu: null, memory: null, interfaces: null, bandwidth: null, latency: null, packetLoss: null, source: 'NOT_REPORTED_BY_CURRENT_TELEMETRY_MODEL' },
        reachability: row.status === 'ONLINE' || row.status === 'DEGRADED',
        activeSessions: sessions.rows.filter((s) => s.routerId === row.id && s.status === 'ACTIVE').length,
        recentCommands: commands.rows.filter((c) => c.routerId === row.id).slice(0, 10),
        recentIncidents: activeIncidents.filter((i) => i.rootResourceId === row.id).slice(0, 10),
      })),
      sessions: sessions.rows,
      incidents: activeIncidents,
      commands: commands.rows.map((command) => ({
        ...command,
        authorization: command.request?.authorization ?? null,
        riskLevel: command.request?.riskLevel ?? null,
        confirmation: command.request?.confirmation ?? null,
        durationMs: command.completedAt && command.createdAt ? Math.max(0, new Date(command.completedAt).getTime() - new Date(command.createdAt).getTime()) : null,
        result: command.verification ?? command.response ?? null,
      })),
      recentCriticalEvents: criticalEvents.rows,
    };
  }
}