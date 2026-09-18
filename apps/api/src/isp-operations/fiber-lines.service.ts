import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { CreateFiberLineDto, FiberServiceStatus, ListQueryDto } from './isp-operations.dto';

@Injectable()
export class FiberLinesService {
  constructor(@Inject(PG_POOL) private readonly db: Pool) {}

  async list(tenantId: string, query: ListQueryDto) {
    const offset = (query.page - 1) * query.limit;
    const search = query.search?.trim() || null;
    const [data, count] = await Promise.all([
      this.db.query(`SELECT f.id,f.customer_id AS "customerId",c.full_name AS "customerName",f.location_id AS "locationId",f.router_id AS "routerId",f.name,f.technology,f.service_status AS "serviceStatus",f.upstream_bps AS "upstreamBps",f.downstream_bps AS "downstreamBps",f.installation_address AS "installationAddress",f.notes,f.created_at AS "createdAt",f.updated_at AS "updatedAt" FROM fiber_lines f LEFT JOIN customers c ON c.tenant_id=f.tenant_id AND c.id=f.customer_id WHERE f.tenant_id=$1 AND ($2::text IS NULL OR f.name ILIKE '%'||$2||'%' OR c.full_name ILIKE '%'||$2||'%') ORDER BY f.created_at DESC LIMIT $3 OFFSET $4`, [tenantId, search, query.limit, offset]),
      this.db.query(`SELECT COUNT(*)::int AS count FROM fiber_lines f LEFT JOIN customers c ON c.tenant_id=f.tenant_id AND c.id=f.customer_id WHERE f.tenant_id=$1 AND ($2::text IS NULL OR f.name ILIKE '%'||$2||'%' OR c.full_name ILIKE '%'||$2||'%')`, [tenantId, search]),
    ]);
    const total = count.rows[0]?.count ?? 0;
    return { data: data.rows, pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) } };
  }

  async create(tenantId: string, input: CreateFiberLineDto) {
    if (!input.customerId && !input.locationId) throw new ConflictException('Fiber line requires a customer or location');
    try {
      const result = await this.db.query(`INSERT INTO fiber_lines (tenant_id,customer_id,location_id,router_id,name,technology,service_status,upstream_bps,downstream_bps,installation_address,notes) VALUES ($1,$2,$3,$4,$5,COALESCE($6,'FIBER'),COALESCE($7,'PLANNED'),$8,$9,$10,$11) RETURNING id,customer_id AS "customerId",location_id AS "locationId",router_id AS "routerId",name,technology,service_status AS "serviceStatus",upstream_bps AS "upstreamBps",downstream_bps AS "downstreamBps",installation_address AS "installationAddress",notes,created_at AS "createdAt",updated_at AS "updatedAt"`, [tenantId, input.customerId ?? null, input.locationId ?? null, input.routerId ?? null, input.name.trim(), input.technology?.trim() || null, input.serviceStatus ?? null, input.upstreamBps ?? null, input.downstreamBps ?? null, input.installationAddress?.trim() || null, input.notes?.trim() || null]);
      return result.rows[0];
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '23503') throw new NotFoundException('Referenced customer, location, or router was not found');
      throw error;
    }
  }

  async setStatus(tenantId: string, id: string, status: FiberServiceStatus, actorUserId: string, reason: string) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query<{ service_status: FiberServiceStatus }>('SELECT service_status FROM fiber_lines WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [tenantId, id]);
      if (!current.rowCount) throw new NotFoundException('Fiber line not found');
      const previous = current.rows[0].service_status;
      if (previous === status) {
        await client.query('COMMIT');
        return { id, serviceStatus: status, changed: false };
      }
      const result = await client.query(`UPDATE fiber_lines SET service_status=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,service_status AS "serviceStatus",updated_at AS "updatedAt"`, [tenantId, id, status]);
      await client.query(`INSERT INTO fiber_line_events (tenant_id,fiber_line_id,previous_status,new_status,reason,source,actor_user_id) VALUES ($1,$2,$3,$4,$5,'API',$6)`, [tenantId, id, previous, status, reason.trim(), actorUserId]);
      await client.query('COMMIT');
      return { ...result.rows[0], changed: true };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async events(tenantId: string, id: string) {
    const line = await this.db.query('SELECT 1 FROM fiber_lines WHERE tenant_id=$1 AND id=$2', [tenantId, id]);
    if (!line.rowCount) throw new NotFoundException('Fiber line not found');
    const result = await this.db.query(`SELECT id,previous_status AS "previousStatus",new_status AS "newStatus",reason,source,actor_user_id AS "actorUserId",created_at AS "createdAt" FROM fiber_line_events WHERE tenant_id=$1 AND fiber_line_id=$2 ORDER BY created_at DESC`, [tenantId, id]);
    return result.rows;
  }
}
