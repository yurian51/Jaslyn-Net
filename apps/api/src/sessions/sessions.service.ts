import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditService } from '../audit/audit.service';
import { StartSessionDto, UpdateSessionUsageDto } from './sessions.dto';

@Injectable()
export class SessionsService {
  constructor(
    @Inject(PG_POOL) private readonly db: Pool,
    private readonly audit: AuditService,
  ) {}

  async list(tenantId: string, status?: 'ACTIVE' | 'ENDED', limit = 100) {
    const safeLimit = Math.min(Math.max(Math.trunc(limit || 100), 1), 500);
    const result = await this.db.query(
      `SELECT id, customer_id AS "customerId", router_id AS "routerId", username,
              ip_address AS "ipAddress", mac_address::text AS "macAddress",
              started_at AS "startedAt", ended_at AS "endedAt", bytes_in AS "bytesIn",
              bytes_out AS "bytesOut", bytes_total AS "bytesTotal", status, created_at AS "createdAt"
       FROM sessions
       WHERE tenant_id=$1 AND ($2::text IS NULL OR status=$2)
       ORDER BY started_at DESC LIMIT $3`,
      [tenantId, status ?? null, safeLimit],
    );
    return { data: result.rows, count: result.rowCount ?? 0 };
  }

  async get(tenantId: string, id: string) {
    const result = await this.db.query(
      `SELECT id, customer_id AS "customerId", router_id AS "routerId", username,
              ip_address AS "ipAddress", mac_address::text AS "macAddress",
              started_at AS "startedAt", ended_at AS "endedAt", bytes_in AS "bytesIn",
              bytes_out AS "bytesOut", bytes_total AS "bytesTotal", status, created_at AS "createdAt"
       FROM sessions WHERE tenant_id=$1 AND id=$2`,
      [tenantId, id],
    );
    if (!result.rowCount) throw new NotFoundException('Session not found');
    return result.rows[0];
  }

  async start(tenantId: string, input: StartSessionDto, auditContext = {}) {
    if (input.customerId) {
      const customer = await this.db.query('SELECT id FROM customers WHERE tenant_id=$1 AND id=$2 AND is_active=true', [tenantId, input.customerId]);
      if (!customer.rowCount) throw new NotFoundException('Customer not found');
    }
    if (input.routerId) {
      const router = await this.db.query('SELECT id FROM routers WHERE tenant_id=$1 AND id=$2', [tenantId, input.routerId]);
      if (!router.rowCount) throw new NotFoundException('Router not found');
    }
    const result = await this.db.query(
      `INSERT INTO sessions (tenant_id, customer_id, router_id, username, ip_address, mac_address)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, customer_id AS "customerId", router_id AS "routerId", username,
                 ip_address AS "ipAddress", mac_address::text AS "macAddress", started_at AS "startedAt",
                 status, bytes_in AS "bytesIn", bytes_out AS "bytesOut", bytes_total AS "bytesTotal"`,
      [tenantId, input.customerId ?? null, input.routerId ?? null, input.username?.trim() || null, input.ipAddress ?? null, input.macAddress ?? null],
    );
    const session = result.rows[0];
    await this.audit.record(tenantId, 'SESSION_STARTED', 'session', session.id, { routerId: session.routerId, customerId: session.customerId }, auditContext);
    return session;
  }

  async updateUsage(tenantId: string, id: string, input: UpdateSessionUsageDto) {
    const result = await this.db.query(
      `UPDATE sessions SET bytes_in=COALESCE($3,bytes_in), bytes_out=COALESCE($4,bytes_out)
       WHERE tenant_id=$1 AND id=$2 AND status='ACTIVE'
       RETURNING id, bytes_in AS "bytesIn", bytes_out AS "bytesOut", bytes_total AS "bytesTotal", status`,
      [tenantId, id, input.bytesIn ?? null, input.bytesOut ?? null],
    );
    if (!result.rowCount) throw new NotFoundException('Active session not found');
    return result.rows[0];
  }

  async end(tenantId: string, id: string, auditContext = {}) {
    const result = await this.db.query(
      `UPDATE sessions SET status='ENDED', ended_at=COALESCE(ended_at,now())
       WHERE tenant_id=$1 AND id=$2 AND status='ACTIVE'
       RETURNING id, ended_at AS "endedAt", bytes_in AS "bytesIn", bytes_out AS "bytesOut", bytes_total AS "bytesTotal", status`,
      [tenantId, id],
    );
    if (!result.rowCount) throw new NotFoundException('Active session not found');
    await this.audit.record(tenantId, 'SESSION_ENDED', 'session', id, { bytesIn: result.rows[0].bytesIn, bytesOut: result.rows[0].bytesOut }, auditContext);
    return result.rows[0];
  }

  async reconcileStale(tenantId: string, staleMinutes = 30) {
    const minutes = Math.min(Math.max(Math.trunc(staleMinutes), 5), 1440);
    const result = await this.db.query(
      `UPDATE sessions SET status='ENDED', ended_at=COALESCE(ended_at,now())
       WHERE tenant_id=$1 AND status='ACTIVE' AND started_at < now() - ($2 * interval '1 minute')
       RETURNING id, ended_at AS "endedAt"`,
      [tenantId, minutes],
    );
    return { updated: result.rowCount ?? 0, data: result.rows };
  }
}
