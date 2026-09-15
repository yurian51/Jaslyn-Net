import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditContext, AuditService } from '../audit/audit.service';
import { StartSessionDto, UpdateSessionUsageDto } from './sessions.dto';

type DatabaseError = { code?: string };
type SessionStatus = 'ACTIVE' | 'STALE' | 'ENDED';

@Injectable()
export class SessionsService {
  constructor(
    @Inject(PG_POOL) private readonly db: Pool,
    private readonly audit: AuditService,
  ) {}

  async list(tenantId: string, status?: SessionStatus, limit = 100) {
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

  private async resetRouterActiveUsers(client: PoolClient, tenantId: string, routerIds: string[]) {
    const uniqueRouterIds = [...new Set(routerIds.filter(Boolean))];
    if (!uniqueRouterIds.length) return;
    await client.query(
      `UPDATE routers r
       SET active_users = (
         SELECT count(*)::int FROM sessions s
         WHERE s.tenant_id=$1 AND s.router_id=r.id AND s.status='ACTIVE'
       ), updated_at=now()
       WHERE r.tenant_id=$1 AND r.id = ANY($2::uuid[])`,
      [tenantId, uniqueRouterIds],
    );
  }

  async start(tenantId: string, input: StartSessionDto, auditContext: AuditContext = {}) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      if (input.customerId) {
        const customer = await client.query('SELECT id FROM customers WHERE tenant_id=$1 AND id=$2 AND is_active=true FOR SHARE', [tenantId, input.customerId]);
        if (!customer.rowCount) throw new NotFoundException('Customer not found');
      }
      if (input.routerId) {
        const router = await client.query('SELECT id FROM routers WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [tenantId, input.routerId]);
        if (!router.rowCount) throw new NotFoundException('Router not found');
      }
      try {
        const result = await client.query(
          `INSERT INTO sessions (tenant_id, customer_id, router_id, username, ip_address, mac_address)
           VALUES ($1,$2,$3,$4,$5,$6)
           RETURNING id, customer_id AS "customerId", router_id AS "routerId", username,
                     ip_address AS "ipAddress", mac_address::text AS "macAddress", started_at AS "startedAt",
                     status, bytes_in AS "bytesIn", bytes_out AS "bytesOut", bytes_total AS "bytesTotal"`,
          [tenantId, input.customerId ?? null, input.routerId ?? null, input.username?.trim() || null, input.ipAddress ?? null, input.macAddress ?? null],
        );
        const session = result.rows[0];
        await this.resetRouterActiveUsers(client, tenantId, input.routerId ? [input.routerId] : []);
        await client.query('COMMIT');
        await this.audit.record(tenantId, 'SESSION_STARTED', 'session', session.id, { routerId: session.routerId, customerId: session.customerId }, auditContext);
        return session;
      } catch (error: unknown) {
        await client.query('ROLLBACK');
        if ((error as DatabaseError)?.code === '23505') throw new ConflictException('An active session already exists for this device on this router');
        throw error;
      }
    } catch (error: unknown) {
      try { await client.query('ROLLBACK'); } catch { /* transaction may already be rolled back */ }
      throw error;
    } finally {
      client.release();
    }
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

  async end(tenantId: string, id: string, auditContext: AuditContext = {}) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query<{ status: SessionStatus }>(
        `SELECT status FROM sessions WHERE tenant_id=$1 AND id=$2 AND status IN ('ACTIVE','STALE') FOR UPDATE`,
        [tenantId, id],
      );
      if (!current.rowCount) throw new NotFoundException('Active or stale session not found');
      const previousState = current.rows[0].status;
      const result = await client.query(
        `UPDATE sessions SET status='ENDED', ended_at=COALESCE(ended_at,now())
         WHERE tenant_id=$1 AND id=$2
         RETURNING id, router_id AS "routerId", ended_at AS "endedAt", bytes_in AS "bytesIn", bytes_out AS "bytesOut", bytes_total AS "bytesTotal", status`,
        [tenantId, id],
      );
      await this.resetRouterActiveUsers(client, tenantId, result.rows[0].routerId ? [result.rows[0].routerId] : []);
      await client.query('COMMIT');
      await this.audit.record(tenantId, 'SESSION_ENDED', 'session', id, { bytesIn: result.rows[0].bytesIn, bytesOut: result.rows[0].bytesOut, previousState }, auditContext);
      return result.rows[0];
    } catch (error: unknown) {
      try { await client.query('ROLLBACK'); } catch { /* transaction may already be rolled back */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async reconcileStale(tenantId: string, staleMinutes = 30) {
    const minutes = Math.min(Math.max(Math.trunc(staleMinutes), 5), 1440);
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `UPDATE sessions s
         SET status='STALE', ended_at=NULL
         WHERE s.tenant_id=$1
           AND s.status='ACTIVE'
           AND (
             (s.router_id IS NOT NULL AND EXISTS (
               SELECT 1 FROM routers r
               WHERE r.tenant_id=s.tenant_id AND r.id=s.router_id
                 AND r.status='OFFLINE'
                 AND (r.last_seen_at IS NULL OR r.last_seen_at < now() - ($2 * interval '1 minute'))
             ))
             OR NOT EXISTS (
               SELECT 1 FROM traffic_samples ts
               WHERE ts.tenant_id=s.tenant_id AND ts.session_id=s.id
                 AND ts.sampled_at >= now() - ($2 * interval '1 minute')
             )
           )
         RETURNING s.id, s.router_id AS "routerId", s.started_at AS "startedAt"`,
        [tenantId, minutes],
      );
      await this.resetRouterActiveUsers(client, tenantId, result.rows.map((row) => row.routerId).filter(Boolean));
      await client.query('COMMIT');
      return { updated: result.rowCount ?? 0, data: result.rows };
    } catch (error: unknown) {
      try { await client.query('ROLLBACK'); } catch { /* transaction may already be rolled back */ }
      throw error;
    } finally {
      client.release();
    }
  }
}
