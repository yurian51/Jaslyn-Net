import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditContext, AuditService } from '../audit/audit.service';

@Injectable()
export class IncidentsService {
  constructor(
    @Inject(PG_POOL) private readonly db: Pool,
    private readonly audit: AuditService,
  ) {}

  async list(tenantId: string, status?: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED') {
    const result = await this.db.query(
      `SELECT i.id, i.fingerprint, i.category, i.severity, i.status, i.title, i.summary,
              i.root_resource_type AS "rootResourceType", i.root_resource_id AS "rootResourceId",
              i.started_at AS "startedAt", i.last_seen_at AS "lastSeenAt", i.acknowledged_at AS "acknowledgedAt",
              i.resolved_at AS "resolvedAt", i.resolution, i.evidence, i.created_at AS "createdAt",
              COALESCE(COUNT(ii.id) FILTER (WHERE ii.state='AFFECTED'),0)::int AS "affectedResources",
              COALESCE(COUNT(ii.id) FILTER (WHERE ii.resource_type='CUSTOMER' AND ii.state='AFFECTED'),0)::int AS "affectedCustomers",
              COALESCE(COUNT(ii.id) FILTER (WHERE ii.resource_type='SESSION' AND ii.state='AFFECTED'),0)::int AS "affectedSessions",
              COALESCE(SUM(ii.estimated_revenue) FILTER (WHERE ii.resource_type='REVENUE' AND ii.state='AFFECTED'),0)::numeric AS "estimatedRevenue"
       FROM incidents i
       LEFT JOIN incident_impacts ii ON ii.incident_id=i.id AND ii.tenant_id=i.tenant_id
       WHERE i.tenant_id=$1 AND ($2::text IS NULL OR i.status=$2)
       GROUP BY i.id
       ORDER BY CASE i.severity WHEN 'CRITICAL' THEN 0 WHEN 'WARNING' THEN 1 ELSE 2 END, i.last_seen_at DESC
       LIMIT 200`,
      [tenantId, status ?? null],
    );
    return { data: result.rows, count: result.rowCount ?? 0 };
  }

  async get(tenantId: string, id: string) {
    const incident = await this.db.query(
      `SELECT id, fingerprint, category, severity, status, title, summary,
              root_resource_type AS "rootResourceType", root_resource_id AS "rootResourceId",
              started_at AS "startedAt", last_seen_at AS "lastSeenAt", acknowledged_at AS "acknowledgedAt",
              resolved_at AS "resolvedAt", resolution, evidence, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM incidents WHERE tenant_id=$1 AND id=$2`,
      [tenantId, id],
    );
    if (!incident.rowCount) throw new NotFoundException('Incident not found');
    const impacts = await this.db.query(
      `SELECT id, resource_type AS "resourceType", resource_id AS "resourceId", impact_type AS "impactType",
              state, estimated_revenue AS "estimatedRevenue", evidence, created_at AS "createdAt", recovered_at AS "recoveredAt"
       FROM incident_impacts WHERE tenant_id=$1 AND incident_id=$2 ORDER BY created_at ASC`,
      [tenantId, id],
    );
    return { ...incident.rows[0], impacts: impacts.rows };
  }

  async syncRouterOffline(tenantId: string, routerId: string, context: AuditContext = {}) {
    const routerResult = await this.db.query(
      `SELECT r.id, r.name, r.status, r.location_id AS "locationId", l.name AS "locationName"
       FROM routers r LEFT JOIN locations l ON l.id=r.location_id AND l.tenant_id=r.tenant_id
       WHERE r.tenant_id=$1 AND r.id=$2`,
      [tenantId, routerId],
    );
    if (!routerResult.rowCount) throw new NotFoundException('Router not found');
    const router = routerResult.rows[0];

    const [impactResult, revenueResult] = await Promise.all([
      this.db.query(
        `SELECT COUNT(DISTINCT s.id)::int AS sessions,
                COUNT(DISTINCT s.customer_id)::int AS customers,
                COUNT(DISTINCT ag.purchase_id)::int AS purchases
         FROM sessions s
         LEFT JOIN access_grants ag ON ag.tenant_id=s.tenant_id AND ag.router_id=$2 AND ag.customer_id=s.customer_id AND ag.status='ACTIVE'
         WHERE s.tenant_id=$1 AND s.router_id=$2 AND s.status='ACTIVE'`,
        [tenantId, routerId],
      ),
      this.db.query(
        `SELECT COALESCE(SUM(p.price),0)::numeric AS revenue
         FROM access_grants ag
         JOIN wifi_plan_purchases p ON p.tenant_id=ag.tenant_id AND p.id=ag.purchase_id
         WHERE ag.tenant_id=$1 AND ag.router_id=$2 AND ag.status='ACTIVE'
           AND (ag.ends_at IS NULL OR ag.ends_at > now())`,
        [tenantId, routerId],
      ),
    ]);
    const impact = impactResult.rows[0];
    const revenue = Number(revenueResult.rows[0]?.revenue || 0);
    const fingerprint = `router-offline:${routerId}`;

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query(
        `SELECT id, status FROM incidents WHERE tenant_id=$1 AND fingerprint=$2 AND status IN ('OPEN','ACKNOWLEDGED') FOR UPDATE`,
        [tenantId, fingerprint],
      );
      let incidentId: string;
      if (existing.rowCount) {
        incidentId = existing.rows[0].id;
        await client.query(
          `UPDATE incidents SET last_seen_at=now(), severity='CRITICAL', evidence=evidence || $3::jsonb, updated_at=now() WHERE tenant_id=$1 AND id=$2`,
          [tenantId, incidentId, JSON.stringify({ routerStatus: router.status, detectedBy: 'router-state-sync' })],
        );
        await client.query(`DELETE FROM incident_impacts WHERE tenant_id=$1 AND incident_id=$2 AND state='AFFECTED'`, [tenantId, incidentId]);
      } else {
        const created = await client.query(
          `INSERT INTO incidents (tenant_id,fingerprint,category,severity,status,title,summary,root_resource_type,root_resource_id,evidence)
           VALUES ($1,$2,'DEVICE_OFFLINE','CRITICAL','OPEN',$3,$4,'ROUTER',$5,$6::jsonb) RETURNING id`,
          [tenantId, fingerprint, `${router.name} is offline`, `Router ${router.name} is offline${router.locationName ? ` at ${router.locationName}` : ''}.`, routerId, JSON.stringify({ routerStatus: router.status, detectedBy: 'router-state-sync' })],
        );
        incidentId = created.rows[0].id;
      }

      await client.query(
        `INSERT INTO incident_impacts (tenant_id,incident_id,resource_type,resource_id,impact_type,state,evidence)
         VALUES ($1,$2,'ROUTER',$3,'INFRASTRUCTURE','AFFECTED',$4::jsonb)`,
        [tenantId, incidentId, routerId, JSON.stringify({ status: router.status })],
      );
      if (router.locationId) {
        await client.query(
          `INSERT INTO incident_impacts (tenant_id,incident_id,resource_type,resource_id,impact_type,state,evidence)
           VALUES ($1,$2,'LOCATION',$3,'INFRASTRUCTURE','AFFECTED',$4::jsonb)`,
          [tenantId, incidentId, router.locationId, JSON.stringify({ name: router.locationName })],
        );
      }

      const sessions = await client.query(`SELECT id, customer_id FROM sessions WHERE tenant_id=$1 AND router_id=$2 AND status='ACTIVE'`, [tenantId, routerId]);
      for (const session of sessions.rows) {
        await client.query(
          `INSERT INTO incident_impacts (tenant_id,incident_id,resource_type,resource_id,impact_type,state,evidence)
           VALUES ($1,$2,'SESSION',$3,'SESSION','AFFECTED',$4::jsonb),
                  ($1,$2,'CUSTOMER',$5,'CUSTOMER','AFFECTED',$4::jsonb)`,
          [tenantId, incidentId, session.id, JSON.stringify({ routerId }), session.customer_id],
        );
      }
      if (revenue > 0) {
        await client.query(
          `INSERT INTO incident_impacts (tenant_id,incident_id,resource_type,impact_type,state,estimated_revenue,evidence)
           VALUES ($1,$2,'REVENUE','REVENUE','AFFECTED',$3,$4::jsonb)`,
          [tenantId, incidentId, revenue, JSON.stringify({ basis: 'active access grants on affected router' })],
        );
      }
      await client.query('COMMIT');
      await this.audit.record(tenantId, 'INCIDENT_SYNCED_ROUTER_OFFLINE', 'incident', incidentId, {
        routerId, routerName: router.name, affectedCustomers: Number(impact.customers || 0), affectedSessions: Number(impact.sessions || 0), estimatedRevenue: revenue,
      }, context);
      return this.get(tenantId, incidentId);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  async resolveRouterOffline(tenantId: string, routerId: string, context: AuditContext = {}) {
    const result = await this.db.query(
      `UPDATE incidents SET status='RESOLVED', resolved_at=now(), last_seen_at=now(), resolution='Router heartbeat recovered', updated_at=now()
       WHERE tenant_id=$1 AND fingerprint=$2 AND status IN ('OPEN','ACKNOWLEDGED') RETURNING id`,
      [tenantId, `router-offline:${routerId}`],
    );
    if (!result.rowCount) return { resolved: false, incident: null };
    const incidentId = result.rows[0].id;
    await this.db.query(`UPDATE incident_impacts SET state='RECOVERED', recovered_at=now() WHERE tenant_id=$1 AND incident_id=$2 AND state='AFFECTED'`, [tenantId, incidentId]);
    await this.audit.record(tenantId, 'INCIDENT_RESOLVED_ROUTER_RECOVERY', 'incident', incidentId, { routerId }, context);
    return { resolved: true, incident: await this.get(tenantId, incidentId) };
  }

  async acknowledge(tenantId: string, id: string, context: AuditContext = {}) {
    const result = await this.db.query(
      `UPDATE incidents SET status='ACKNOWLEDGED', acknowledged_at=COALESCE(acknowledged_at,now()), updated_at=now()
       WHERE tenant_id=$1 AND id=$2 AND status='OPEN' RETURNING id`,
      [tenantId, id],
    );
    if (!result.rowCount) throw new NotFoundException('Open incident not found');
    await this.audit.record(tenantId, 'INCIDENT_ACKNOWLEDGED', 'incident', id, {}, context);
    return this.get(tenantId, id);
  }

  async resolve(tenantId: string, id: string, resolution: string, context: AuditContext = {}) {
    const result = await this.db.query(
      `UPDATE incidents SET status='RESOLVED', resolved_at=now(), last_seen_at=now(), resolution=$3, updated_at=now()
       WHERE tenant_id=$1 AND id=$2 AND status IN ('OPEN','ACKNOWLEDGED') RETURNING id`,
      [tenantId, id, resolution.trim()],
    );
    if (!result.rowCount) throw new NotFoundException('Active incident not found');
    await this.db.query(`UPDATE incident_impacts SET state='RECOVERED', recovered_at=now() WHERE tenant_id=$1 AND incident_id=$2 AND state='AFFECTED'`, [tenantId, id]);
    await this.audit.record(tenantId, 'INCIDENT_RESOLVED', 'incident', id, { resolution: resolution.trim() }, context);
    return this.get(tenantId, id);
  }
}
