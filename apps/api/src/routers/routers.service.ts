import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { PG_POOL } from '../database/database.module';
import { CreateRouterDto, RouterHeartbeatDto, UpdateRouterDto } from './routers.dto';

@Injectable()
export class RoutersService {
  constructor(@Inject(PG_POOL) private readonly db: Pool) {}

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

  async create(tenantId: string, input: CreateRouterDto) {
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
    return result.rows[0];
  }

  async update(tenantId: string, id: string, input: UpdateRouterDto) {
    await this.get(tenantId, id);
    if (input.locationId) {
      const location = await this.db.query(`SELECT id FROM locations WHERE tenant_id=$1 AND id=$2`, [tenantId, input.locationId]);
      if (!location.rowCount) throw new NotFoundException('Location not found');
    }
    const result = await this.db.query(
      `UPDATE routers SET
        name=COALESCE($3,name), vendor=COALESCE($4,vendor), model=COALESCE($5,model), ip_address=COALESCE($6,ip_address),
        mac_address=COALESCE($7,mac_address), os_version=COALESCE($8,os_version),
        location_id=CASE WHEN $9::uuid IS NULL THEN location_id ELSE $9 END,
        api_enabled=COALESCE($10,api_enabled), updated_at=now()
       WHERE tenant_id=$1 AND id=$2
       RETURNING id, name, vendor, model, ip_address AS "ipAddress", mac_address::text AS "macAddress",
                 os_version AS "osVersion", status, active_users AS "activeUsers", location_id AS "locationId",
                 last_seen_at AS "lastSeenAt", api_enabled AS "apiEnabled", api_endpoint AS "apiEndpoint",
                 sync_error AS "syncError", created_at AS "createdAt", updated_at AS "updatedAt"`,
      [tenantId, id, input.name?.trim() || null, input.vendor?.trim() || null, input.model?.trim() || null,
       input.ipAddress || null, input.macAddress?.trim() || null, input.osVersion?.trim() || null,
       input.locationId === null ? null : input.locationId ?? null, input.apiEnabled ?? null],
    );
    return result.rows[0];
  }

  async heartbeat(tenantId: string, id: string, input: RouterHeartbeatDto) {
    const status = input.status ?? 'ONLINE';
    const result = await this.db.query(
      `UPDATE routers SET status=$3, active_users=COALESCE($4,active_users), last_seen_at=now(), sync_error=NULL, updated_at=now()
       WHERE tenant_id=$1 AND id=$2
       RETURNING id, status, active_users AS "activeUsers", last_seen_at AS "lastSeenAt", updated_at AS "updatedAt"`,
      [tenantId, id, status, input.activeUsers ?? null],
    );
    if (!result.rowCount) throw new NotFoundException('Router not found');
    return result.rows[0];
  }

  async markOfflineStale(tenantId: string, staleMinutes = 5) {
    const minutes = Math.min(Math.max(Math.trunc(staleMinutes), 1), 1440);
    const result = await this.db.query(
      `UPDATE routers SET status='OFFLINE', updated_at=now()
       WHERE tenant_id=$1 AND status <> 'OFFLINE' AND (last_seen_at IS NULL OR last_seen_at < now() - ($2 * interval '1 minute'))
       RETURNING id, status, last_seen_at AS "lastSeenAt"`,
      [tenantId, minutes],
    );
    return { updated: result.rowCount ?? 0, data: result.rows };
  }

  async issueSyncToken(tenantId: string, id: string) {
    await this.get(tenantId, id);
    const token = randomUUID();
    return { routerId: id, token, expiresInSeconds: 900 };
  }
}
