import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditContext, AuditService } from '../audit/audit.service';
import { CreateRouterDto, RouterHeartbeatDto, UpdateRouterDto } from './routers.dto';

@Injectable()
export class RoutersService {
  constructor(
    @Inject(PG_POOL) private readonly db: Pool,
    private readonly audit: AuditService,
  ) {}

  async list(tenantId: string) {
    const result = await this.db.query(
      `SELECT id, name, vendor, model, ip_address AS "ipAddress", mac_address::text AS "macAddress",
              os_version AS "osVersion", status, active_users AS "activeUsers", location_id AS "locationId",
              last_seen_at AS "lastSeenAt", api_enabled AS "apiEnabled", api_endpoint AS "apiEndpoint",
              sync_error AS "syncError", created_at AS "createdAt", updated_at AS "updatedAt"
       FROM routers WHERE tenant_id=$1 ORDER BY created_at DESC`,
      [tenantId],
    );
    return { data: result.rows };
  }

  async get(tenantId: string, id: string) {
    const result = await this.db.query(
      `SELECT id, name, vendor, model, ip_address AS "ipAddress", mac_address::text AS "macAddress",
              os_version AS "osVersion", status, active_users AS "activeUsers", location_id AS "locationId",
              last_seen_at AS "lastSeenAt", api_enabled AS "apiEnabled", api_endpoint AS "apiEndpoint",
              sync_error AS "syncError", created_at AS "createdAt", updated_at AS "updatedAt"
       FROM routers WHERE tenant_id=$1 AND id=$2`,
      [tenantId, id],
    );
    if (!result.rowCount) throw new NotFoundException('Router not found');
    return result.rows[0];
  }

  async create(tenantId: string, input: CreateRouterDto, context: AuditContext = {}) {
    if (input.locationId) {
      const location = await this.db.query(`SELECT id FROM locations WHERE tenant_id=$1 AND id=$2`, [tenantId, input.locationId]);
      if (!location.rowCount) throw new NotFoundException('Location not found');
    }
    const result = await this.db.query(
      `INSERT INTO routers (tenant_id,name,vendor,model,ip_address,mac_address,os_version,location_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, name, vendor, model, ip_address AS "ipAddress", mac_address::text AS "macAddress",
                 os_version AS "osVersion", status, active_users AS "activeUsers", location_id AS "locationId",
                 last_seen_at AS "lastSeenAt", api_enabled AS "apiEnabled", api_endpoint AS "apiEndpoint",
                 sync_error AS "syncError", created_at AS "createdAt", updated_at AS "updatedAt"`,
      [tenantId, input.name.trim(), input.vendor?.trim() || null, input.model?.trim() || null, input.ipAddress || null,
       input.macAddress?.trim() || null, input.osVersion?.trim() || null, input.locationId || null],
    );
    const router = result.rows[0];
    await this.audit.record(tenantId, 'ROUTER_CREATED', 'router', router.id, { name: router.name }, context);
    return router;
  }

  async update(tenantId: string, id: string, input: UpdateRouterDto, context: AuditContext = {}) {
    await this.get(tenantId, id);
    if (input.locationId) {
      const location = await this.db.query(`SELECT id FROM locations WHERE tenant_id=$1 AND id=$2`, [tenantId, input.locationId]);
      if (!location.rowCount) throw new NotFoundException('Location not found');
    }
    const locationExpression = input.clearLocation ? 'NULL' : 'location_id';
    const result = await this.db.query(
      `UPDATE routers SET
        name=COALESCE($3,name), vendor=COALESCE($4,vendor), model=COALESCE($5,model), ip_address=COALESCE($6,ip_address),
        mac_address=COALESCE($7,mac_address), os_version=COALESCE($8,os_version),
        location_id=${locationExpression === 'NULL' ? 'NULL' : 'COALESCE($9,location_id)'},
        api_enabled=COALESCE($10,api_enabled), updated_at=now()
       WHERE tenant_id=$1 AND id=$2
       RETURNING id, name, vendor, model, ip_address AS "ipAddress", mac_address::text AS "macAddress",
                 os_version AS "osVersion", status, active_users AS "activeUsers", location_id AS "locationId",
                 last_seen_at AS "lastSeenAt", api_enabled AS "apiEnabled", api_endpoint AS "apiEndpoint",
                 sync_error AS "syncError", created_at AS "createdAt", updated_at AS "updatedAt"`,
      [tenantId, id, input.name?.trim() || null, input.vendor?.trim() || null, input.model?.trim() || null,
       input.ipAddress || null, input.macAddress?.trim() || null, input.osVersion?.trim() || null,
       input.locationId ?? null, input.apiEnabled ?? null],
    );
    const router = result.rows[0];
    await this.audit.record(tenantId, 'ROUTER_UPDATED', 'router', id, {
      changedFields: Object.keys(input),
      clearLocation: input.clearLocation === true,
    }, context);
    return router;
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
    await this.audit.record(tenantId, 'ROUTER_HEARTBEAT', 'router', id, {
      status,
      activeUsers: input.activeUsers,
    }, context);
    return result.rows[0];
  }

  async markOfflineStale(tenantId: string, staleMinutes = 5, context: AuditContext = {}) {
    const minutes = Math.min(Math.max(Math.trunc(staleMinutes), 1), 1440);
    const result = await this.db.query(
      `UPDATE routers SET status='OFFLINE', updated_at=now()
       WHERE tenant_id=$1 AND status <> 'OFFLINE' AND (last_seen_at IS NULL OR last_seen_at < now() - ($2 * interval '1 minute'))
       RETURNING id, status, last_seen_at AS "lastSeenAt"`,
      [tenantId, minutes],
    );
    if (result.rowCount) {
      await this.audit.record(tenantId, 'ROUTERS_MARKED_OFFLINE', 'router', undefined, {
        staleMinutes: minutes,
        routerIds: result.rows.map((row) => row.id),
        count: result.rowCount,
      }, context);
    }
    return { updated: result.rowCount ?? 0, data: result.rows };
  }
}
