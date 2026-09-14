import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/database.module';
import { SecureNetworkCredentials } from '../../common/secure-network-credentials';
import { calculateThroughput } from './traffic.measurement';
import { TrafficEnforcementService } from './enforcement.service';
import { FairnessPolicy, FairnessService } from './fairness.service';
import { NetworkManagementProtocol } from '../../routers/routers.dto';

interface ActiveTrafficUser {
  customerId: string;
  sessionId: string;
  ipAddress?: string;
  macAddress?: string;
  requestedMbps: number;
  priority: number;
  weight: number;
  uploadRatio: number;
}

@Injectable()
export class TrafficOrchestratorService {
  constructor(
    @Inject(PG_POOL) private readonly db: Pool,
    private readonly fairness: FairnessService,
    private readonly enforcement: TrafficEnforcementService,
    private readonly config: ConfigService,
    private readonly credentials: SecureNetworkCredentials,
  ) {}

  async evaluateRouter(tenantId: string, routerId: string, apply = true) {
    const router = await this.db.query(
      `SELECT r.id, r.api_enabled AS "apiEnabled", r.api_endpoint AS "apiEndpoint",
              r.controller_endpoint AS "controllerEndpoint", r.capabilities,
              r.management_protocol AS "managementProtocol", r.management_credentials_encrypted AS "managementCredentialsEncrypted",
              p.capacity_mbps AS "capacityMbps", p.activate_threshold_percent AS "activateThresholdPercent",
              p.aggressive_threshold_percent AS "aggressiveThresholdPercent", p.recovery_threshold_percent AS "recoveryThresholdPercent", p.enabled
       FROM routers r
       LEFT JOIN router_bandwidth_profiles p ON p.tenant_id=r.tenant_id AND p.router_id=r.id
       WHERE r.tenant_id=$1 AND r.id=$2`,
      [tenantId, routerId],
    );
    if (!router.rowCount) throw new NotFoundException('Router not found');
    const routerConfig = router.rows[0];
    if (routerConfig.capacityMbps === null) throw new ServiceUnavailableException('Router bandwidth profile is not configured');

    const activeSessions = await this.db.query(
      `SELECT COUNT(*)::int AS count
       FROM sessions
       WHERE tenant_id=$1 AND router_id=$2 AND status='ACTIVE' AND customer_id IS NOT NULL`,
      [tenantId, routerId],
    );
    const activeSessionCount = Number(activeSessions.rows[0]?.count ?? 0);
    const configuredAge = Number(this.config.get<string>('JASLYN_TRAFFIC_SAMPLE_MAX_AGE_SECONDS', '120'));
    const maxSampleAgeSeconds = Math.min(Math.max(Number.isFinite(configuredAge) ? configuredAge : 120, 15), 900);

    const samples = await this.db.query(
      `SELECT s.id AS "sessionId", s.customer_id AS "customerId", s.ip_address::text AS "ipAddress", s.mac_address AS "macAddress",
              newest.bytes_in::text AS "newestBytesIn", newest.bytes_out::text AS "newestBytesOut", newest.sampled_at AS "newestSampledAt",
              previous.bytes_in::text AS "previousBytesIn", previous.bytes_out::text AS "previousBytesOut", previous.sampled_at AS "previousSampledAt"
       FROM sessions s
       CROSS JOIN LATERAL (
         SELECT ts.bytes_in, ts.bytes_out, ts.sampled_at FROM traffic_samples ts
         WHERE ts.tenant_id=$1 AND ts.session_id=s.id
           AND ts.sampled_at >= NOW() - ($3::int * INTERVAL '1 second')
         ORDER BY ts.sampled_at DESC LIMIT 1
       ) newest
       CROSS JOIN LATERAL (
         SELECT ts.bytes_in, ts.bytes_out, ts.sampled_at FROM traffic_samples ts
         WHERE ts.tenant_id=$1 AND ts.session_id=s.id AND ts.sampled_at < newest.sampled_at
         ORDER BY ts.sampled_at DESC LIMIT 1
       ) previous
       WHERE s.tenant_id=$1 AND s.router_id=$2 AND s.status='ACTIVE' AND s.customer_id IS NOT NULL
         AND newest.sampled_at - previous.sampled_at <= ($3::int * INTERVAL '1 second')`,
      [tenantId, routerId, maxSampleAgeSeconds],
    );

    const users: ActiveTrafficUser[] = samples.rows.map((row) => {
      const measurement = calculateThroughput(
        { bytesIn: row.previousBytesIn, bytesOut: row.previousBytesOut, sampledAt: new Date(row.previousSampledAt) },
        { bytesIn: row.newestBytesIn, bytesOut: row.newestBytesOut, sampledAt: new Date(row.newestSampledAt) },
      );
      const totalMbps = measurement.totalMbps;
      return {
        customerId: row.customerId,
        sessionId: row.sessionId,
        ipAddress: row.ipAddress ?? undefined,
        macAddress: row.macAddress ?? undefined,
        requestedMbps: totalMbps,
        priority: 1,
        weight: 1,
        uploadRatio: totalMbps > 0 ? measurement.uploadMbps / totalMbps : 0.5,
      };
    }).filter((user) => Number.isFinite(user.requestedMbps) && user.requestedMbps > 0);

    const policy: FairnessPolicy = {
      enabled: routerConfig.enabled ?? true,
      capacityMbps: Number(routerConfig.capacityMbps),
      activateThresholdPercent: Number(routerConfig.activateThresholdPercent),
      aggressiveThresholdPercent: Number(routerConfig.aggressiveThresholdPercent),
      recoveryThresholdPercent: Number(routerConfig.recoveryThresholdPercent),
    };
    const state = this.fairness.evaluate(policy, users);
    const baseResult = {
      routerId,
      mode: state.mode,
      utilizationPercent: Number(state.utilizationPercent.toFixed(3)),
      capacityMbps: state.capacityMbps,
      users: users.length,
      activeSessions: activeSessionCount,
      sampleMaxAgeSeconds: maxSampleAgeSeconds,
      allocations: state.allocations,
    };

    if (!apply) return { ...baseResult, applied: false, reason: 'DRY_RUN' };
    if (!routerConfig.apiEnabled) return { ...baseResult, applied: false, reason: 'ROUTER_API_DISABLED' };
    if (!routerConfig.apiEndpoint) return { ...baseResult, applied: false, reason: 'ROUTER_API_ENDPOINT_MISSING' };
    if (activeSessionCount > 0 && samples.rowCount === 0) return { ...baseResult, applied: false, reason: 'NO_RECENT_TRAFFIC_MEASUREMENTS' };

    const protocol = routerConfig.managementProtocol as NetworkManagementProtocol;
    if (!['MIKROTIK_REST', 'MERAKI_DASHBOARD_API'].includes(protocol)) {
      return { ...baseResult, applied: false, reason: 'ENFORCEMENT_ADAPTER_NOT_IMPLEMENTED', protocol };
    }

    const capabilities = this.record(routerConfig.capabilities);
    const merakiNetworkId = this.stringValue(capabilities, ['networkId', 'merakiNetworkId']);
    const merakiGroupPolicyId = this.stringValue(capabilities, ['merakiGroupPolicyId', 'groupPolicyId']);
    const enforcementEndpoint = protocol === 'MERAKI_DASHBOARD_API'
      ? this.merakiNetworkEndpoint(routerConfig.apiEndpoint, routerConfig.controllerEndpoint, merakiNetworkId)
      : routerConfig.apiEndpoint;
    const routerCredentials = routerConfig.managementCredentialsEncrypted ? this.credentials.decrypt(routerConfig.managementCredentialsEncrypted) : undefined;
    const reconcileOptions = protocol === 'MERAKI_DASHBOARD_API' ? { merakiGroupPolicyId } : undefined;

    if (state.mode === 'NORMAL') {
      const cleared = await this.enforcement.clearManaged(enforcementEndpoint, routerCredentials, protocol, reconcileOptions);
      await this.db.query(
        `INSERT INTO traffic_enforcement_events
          (tenant_id, router_id, mode, command_count, applied, commands)
         VALUES ($1,$2,'NORMAL',$3,$4,$5::jsonb)`,
        [tenantId, routerId, cleared, cleared > 0, JSON.stringify({ action: 'CLEAR_MANAGED_POLICIES', protocol, cleared })],
      );
      return { ...baseResult, applied: cleared > 0, clearedManaged: cleared };
    }

    if (!users.length) return { ...baseResult, applied: false, reason: 'NO_MEASURED_ACTIVE_USERS' };

    const uploadRatio = users.reduce((sum, user) => sum + user.uploadRatio, 0) / users.length;
    const targets = Object.fromEntries(users.map((user) => [
      `${user.customerId}:${user.sessionId}`,
      {
        targetAddress: user.ipAddress,
        targetMacAddress: user.macAddress,
        apiEndpoint: enforcementEndpoint,
        protocol,
        merakiGroupPolicyId: protocol === 'MERAKI_DASHBOARD_API' ? merakiGroupPolicyId : undefined,
      },
    ]));

    try {
      const result = await this.enforcement.evaluateAndApply(routerId, policy, users, targets, uploadRatio, routerCredentials, protocol);
      const keepManagedKeys = result.commands.map((command) => protocol === 'MERAKI_DASHBOARD_API'
        ? command.targetMacAddress ?? command.targetAddress ?? ''
        : `JASLYN-${command.sessionId ?? command.customerId}`.slice(0, 60));
      const reconciled = await this.enforcement.reconcileManaged(enforcementEndpoint, keepManagedKeys, routerCredentials, protocol, reconcileOptions);
      await this.db.query(
        `INSERT INTO traffic_enforcement_events
          (tenant_id, router_id, mode, command_count, applied, commands)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
        [tenantId, routerId, result.mode, result.commandCount, result.applied, JSON.stringify({ protocol, commands: result.commands, staleManagedRemoved: reconciled })],
      );
      return { ...baseResult, ...result, staleManagedRemoved: reconciled };
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 1000) : 'Unknown router enforcement error';
      await this.db.query(
        `INSERT INTO traffic_enforcement_events
          (tenant_id, router_id, mode, command_count, applied, commands, error)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`,
        [tenantId, routerId, state.mode, state.allocations.length, false, '[]', message],
      );
      throw error;
    }
  }

  private merakiNetworkEndpoint(apiEndpoint?: string, controllerEndpoint?: string, networkId?: string): string {
    const endpoint = controllerEndpoint ?? apiEndpoint;
    if (!endpoint || !networkId) throw new ServiceUnavailableException('Meraki controller endpoint and networkId are required for enforcement');
    const base = endpoint.replace(/\/+$/, '').replace(/\/api\/v1$/, '').replace(/\/api$/, '');
    return `${base}/api/v1/networks/${encodeURIComponent(networkId)}`;
  }

  private record(value: unknown): Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
  private stringValue(record: Record<string, unknown>, keys: string[]): string | undefined {
    for (const key of keys) if (typeof record[key] === 'string' && record[key].trim()) return record[key] as string;
    return undefined;
  }
}
