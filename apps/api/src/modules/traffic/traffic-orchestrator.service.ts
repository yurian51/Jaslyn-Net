import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/database.module';
import { TrafficEnforcementService } from './enforcement.service';
import { FairnessPolicy } from './fairness.service';

interface ActiveTrafficUser {
  customerId: string;
  sessionId: string;
  ipAddress?: string;
  requestedMbps: number;
  priority: number;
  weight: number;
  uploadRatio: number;
}

@Injectable()
export class TrafficOrchestratorService {
  constructor(
    @Inject(PG_POOL) private readonly db: Pool,
    private readonly enforcement: TrafficEnforcementService,
  ) {}

  async evaluateRouter(tenantId: string, routerId: string, apply = true) {
    const router = await this.db.query(
      `SELECT r.id,
              r.api_enabled AS "apiEnabled",
              r.api_endpoint AS "apiEndpoint",
              p.capacity_mbps AS "capacityMbps",
              p.activate_threshold_percent AS "activateThresholdPercent",
              p.aggressive_threshold_percent AS "aggressiveThresholdPercent",
              p.recovery_threshold_percent AS "recoveryThresholdPercent",
              p.enabled
       FROM routers r
       LEFT JOIN router_bandwidth_profiles p ON p.tenant_id=r.tenant_id AND p.router_id=r.id
       WHERE r.tenant_id=$1 AND r.id=$2`,
      [tenantId, routerId],
    );
    if (!router.rowCount) throw new NotFoundException('Router not found');

    const config = router.rows[0];
    if (config.capacityMbps === null) {
      throw new ServiceUnavailableException('Router bandwidth profile is not configured');
    }

    const samples = await this.db.query(
      `SELECT s.id AS "sessionId",
              s.customer_id AS "customerId",
              s.ip_address::text AS "ipAddress",
              GREATEST(0, EXTRACT(EPOCH FROM (newest.sampled_at - previous.sampled_at))) AS "intervalSeconds",
              GREATEST(0, newest.bytes_in - previous.bytes_in) AS "bytesInDelta",
              GREATEST(0, newest.bytes_out - previous.bytes_out) AS "bytesOutDelta"
       FROM sessions s
       CROSS JOIN LATERAL (
         SELECT ts.bytes_in, ts.bytes_out, ts.sampled_at
         FROM traffic_samples ts
         WHERE ts.tenant_id=$1 AND ts.session_id=s.id
         ORDER BY ts.sampled_at DESC
         LIMIT 1
       ) newest
       CROSS JOIN LATERAL (
         SELECT ts.bytes_in, ts.bytes_out, ts.sampled_at
         FROM traffic_samples ts
         WHERE ts.tenant_id=$1 AND ts.session_id=s.id AND ts.sampled_at < newest.sampled_at
         ORDER BY ts.sampled_at DESC
         LIMIT 1
       ) previous
       WHERE s.tenant_id=$1 AND s.router_id=$2 AND s.status='ACTIVE' AND s.customer_id IS NOT NULL`,
      [tenantId, routerId],
    );

    const users: ActiveTrafficUser[] = samples.rows
      .map((row) => {
        const interval = Number(row.intervalSeconds);
        const downloadMbps = interval > 0 ? (Number(row.bytesInDelta) * 8) / interval / 1_000_000 : 0;
        const uploadMbps = interval > 0 ? (Number(row.bytesOutDelta) * 8) / interval / 1_000_000 : 0;
        const totalMbps = Number((downloadMbps + uploadMbps).toFixed(3));
        return {
          customerId: row.customerId,
          sessionId: row.sessionId,
          ipAddress: row.ipAddress ?? undefined,
          requestedMbps: totalMbps,
          priority: 1,
          weight: 1,
          uploadRatio: totalMbps > 0 ? uploadMbps / totalMbps : 0.5,
        };
      })
      .filter((user) => Number.isFinite(user.requestedMbps) && user.requestedMbps > 0);

    const policy: FairnessPolicy = {
      enabled: config.enabled ?? true,
      capacityMbps: Number(config.capacityMbps),
      activateThresholdPercent: Number(config.activateThresholdPercent),
      aggressiveThresholdPercent: Number(config.aggressiveThresholdPercent),
      recoveryThresholdPercent: Number(config.recoveryThresholdPercent),
    };

    const uploadRatio = users.length
      ? users.reduce((sum, user) => sum + user.uploadRatio, 0) / users.length
      : 0.5;
    const targets = Object.fromEntries(users.map((user) => [
      `${user.customerId}:${user.sessionId}`,
      { targetAddress: user.ipAddress, apiEndpoint: config.apiEndpoint ?? undefined },
    ]));

    if (!apply) {
      const result = await this.enforcement['fairnessService'].evaluate(policy, users);
      return {
        routerId,
        applied: false,
        mode: result.mode,
        utilizationPercent: Number(result.utilizationPercent.toFixed(3)),
        capacityMbps: result.capacityMbps,
        users: users.length,
        allocations: result.allocations,
      };
    }

    if (!config.apiEnabled) {
      return {
        routerId,
        applied: false,
        reason: 'ROUTER_API_DISABLED',
        users: users.length,
        capacityMbps: policy.capacityMbps,
      };
    }

    const result = await this.enforcement.evaluateAndApply(routerId, policy, users, targets, uploadRatio);
    await this.db.query(
      `INSERT INTO traffic_enforcement_events
        (tenant_id, router_id, mode, command_count, applied, commands)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
      [tenantId, routerId, result.mode, result.commandCount, result.applied, JSON.stringify(result.commands)],
    );
    return { routerId, ...result, users: users.length, capacityMbps: policy.capacityMbps };
  }
}
