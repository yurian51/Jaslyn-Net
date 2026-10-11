import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditContext, AuditService } from '../audit/audit.service';
import { CommunicationDomainEventsService } from '../communication/communication.domain-events';
import { AssignIncidentOwnerDto, CreateMaintenanceWindowDto, SetIncidentPublicVisibilityDto, UpdateStatusPageComponentDto, UpdateStatusPageSettingsDto } from './incidents.dto';

@Injectable()
export class IncidentsService {
  constructor(
    @Inject(PG_POOL) private readonly db: Pool,
    private readonly audit: AuditService,
    private readonly domainEvents: CommunicationDomainEventsService,
  ) {}

  async listAssignableOwners(tenantId:string){
    const result=await this.db.query(`SELECT id,full_name AS "fullName",email,role FROM users WHERE tenant_id=$1 AND is_active=true AND role IN ('OWNER','ADMIN','AGENT') ORDER BY CASE role WHEN 'OWNER' THEN 0 WHEN 'ADMIN' THEN 1 ELSE 2 END,full_name LIMIT 200`,[tenantId]);
    return {data:result.rows,count:result.rowCount??0};
  }

  async list(tenantId: string, status?: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED') {
    const result = await this.db.query(
      `SELECT i.id, i.fingerprint, i.category, i.severity, i.status, i.title, i.summary,
              i.root_resource_type AS "rootResourceType", i.root_resource_id AS "rootResourceId",
              i.started_at AS "startedAt", i.last_seen_at AS "lastSeenAt", i.acknowledged_at AS "acknowledgedAt",
              i.resolved_at AS "resolvedAt", i.resolution, i.evidence, i.created_at AS "createdAt",
              i.owner_user_id AS "ownerUserId", iu.full_name AS "ownerName", i.sla_target_minutes AS "slaTargetMinutes",
              i.escalation_level AS "escalationLevel", i.public_visible AS "publicVisible",
              (EXTRACT(EPOCH FROM (COALESCE(i.resolved_at,now())-i.started_at))/60 > i.sla_target_minutes) AS "slaBreached",
              COALESCE(COUNT(ii.id) FILTER (WHERE ii.state='AFFECTED'),0)::int AS "affectedResources",
              COALESCE(COUNT(ii.id) FILTER (WHERE ii.resource_type='CUSTOMER' AND ii.state='AFFECTED'),0)::int AS "affectedCustomers",
              COALESCE(COUNT(ii.id) FILTER (WHERE ii.resource_type='SESSION' AND ii.state='AFFECTED'),0)::int AS "affectedSessions",
              COALESCE(SUM(ii.estimated_revenue) FILTER (WHERE ii.resource_type='REVENUE' AND ii.state='AFFECTED'),0)::numeric AS "estimatedRevenue"
       FROM incidents i
       LEFT JOIN incident_impacts ii ON ii.incident_id=i.id AND ii.tenant_id=i.tenant_id
       LEFT JOIN users iu ON iu.tenant_id=i.tenant_id AND iu.id=i.owner_user_id
       WHERE i.tenant_id=$1 AND ($2::text IS NULL OR i.status=$2)
       GROUP BY i.id,iu.full_name
       ORDER BY CASE i.severity WHEN 'CRITICAL' THEN 0 WHEN 'WARNING' THEN 1 ELSE 2 END, i.last_seen_at DESC
       LIMIT 200`,
      [tenantId, status ?? null],
    );
    return { data: result.rows, count: result.rowCount ?? 0 };
  }

  async get(tenantId: string, id: string) {
    const incident = await this.db.query(
      `SELECT i.id, i.fingerprint, i.category, i.severity, i.status, i.title, i.summary,
              i.root_resource_type AS "rootResourceType", i.root_resource_id AS "rootResourceId",
              i.started_at AS "startedAt", i.last_seen_at AS "lastSeenAt", i.acknowledged_at AS "acknowledgedAt",
              i.resolved_at AS "resolvedAt", i.resolution, i.evidence, i.created_at AS "createdAt", i.updated_at AS "updatedAt",
              i.owner_user_id AS "ownerUserId", u.full_name AS "ownerName", i.sla_target_minutes AS "slaTargetMinutes",
              i.escalation_level AS "escalationLevel", i.public_visible AS "publicVisible", i.public_summary AS "publicSummary",
              (EXTRACT(EPOCH FROM (COALESCE(i.resolved_at,now())-i.started_at))/60 > i.sla_target_minutes) AS "slaBreached"
       FROM incidents i LEFT JOIN users u ON u.tenant_id=i.tenant_id AND u.id=i.owner_user_id
       WHERE i.tenant_id=$1 AND i.id=$2`,
      [tenantId, id],
    );
    if (!incident.rowCount) throw new NotFoundException('Incident not found');
    const impacts = await this.db.query(
      `SELECT id, resource_type AS "resourceType", resource_id AS "resourceId", impact_type AS "impactType",
              state, estimated_revenue AS "estimatedRevenue", evidence, created_at AS "createdAt", recovered_at AS "recoveredAt"
       FROM incident_impacts WHERE tenant_id=$1 AND incident_id=$2 ORDER BY created_at ASC`,
      [tenantId, id],
    );
    const events = await this.db.query(
      `SELECT id,event_type AS "eventType",actor_user_id AS "actorUserId",from_status AS "fromStatus",
              to_status AS "toStatus",note,metadata,created_at AS "createdAt"
       FROM incident_events WHERE tenant_id=$1 AND incident_id=$2 ORDER BY created_at ASC,id ASC`,
      [tenantId, id],
    );
    return { ...incident.rows[0], impacts: impacts.rows, events: events.rows };
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
      const maintenanceWindow = await client.query(
        `SELECT mw.id,mw.title,mw.scope_type AS "scopeType"
         FROM maintenance_windows mw
         LEFT JOIN network_sites ns ON ns.tenant_id=mw.tenant_id AND ns.id=mw.scope_id
         WHERE mw.tenant_id=$1 AND mw.status IN ('PLANNED','ACTIVE')
           AND mw.starts_at<=now() AND mw.ends_at>now()
           AND (mw.scope_type='TENANT'
             OR (mw.scope_type='ROUTER' AND mw.scope_id=$2)
             OR (mw.scope_type='SITE' AND ns.location_id=$3))
         ORDER BY CASE mw.scope_type WHEN 'ROUTER' THEN 0 WHEN 'SITE' THEN 1 ELSE 2 END
         LIMIT 1`,
        [tenantId,routerId,router.locationId],
      );
      const duringMaintenance = Boolean(maintenanceWindow.rowCount);
      const maintenanceEvidence = duringMaintenance ? {
        maintenanceWindowId: maintenanceWindow.rows[0].id,
        maintenanceWindowTitle: maintenanceWindow.rows[0].title,
        maintenanceExpected: true,
      } : { maintenanceExpected: false };
      const existing = await client.query(
        `SELECT id, status FROM incidents WHERE tenant_id=$1 AND fingerprint=$2 AND status IN ('OPEN','ACKNOWLEDGED') FOR UPDATE`,
        [tenantId, fingerprint],
      );
      let incidentId: string;
      let createdNew = false;
      if (existing.rowCount) {
        incidentId = existing.rows[0].id;
        await client.query(
          `UPDATE incidents SET last_seen_at=now(), severity=CASE WHEN $4::boolean THEN 'WARNING' ELSE 'CRITICAL' END, evidence=evidence || $3::jsonb, updated_at=now() WHERE tenant_id=$1 AND id=$2`,
          [tenantId, incidentId, JSON.stringify({ routerStatus: router.status, detectedBy: 'router-state-sync', ...maintenanceEvidence }), duringMaintenance],
        );
        await client.query(`DELETE FROM incident_impacts WHERE tenant_id=$1 AND incident_id=$2 AND state='AFFECTED'`, [tenantId, incidentId]);
      } else {
        const created = await client.query(
          `INSERT INTO incidents (tenant_id,fingerprint,category,severity,status,title,summary,root_resource_type,root_resource_id,evidence)
           VALUES ($1,$2,'DEVICE_OFFLINE',CASE WHEN $3::boolean THEN 'WARNING' ELSE 'CRITICAL' END,'OPEN',$4,$5,'ROUTER',$6,$7::jsonb) RETURNING id`,
          [tenantId, fingerprint, duringMaintenance, `${router.name} is offline`, `Router ${router.name} is offline${router.locationName ? ` at ${router.locationName}` : ''}.`, routerId, JSON.stringify({ routerStatus: router.status, detectedBy: 'router-state-sync', ...maintenanceEvidence })],
        );
        incidentId = created.rows[0].id;
        createdNew = true;
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
        routerId, routerName: router.name, affectedCustomers: Number(impact.customers || 0), affectedSessions: Number(impact.sessions || 0), estimatedRevenue: revenue, maintenanceWindowId: maintenanceWindow.rows[0]?.id ?? null,
      }, context);
      if (createdNew && !duringMaintenance) {
        await this.domainEvents.enqueue({
          tenantId,
          eventKey: `incident.opened:${incidentId}`,
          eventType: 'INCIDENT.OPENED',
          aggregateType: 'incident',
          aggregateId: incidentId,
          payload: {
            title: `${router.name} is offline`,
            summary: `Router ${router.name} is offline${router.locationName ? ` at ${router.locationName}` : ''}.`,
            severity: 'CRITICAL',
            routerId,
            targetRoles: ['OWNER', 'ADMIN', 'AGENT'],
          },
        });
      }
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
    await this.domainEvents.enqueue({
      tenantId,
      eventKey: `incident.resolved:${incidentId}:router-recovery`,
      eventType: 'INCIDENT.RESOLVED',
      aggregateType: 'incident',
      aggregateId: incidentId,
      payload: {
        title: 'Network incident resolved',
        summary: 'Router heartbeat recovered.',
        routerId,
        targetRoles: ['OWNER', 'ADMIN', 'AGENT'],
      },
    });
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

  async getSlaReport(tenantId:string,fromInput?:string,toInput?:string){
    const to=toInput?new Date(toInput):new Date();
    const from=fromInput?new Date(fromInput):new Date(to.getTime()-30*24*60*60*1000);
    if(!Number.isFinite(from.getTime())||!Number.isFinite(to.getTime())||from>=to)throw new BadRequestException('A valid report date range is required');
    if(to.getTime()-from.getTime()>366*24*60*60*1000)throw new BadRequestException('SLA report range cannot exceed 366 days');
    const params=[tenantId,from.toISOString(),to.toISOString()];
    const [summary,breakdown,recent]=await Promise.all([
      this.db.query(`SELECT count(*)::int AS "totalIncidents",
        count(*) FILTER(WHERE i.status<>'RESOLVED')::int AS "activeIncidents",
        count(*) FILTER(WHERE EXTRACT(EPOCH FROM (COALESCE(i.resolved_at,now())-i.started_at))/60>i.sla_target_minutes)::int AS "slaBreaches",
        count(*) FILTER(WHERE i.severity='CRITICAL')::int AS "criticalIncidents",
        round(avg((EXTRACT(EPOCH FROM (i.resolved_at-i.started_at))/60)::numeric) FILTER(WHERE i.status='RESOLVED' AND i.resolved_at IS NOT NULL),2) AS "averageResolutionMinutes",
        COALESCE(sum(impact.revenue_impact),0)::numeric(20,2) AS "estimatedRevenueImpact",
        COALESCE(sum(impact.customer_count),0)::int AS "customerImpactRows"
       FROM incidents i
       LEFT JOIN LATERAL (SELECT sum(estimated_revenue) FILTER(WHERE impact_type='REVENUE') AS revenue_impact,
         count(DISTINCT resource_id) FILTER(WHERE resource_type='CUSTOMER') AS customer_count
         FROM incident_impacts ii WHERE ii.tenant_id=i.tenant_id AND ii.incident_id=i.id AND ii.state='AFFECTED') impact ON true
       WHERE i.tenant_id=$1 AND i.started_at>=$2::timestamptz AND i.started_at<$3::timestamptz`,params),
      this.db.query(`SELECT severity,status,count(*)::int AS count FROM incidents WHERE tenant_id=$1 AND started_at>=$2::timestamptz AND started_at<$3::timestamptz GROUP BY severity,status ORDER BY severity,status`,params),
      this.db.query(`SELECT i.id,i.title,i.severity,i.status,i.started_at AS "startedAt",i.resolved_at AS "resolvedAt",
        i.sla_target_minutes AS "slaTargetMinutes",
        (EXTRACT(EPOCH FROM (COALESCE(i.resolved_at,now())-i.started_at))/60>i.sla_target_minutes) AS "slaBreached",
        COALESCE(impact.revenue_impact,0)::numeric(20,2) AS "estimatedRevenueImpact"
       FROM incidents i LEFT JOIN LATERAL (SELECT sum(estimated_revenue) FILTER(WHERE impact_type='REVENUE') AS revenue_impact
         FROM incident_impacts ii WHERE ii.tenant_id=i.tenant_id AND ii.incident_id=i.id AND ii.state='AFFECTED') impact ON true
       WHERE i.tenant_id=$1 AND i.started_at>=$2::timestamptz AND i.started_at<$3::timestamptz
       ORDER BY i.started_at DESC LIMIT 100`,params),
    ]);
    return {from:from.toISOString(),to:to.toISOString(),summary:summary.rows[0],breakdown:breakdown.rows,recent:recent.rows};
  }

  async assignOwner(tenantId: string, incidentId: string, input: AssignIncidentOwnerDto, context: AuditContext = {}) {
    const ownerId = input.ownerUserId ?? null;
    if (ownerId) {
      const user = await this.db.query('SELECT id FROM users WHERE tenant_id=$1 AND id=$2 AND is_active=true AND role IN ('OWNER','ADMIN','AGENT')', [tenantId, ownerId]);
      if (!user.rowCount) throw new NotFoundException('Active owner user was not found in this tenant');
    }
    const result = await this.db.query(
      'UPDATE incidents SET owner_user_id=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id',
      [tenantId, incidentId, ownerId],
    );
    if (!result.rowCount) throw new NotFoundException('Incident not found');
    await this.audit.record(tenantId, 'INCIDENT_OWNER_CHANGED', 'incident', incidentId, { ownerUserId: ownerId }, context);
    return this.get(tenantId, incidentId);
  }

  async setPublicVisibility(tenantId: string, incidentId: string, input: SetIncidentPublicVisibilityDto, context: AuditContext = {}) {
    const publicSummary = input.publicSummary?.trim() || null;
    if (input.visible && !publicSummary) throw new BadRequestException('A public summary is required before publishing an incident');
    const result = await this.db.query(
      `UPDATE incidents SET public_visible=$3,public_summary=$4,updated_at=now()
       WHERE tenant_id=$1 AND id=$2 RETURNING id`,
      [tenantId, incidentId, input.visible, publicSummary],
    );
    if (!result.rowCount) throw new NotFoundException('Incident not found');
    await this.audit.record(tenantId, 'INCIDENT_PUBLIC_VISIBILITY_CHANGED', 'incident', incidentId, { visible: input.visible, publicSummarySet: Boolean(publicSummary) }, context);
    return this.get(tenantId, incidentId);
  }

  async listMaintenanceWindows(tenantId: string) {
    const result = await this.db.query(
      `SELECT id,title,description,scope_type AS "scopeType",scope_id AS "scopeId",
              starts_at AS "startsAt",ends_at AS "endsAt",status,is_public AS "isPublic",
              public_summary AS "publicSummary",created_by AS "createdBy",created_at AS "createdAt",updated_at AS "updatedAt"
       FROM maintenance_windows WHERE tenant_id=$1
       ORDER BY starts_at DESC LIMIT 200`,
      [tenantId],
    );
    return { data: result.rows, count: result.rowCount ?? 0 };
  }

  async createMaintenanceWindow(tenantId: string, actorUserId: string, input: CreateMaintenanceWindowDto, context: AuditContext = {}) {
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) {
      throw new BadRequestException('Maintenance end time must be later than its start time');
    }
    if ((input.scopeType === 'TENANT' && input.scopeId) || (input.scopeType !== 'TENANT' && !input.scopeId)) {
      throw new BadRequestException('TENANT scope must not include a scopeId; SITE and ROUTER scopes require one');
    }
    if (input.scopeType === 'SITE') {
      const scope = await this.db.query('SELECT id FROM network_sites WHERE tenant_id=$1 AND id=$2', [tenantId, input.scopeId]);
      if (!scope.rowCount) throw new NotFoundException('Maintenance site was not found in this tenant');
    }
    if (input.scopeType === 'ROUTER') {
      const scope = await this.db.query('SELECT id FROM routers WHERE tenant_id=$1 AND id=$2', [tenantId, input.scopeId]);
      if (!scope.rowCount) throw new NotFoundException('Maintenance router was not found in this tenant');
    }
    const result = await this.db.query(
      `INSERT INTO maintenance_windows
        (tenant_id,title,description,scope_type,scope_id,starts_at,ends_at,is_public,public_summary,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id,title,description,scope_type AS "scopeType",scope_id AS "scopeId",
                 starts_at AS "startsAt",ends_at AS "endsAt",status,is_public AS "isPublic",
                 public_summary AS "publicSummary",created_by AS "createdBy",created_at AS "createdAt"`,
      [tenantId, input.title.trim(), input.description?.trim() || null, input.scopeType, input.scopeId ?? null,
       startsAt.toISOString(), endsAt.toISOString(), input.isPublic ?? false, input.publicSummary?.trim() || null, actorUserId],
    );
    await this.audit.record(tenantId, 'MAINTENANCE_WINDOW_CREATED', 'maintenance_window', result.rows[0].id, {
      scopeType: input.scopeType, scopeId: input.scopeId ?? null, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), isPublic: input.isPublic ?? false,
    }, context);
    return result.rows[0];
  }

  async cancelMaintenanceWindow(tenantId: string, id: string, context: AuditContext = {}) {
    const result = await this.db.query(
      `UPDATE maintenance_windows SET status='CANCELED',updated_at=now()
       WHERE tenant_id=$1 AND id=$2 AND status IN ('PLANNED','ACTIVE')
       RETURNING id,title,status`,
      [tenantId, id],
    );
    if (!result.rowCount) throw new NotFoundException('Planned or active maintenance window not found');
    await this.audit.record(tenantId, 'MAINTENANCE_WINDOW_CANCELED', 'maintenance_window', id, {}, context);
    return result.rows[0];
  }

  async getStatusPageSettings(tenantId: string) {
    const [settings, components] = await Promise.all([
      this.db.query(
        `SELECT slug,"display_name" AS "displayName",description,is_published AS "isPublished",updated_at AS "updatedAt"
         FROM status_page_settings WHERE tenant_id=$1`,
        [tenantId],
      ),
      this.db.query(
        `SELECT id,component_key AS "componentKey",name,status,public_summary AS "publicSummary",updated_at AS "updatedAt"
         FROM status_page_components WHERE tenant_id=$1 ORDER BY name`,
        [tenantId],
      ),
    ]);
    return { configured: Boolean(settings.rowCount), settings: settings.rows[0] ?? null, components: components.rows };
  }

  async updateStatusPageSettings(tenantId: string, actorUserId: string, input: UpdateStatusPageSettingsDto, context: AuditContext = {}) {
    try {
      const result = await this.db.query(
        `INSERT INTO status_page_settings (tenant_id,slug,display_name,description,is_published,updated_by,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,now())
         ON CONFLICT (tenant_id) DO UPDATE SET slug=EXCLUDED.slug,display_name=EXCLUDED.display_name,
           description=EXCLUDED.description,is_published=EXCLUDED.is_published,updated_by=EXCLUDED.updated_by,updated_at=now()
         RETURNING slug,display_name AS "displayName",description,is_published AS "isPublished",updated_at AS "updatedAt"`,
        [tenantId, input.slug.trim().toLowerCase(), input.displayName.trim(), input.description?.trim() || null, input.isPublished, actorUserId],
      );
      await this.audit.record(tenantId, 'STATUS_PAGE_SETTINGS_UPDATED', 'status_page', undefined, { slug: input.slug, isPublished: input.isPublished }, context);
      return result.rows[0];
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '23505') {
        throw new ConflictException('That public status-page slug is already in use');
      }
      throw error;
    }
  }

  async updateStatusPageComponent(tenantId: string, actorUserId: string, componentKey: string, input: UpdateStatusPageComponentDto, context: AuditContext = {}) {
    if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(componentKey)) throw new BadRequestException('Invalid component key');
    const result = await this.db.query(
      `INSERT INTO status_page_components (tenant_id,component_key,name,status,public_summary,updated_by,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,now())
       ON CONFLICT (tenant_id,component_key) DO UPDATE SET name=EXCLUDED.name,status=EXCLUDED.status,
         public_summary=EXCLUDED.public_summary,updated_by=EXCLUDED.updated_by,updated_at=now()
       RETURNING id,component_key AS "componentKey",name,status,public_summary AS "publicSummary",updated_at AS "updatedAt"`,
      [tenantId, componentKey, input.name.trim(), input.status, input.publicSummary?.trim() || null, actorUserId],
    );
    await this.audit.record(tenantId, 'STATUS_COMPONENT_UPDATED', 'status_page_component', result.rows[0].id, { componentKey, status: input.status }, context);
    return result.rows[0];
  }

  async getPublicStatus(slug: string) {
    const settings = await this.db.query(
      `SELECT tenant_id AS "tenantId",slug,display_name AS "displayName",description
       FROM status_page_settings WHERE slug=$1 AND is_published=true`,
      [slug.trim().toLowerCase()],
    );
    if (!settings.rowCount) throw new NotFoundException('Published status page not found');
    const tenantId = settings.rows[0].tenantId as string;
    const [components, incidents, maintenance] = await Promise.all([
      this.db.query(
        `SELECT component_key AS "componentKey",name,status,public_summary AS "summary"
         FROM status_page_components WHERE tenant_id=$1 ORDER BY name`,
        [tenantId],
      ),
      this.db.query(
        `SELECT id,COALESCE(NULLIF(public_summary,''),'Service incident') AS title,severity,status,
                started_at AS "startedAt",resolved_at AS "resolvedAt"
         FROM incidents WHERE tenant_id=$1 AND public_visible=true
           AND (status<>'RESOLVED' OR resolved_at>now()-interval '7 days')
         ORDER BY CASE status WHEN 'OPEN' THEN 0 WHEN 'ACKNOWLEDGED' THEN 1 ELSE 2 END,started_at DESC LIMIT 50`,
        [tenantId],
      ),
      this.db.query(
        `SELECT id,COALESCE(NULLIF(public_summary,''),'Scheduled maintenance') AS title,
                starts_at AS "startsAt",ends_at AS "endsAt",status
         FROM maintenance_windows WHERE tenant_id=$1 AND is_public=true
           AND status IN ('PLANNED','ACTIVE') AND ends_at>now()
         ORDER BY starts_at LIMIT 30`,
        [tenantId],
      ),
    ]);
    const activeIncidents = incidents.rows.filter(row => row.status !== 'RESOLVED');
    const activeMaintenance = maintenance.rows.some(row => row.status === 'ACTIVE' || new Date(row.startsAt).getTime() <= Date.now());
    const overallStatus = activeIncidents.some(row => row.severity === 'CRITICAL') ? 'MAJOR_OUTAGE'
       : activeMaintenance ? 'MAINTENANCE'
      : activeIncidents.length ? 'DEGRADED'
      : components.rows.some(row => row.status === 'MAJOR_OUTAGE') ? 'MAJOR_OUTAGE'
      : components.rows.some(row => row.status === 'PARTIAL_OUTAGE') ? 'PARTIAL_OUTAGE'
      : components.rows.some(row => row.status === 'DEGRADED') ? 'DEGRADED'
      : components.rows.some(row => row.status === 'MAINTENANCE') ? 'MAINTENANCE' : 'OPERATIONAL';
    return { slug: settings.rows[0].slug, displayName: settings.rows[0].displayName, description: settings.rows[0].description, overallStatus, components: components.rows, incidents: incidents.rows, maintenanceWindows: maintenance.rows, generatedAt: new Date().toISOString() };
  }

}
