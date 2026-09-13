import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/database.module';
import { calculateThroughput } from './traffic.measurement';

export interface RecordTrafficSampleInput {
  routerId: string;
  customerId?: string;
  sessionId?: string;
  bytesIn: string | number;
  bytesOut: string | number;
  sampledAt: Date;
}

@Injectable()
export class TrafficSamplesService {
  constructor(@Inject(PG_POOL) private readonly db: Pool) {}

  async record(tenantId: string, input: RecordTrafficSampleInput) {
    const bytesIn = this.nonNegativeCounter(input.bytesIn, 'bytesIn');
    const bytesOut = this.nonNegativeCounter(input.bytesOut, 'bytesOut');
    if (!input.customerId && !input.sessionId) throw new BadRequestException('customerId or sessionId is required');
    if (!(input.sampledAt instanceof Date) || Number.isNaN(input.sampledAt.getTime())) throw new BadRequestException('sampledAt must be a valid date');

    const result = await this.db.query(
      `INSERT INTO traffic_samples
        (tenant_id, router_id, customer_id, session_id, bytes_in, bytes_out, sampled_at)
       SELECT $1, r.id, c.id, s.id, $4::bigint, $5::bigint, $6
       FROM routers r
       LEFT JOIN customers c ON c.tenant_id=$1 AND c.id=$2
       LEFT JOIN sessions s ON s.tenant_id=$1 AND s.id=$3
       WHERE r.tenant_id=$1 AND r.id=$7
         AND ($2::uuid IS NULL OR c.id IS NOT NULL)
         AND ($3::uuid IS NULL OR s.id IS NOT NULL)
         AND ($3::uuid IS NULL OR s.router_id=r.id)
         AND ($2::uuid IS NULL OR $3::uuid IS NULL OR s.customer_id=c.id)
       ON CONFLICT (tenant_id, session_id, sampled_at)
       WHERE session_id IS NOT NULL
       DO UPDATE SET bytes_in=EXCLUDED.bytes_in, bytes_out=EXCLUDED.bytes_out, customer_id=EXCLUDED.customer_id
       RETURNING id, router_id AS "routerId", customer_id AS "customerId", session_id AS "sessionId",
                 bytes_in::text AS "bytesIn", bytes_out::text AS "bytesOut", sampled_at AS "sampledAt", created_at AS "createdAt"`,
      [tenantId, input.customerId ?? null, input.sessionId ?? null, bytesIn, bytesOut, input.sampledAt, input.routerId],
    );

    if (!result.rowCount) throw new NotFoundException('Router, customer, or session not found');
    return result.rows[0];
  }

  async throughput(tenantId: string, sessionId: string, sampledAt?: Date) {
    const latest = await this.db.query(
      `SELECT bytes_in::text AS "bytesIn", bytes_out::text AS "bytesOut", sampled_at AS "sampledAt"
       FROM traffic_samples
       WHERE tenant_id=$1 AND session_id=$2
         AND ($3::timestamptz IS NULL OR sampled_at <= $3)
       ORDER BY sampled_at DESC LIMIT 2`,
      [tenantId, sessionId, sampledAt ?? null],
    );
    if (!latest.rowCount) throw new NotFoundException('Traffic sample not found');
    if (latest.rows.length < 2) return { downloadMbps: 0, uploadMbps: 0, totalMbps: 0, sampledAt: latest.rows[0].sampledAt };

    const newest = latest.rows[0];
    const previous = latest.rows[1];
    const measurement = calculateThroughput(
      { bytesIn: previous.bytesIn, bytesOut: previous.bytesOut, sampledAt: new Date(previous.sampledAt) },
      { bytesIn: newest.bytesIn, bytesOut: newest.bytesOut, sampledAt: new Date(newest.sampledAt) },
    );
    return { ...measurement, sampledAt: newest.sampledAt };
  }

  private nonNegativeCounter(value: string | number, field: string): string {
    const text = typeof value === 'number' ? (Number.isSafeInteger(value) ? String(value) : '') : value;
    if (!/^\d+$/.test(text)) throw new BadRequestException(`${field} must be a non-negative integer counter`);
    const counter = BigInt(text);
    if (counter > 9223372036854775807n) throw new BadRequestException(`${field} is outside PostgreSQL bigint range`);
    return text;
  }
}
