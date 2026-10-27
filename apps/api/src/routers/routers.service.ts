import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditContext, AuditService } from '../audit/audit.service';
import { IncidentsService } from '../incidents/incidents.service';
import { NetworkCredentials, SecureNetworkCredentials } from '../common/secure-network-credentials';
import { CreateRouterDto, NetworkManagementProtocol, RouterHeartbeatDto, UpdateRouterDto } from './routers.dto';
import { WORLDWIDE_NETWORK_CAPABILITIES } from '../modules/traffic/network-capabilities';

@Injectable()
export class RoutersService {
  constructor(
    @Inject(PG_POOL) private readonly db: Pool,
    private readonly audit: AuditService,
    private readonly secureCredentials: SecureNetworkCredentials,
    private readonly incidents: IncidentsService,
  ) {}

  private readonly selectRouter = `SELECT id, name, vendor, model, ip_address AS "ipAddress", mac_address::text AS "macAddress",
              os_version AS "osVersion", status, active_users AS "activeUsers", location_id AS "locationId",
              last_seen_at AS "lastSeenAt", api_enabled AS "apiEnabled", api_endpoint AS "apiEndpoint",
              management_protocol AS "managementProtocol", management_enabled AS "managementEnabled",
              controller_endpoint AS "controllerEndpoint", capabilities,
              (management_credentials_encrypted IS NOT NULL) AS "managementCredentialsConfigured",
              sync_error AS "syncError", created_at AS "createdAt", updated_at AS "updatedAt"
       FROM routers`;

  private capabilityMetadata(vendor?: string, protocol?: NetworkManagementProtocol) {
    const normalizedVendor = vendor?.trim().toLowerCase();
    const match = WORLDWIDE_NETWORK_CAPABILITIES.find((item) => normalizedVendor && item.vendor.toLowerCase() === normalizedVendor);
    if (match) return { vendor: match.vendor, protocols: match.protocols, integrationModes: match.integrationModes, deviceFamilies: match.deviceFamilies, capabilities: match.capabilities, notes: match.notes };
    return protocol ? { protocol, capabilities: [] } : {};
  }

  private resolveManagementProtocol(vendor?: string, requested?: NetworkManagementProtocol): NetworkManagementProtocol {
    if (requested) return requested;
    const normalized = vendor?.trim().toLowerCase() ?? '';
    if (normalized.includes('mikrotik')) return 'MIKROTIK_REST';
    if (normalized.includes('ubiquiti') || normalized.includes('unifi')) return 'UNIFI_NETWORK_API';
    if (normalized.includes('cisco')) return 'CISCO_NETCONF_RESTCONF';
    if (normalized.includes('huawei')) return 'HUAWEI_NETCONF_RESTCONF';
    if (normalized.includes('aruba')) return normalized.includes('central') ? 'ARUBA_CENTRAL_API' : 'ARUBA_AOS_CX_NETCONF';
    if (normalized.includes('tp-link') || normalized.includes('omada')) return 'OMADA_CONTROLLER_API';
    if (normalized.includes('cambium')) return 'CAMBIUM_CNMAESTRO';
    if (normalized.includes('meraki')) return 'MERAKI_DASHBOARD_API';
    if (normalized.includes('aruba')) return 'ARUBA_CENTRAL_API';
    if (normalized.includes('grandstream')) return 'GRANDSTREAM_GWN_API';
    if (normalized.includes('ruijie') || normalized.includes('reyee')) return 'RUIJIE_REYEE_CLOUD_API';
    if (normalized.includes('ruckus')) return 'RUCKUS_SMARTZONE_API';
    if (normalized.includes('openwrt')) return 'OPENWRT_UBUS';
    if (normalized.includes('teltonika')) return 'TELTONIKA_RMS_API';
    if (normalized.includes('peplink') || normalized.includes('pepwave')) return 'PEPLINK_INCONTROL_API';
    if (normalized.includes('pfsense') || normalized.includes('opnsense')) return 'PFSENSE_API';
    return 'GENERIC_HTTP';
  }

  private encryptCredentials(credentials: CreateRouterDto['managementCredentials'] | UpdateRouterDto['managementCredentials']): string | null {
    if (!credentials) return null;
    const entries = Object.entries(credentials).filter(([, value]) => value !== undefined);
    if (!entries.length || entries.some(([, value]) => typeof value !== 'string' || value.length === 0)) {
      throw new BadRequestException('Management credentials must contain at least one non-empty credential value');
    }
    return this.secureCredentials.encrypt(credentials as NetworkCredentials);
  }

  async list(tenantId: string) {
    const result = await this.db.query(`${this.selectRouter} WHERE tenant_id=$1 ORDER BY created_at DESC`, [tenantId]);
    return { data: result.rows };
  }

  async get(tenantId: string, id: string) {
    const result = await this.db.query(`${this.selectRouter} WHERE tenant_id=$1 AND id=$2`, [tenantId, id]);
    if (!result.rowCount) throw new NotFoundException('Router not found');
    return result.rows[0];
  }

  async create(tenantId: string, input: CreateRouterDto, context: AuditContext = {}) {
    if (input.locationId) {
      const location = await this.db.query(`SELECT id FROM locations WHERE tenant_id=$1 AND id=$2`, [tenantId, input.locationId]);
      if (!location.rowCount) throw new NotFoundException('Location not found');
    }
    const managementProtocol = this.resolveManagementProtocol(input.vendor, input.managementProtocol);
    const capabilities = this.capabilityMetadata(input.vendor, managementProtocol);
    const encryptedCredentials = this.encryptCredentials(input.managementCredentials);
    const result = await this.db.query(
      `INSERT INTO routers (tenant_id,name,vendor,model,ip_address,mac_address,os_version,location_id,api_endpoint,
                            management_protocol,management_enabled,controller_endpoint,capabilities,management_credentials_encrypted)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,COALESCE($11,true),$12,$13::jsonb,$14)
       RETURNING id, name, vendor, model, ip_address AS "ipAddress", mac_address::text AS "macAddress",
                 os_version AS "osVersion", status, active_users AS "activeUsers", location_id AS "locationId",
                 last_seen_at AS "lastSeenAt", api_enabled AS "apiEnabled", api_endpoint AS "apiEndpoint",
                 management_protocol AS "managementProtocol", management_enabled AS "managementEnabled",
                 controller_endpoint AS "controllerEndpoint", capabilities,
                 (management_credentials_encrypted IS NOT NULL) AS "managementCredentialsConfigured",
                 sync_error AS "syncError", created_at AS "createdAt", updated_at AS "updatedAt"`,
      [tenantId, input.name.trim(), input.vendor?.trim() || null, input.model?.trim() || null, input.ipAddress || null,
       input.macAddress?.trim() || null, input.osVersion?.trim() || null, input.locationId || null, input.apiEndpoint?.trim() || null,
       managementProtocol, input.managementEnabled ?? null, input.controllerEndpoint?.trim() || null, JSON.stringify(capabilities), encryptedCredentials],
    );
    const router = result.rows[0];
    await this.audit.record(tenantId, 'ROUTER_CREATED', 'router', router.id, {
      name: router.name, apiConfigured: Boolean(router.apiEndpoint), managementProtocol: router.managementProtocol,
      capabilityCount: Array.isArray(router.capabilities?.capabilities) ? router.capabilities.capabilities.length : 0,
      credentialsConfigured: Boolean(encryptedCredentials),
    }, context);
    return router;
  }

  async update(tenantId: string, id: string, input: UpdateRouterDto, context: AuditContext = {}) {
    const existing = await this.get(tenantId, id);
    if (input.locationId) {
      const location = await this.db.query(`SELECT id FROM locations WHERE tenant_id=$1 AND id=$2`, [tenantId, input.locationId]);
      if (!location.rowCount) throw new NotFoundException('Location not found');
    }
    if (input.clearManagementCredentials && input.managementCredentials) {
      throw new BadRequestException('clearManagementCredentials cannot be combined with managementCredentials');
    }
    const locationExpression = input.clearLocation ? 'NULL' : 'COALESCE($9,location_id)';
    const nextVendor = input.vendor ?? existing.vendor;
    const nextProtocol = input.managementProtocol ?? (input.vendor ? this.resolveManagementProtocol(nextVendor) : this.resolveManagementProtocol(nextVendor, existing.managementProtocol));
    const capabilities = this.capabilityMetadata(nextVendor, nextProtocol);
    const hasCatalogMetadata = Object.keys(capabilities).length > 0;
    const encryptedCredentials = this.encryptCredentials(input.managementCredentials);
    const credentialExpression = input.clearManagementCredentials ? 'NULL' : (input.managementCredentials ? '$17' : 'management_credentials_encrypted');
    const result = await this.db.query(
      `UPDATE routers SET
        name=COALESCE($3,name), vendor=COALESCE($4,vendor), model=COALESCE($5,model), ip_address=COALESCE($6,ip_address),
        mac_address=COALESCE($7,mac_address), os_version=COALESCE($8,os_version),
        location_id=${locationExpression}, api_enabled=COALESCE($10,api_enabled), api_endpoint=COALESCE($11,api_endpoint),
        management_protocol=COALESCE($12,management_protocol), management_enabled=COALESCE($13,management_enabled),
        controller_endpoint=COALESCE($14,controller_endpoint),
        capabilities=CASE WHEN $15::boolean THEN $16::jsonb ELSE capabilities END,
        management_credentials_encrypted=${credentialExpression}, updated_at=now()
       WHERE tenant_id=$1 AND id=$2
       RETURNING id, name, vendor, model, ip_address AS "ipAddress", mac_address::text AS "macAddress",
                 os_version AS "osVersion", status, active_users AS "activeUsers", location_id AS "locationId",
                 last_seen_at AS "lastSeenAt", api_enabled AS "apiEnabled", api_endpoint AS "apiEndpoint",
                 management_protocol AS "managementProtocol", management_enabled AS "managementEnabled",
                 controller_endpoint AS "controllerEndpoint", capabilities,
                 (management_credentials_encrypted IS NOT NULL) AS "managementCredentialsConfigured",
                 sync_error AS "syncError", created_at AS "createdAt", updated_at AS "updatedAt"`,
      [tenantId, id, input.name?.trim() || null, input.vendor?.trim() || null, input.model?.trim() || null,
       input.ipAddress || null, input.macAddress?.trim() || null, input.osVersion?.trim() || null, input.locationId ?? null,
       input.apiEnabled ?? null, input.apiEndpoint?.trim() || null, nextProtocol, input.managementEnabled ?? null,
       input.controllerEndpoint?.trim() || null, hasCatalogMetadata, JSON.stringify(capabilities), encryptedCredentials],
    );
    const router = result.rows[0];
    await this.audit.record(tenantId, 'ROUTER_UPDATED', 'router', id, {
      changedFields: Object.keys(input), clearLocation: input.clearLocation === true,
      apiConfigured: Boolean(router.apiEndpoint), managementProtocol: router.managementProtocol,
      credentialsConfigured: Boolean(router.managementCredentialsConfigured),
    }, context);
    return router;
  }

  async changeIntelligence(tenantId: string, routerId?: string, limit = 100) {
    if (routerId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(routerId)) throw new BadRequestException('Invalid router ID');
    const safeLimit = Math.min(Math.max(Math.trunc(limit || 100), 1), 500);
    const result = await this.db.query(
      `SELECT e.id,e.router_id AS "routerId",r.name AS "routerName",e.source_type AS "sourceType",
              e.source_id AS "sourceId",e.change_type AS "changeType",e.correlation_id AS "correlationId",
              e.before_state AS "beforeState",e.after_state AS "afterState",e.details,e.occurred_at AS "occurredAt",
              i.id AS "relatedIncidentId",i.title AS "relatedIncidentTitle",i.severity AS "incidentSeverity",
              i.status AS "incidentStatus",
              CASE WHEN i.id IS NULL THEN false ELSE true END AS "temporalCorrelation",
              CASE WHEN i.id IS NULL THEN NULL ELSE
                ABS(EXTRACT(EPOCH FROM (i.started_at-e.occurred_at)))::int END AS "distanceSeconds",
              '30 minutes' AS "correlationWindow",
              false AS "causationProven"
       FROM network_change_events e
       JOIN routers r ON r.tenant_id=e.tenant_id AND r.id=e.router_id
       LEFT JOIN incidents i ON i.tenant_id=e.tenant_id AND i.root_resource_type='ROUTER'
         AND i.root_resource_id=e.router_id
         AND i.started_at BETWEEN e.occurred_at-interval '30 minutes' AND e.occurred_at+interval '30 minutes'
       WHERE e.tenant_id=$1 AND ($2::uuid IS NULL OR e.router_id=$2)
       ORDER BY e.occurred_at DESC LIMIT $3`,
      [tenantId, routerId ?? null, safeLimit],
    );
    return { data: result.rows, count: result.rowCount ?? 0, semantics: 'Temporal correlation is investigative evidence, not proof of causation.' };
  }

  async rotateCredentials(tenantId: string, context: AuditContext = {}) {
    const activeKeyId = this.secureCredentials.activeKeyId();
    const client = await this.db.connect();
    let rotatedCount = 0;
    try {
      await client.query('BEGIN');
      const rows = await client.query<{ id: string; management_credentials_encrypted: string }>(
        `SELECT id, management_credentials_encrypted
         FROM routers
         WHERE tenant_id=$1 AND management_credentials_encrypted IS NOT NULL
         ORDER BY id
         FOR UPDATE`,
        [tenantId],
      );
      for (const row of rows.rows) {
        const plaintext = this.secureCredentials.decrypt(row.management_credentials_encrypted);
        const ciphertext = this.secureCredentials.encrypt(plaintext);
        await client.query(
          `UPDATE routers
           SET management_credentials_encrypted=$3, management_credentials_version=2, updated_at=now()
           WHERE tenant_id=$1 AND id=$2`,
          [tenantId, row.id, ciphertext],
        );
        rotatedCount += 1;
      }

      // Insert the audit event in the same transaction as the rotation. The
      // database trigger appends its tamper-evident hash and raises a security alert.
      await client.query(
        `INSERT INTO audit_logs
          (tenant_id,actor_user_id,action,resource_type,request_id,correlation_id,ip_address,user_agent,metadata)
         VALUES ($1,$2,'ROUTER_CREDENTIALS_ROTATED','router_credentials',$3,$4,$5,$6,$7::jsonb)`,
        [tenantId, context.userId ?? null, context.requestId ?? null, context.correlationId ?? null,
         context.ipAddress ?? null, context.userAgent ?? null, JSON.stringify({ rotatedCount, activeKeyId })],
      );
      await client.query('COMMIT');
      return { rotatedCount, activeKeyId, completed: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async heartbeat(tenantId: string, id: string, input: RouterHeartbeatDto, context: AuditContext = {}) {
    const status = input.status ?? 'ONLINE';
    const result = await this.db.query(
      `UPDATE routers SET status=$3, active_users=COALESCE($4,active_users), last_seen_at=now(), sync_error=NULL, updated_at=now()
       WHERE tenant_id=$1 AND id=$2
       RETURNING id, status, active_users AS "activeUsers", last_seen_at AS "lastSeenAt", updated_at AS "updatedAt"`,
      [tenantId, id, status, input.activeUsers ?? null],
    );
    if (!result.rowCount) throw new NotFoundException('Router not found');
    if (status === 'ONLINE') await this.incidents.resolveRouterOffline(tenantId, id, context);
    await this.audit.record(tenantId, 'ROUTER_HEARTBEAT', 'router', id, { status, activeUsers: input.activeUsers }, context);
    return result.rows[0];
  }

  async markOfflineStale(tenantId: string, staleMinutes = 5, context: AuditContext = {}) {
    if (!Number.isFinite(staleMinutes)) throw new BadRequestException('staleMinutes must be a finite number');
    const minutes = Math.min(Math.max(Math.trunc(staleMinutes), 1), 1440);
    const result = await this.db.query(
      `UPDATE routers SET status='OFFLINE', updated_at=now()
       WHERE tenant_id=$1 AND status <> 'OFFLINE' AND (last_seen_at IS NULL OR last_seen_at < now() - ($2 * interval '1 minute'))
       RETURNING id, status, last_seen_at AS "lastSeenAt"`,
      [tenantId, minutes],
    );
    for (const router of result.rows) {
      await this.incidents.syncRouterOffline(tenantId, router.id, context);
    }
    if (result.rowCount) await this.audit.record(tenantId, 'ROUTERS_MARKED_OFFLINE', 'router', undefined, {
      staleMinutes: minutes, routerIds: result.rows.map((row) => row.id), count: result.rowCount,
    }, context);
    return { updated: result.rowCount ?? 0, data: result.rows };
  }
}
