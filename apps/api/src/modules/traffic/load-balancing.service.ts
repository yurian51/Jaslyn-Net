import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/database.module';
import { AuditContext, AuditService } from '../../audit/audit.service';
import { SecureNetworkCredentials } from '../../common/secure-network-credentials';
import { LoadBalancingEngine } from './load-balancing.engine';
import { CreateLoadBalancePolicyDto, CreateWanConnectionDto, LoadBalanceActionDto, UpdateWanConnectionDto, WanHealthCheckDto } from './load-balancing.dto';
import { WanMemberState } from './load-balancing.types';
import { hasWanRoutingCapability } from './load-balancing.capabilities';
import { NetworkManagementProtocol } from '../../routers/routers.dto';
import { MikrotikWanRoutingAdapter } from './mikrotik-wan-routing.adapter';

@Injectable()
export class LoadBalancingService {
  constructor(
    @Inject(PG_POOL) private readonly db: Pool,
    private readonly engine: LoadBalancingEngine,
    private readonly audit: AuditService,
    private readonly secureCredentials: SecureNetworkCredentials,
  ) {}

  async listWans(tenantId: string, routerId?: string) {
    const result = await this.db.query(
      `SELECT w.id, w.router_id AS "routerId", w.name, w.provider, w.interface_name AS "interfaceName",
              host(w.gateway) AS gateway, w.address::text AS address, w.capacity_mbps AS "capacityMbps",
              w.configured_weight AS "configuredWeight", w.priority, w.failover_priority AS "failoverPriority",
              w.enabled, w.drain_requested AS "drainRequested", w.health_state AS "healthState",
              w.latency_ms AS "latencyMs", w.jitter_ms AS "jitterMs", w.packet_loss_percent AS "packetLossPercent",
              w.observed_utilization_percent AS "observedUtilizationPercent", w.observed_upload_bps::text AS "observedUploadBps",
              w.observed_download_bps::text AS "observedDownloadBps", w.active_sessions AS "activeSessions",
              w.last_health_check_at AS "lastHealthCheckAt", w.last_state_change_at AS "lastStateChangeAt",
              r.management_protocol AS "managementProtocol", r.management_enabled AS "managementEnabled"
       FROM wan_connections w JOIN routers r ON r.tenant_id=w.tenant_id AND r.id=w.router_id
       WHERE w.tenant_id=$1 AND ($2::uuid IS NULL OR w.router_id=$2)
       ORDER BY w.priority ASC, w.name ASC`,
      [tenantId, routerId ?? null],
    );
    return {
      data: result.rows.map((row) => ({
        ...row,
        routingCapabilities: this.routingCapabilities(row.managementProtocol as NetworkManagementProtocol, row.managementEnabled === true),
      })),
      count: result.rowCount ?? 0,
    };
  }

  async createWan(tenantId: string, dto: CreateWanConnectionDto, context: AuditContext = {}) {
    await this.assertRouter(tenantId, dto.routerId);
    const result = await this.db.query(
      `INSERT INTO wan_connections
       (tenant_id,router_id,name,provider,interface_name,gateway,address,capacity_mbps,configured_weight,priority,failover_priority,enabled,health_state,last_state_change_at)
       VALUES ($1,$2,$3,$4,$5,$6::inet,$7::cidr,$8,$9,$10,$11,$12,'UNKNOWN',now())
       RETURNING id`,
      [tenantId, dto.routerId, dto.name.trim(), dto.provider?.trim() || null, dto.interfaceName?.trim() || null,
       dto.gateway ?? null, dto.address ?? null, dto.capacityMbps, dto.configuredWeight ?? 1, dto.priority ?? 100,
       dto.failoverPriority ?? 100, dto.enabled ?? true],
    );
    const id = result.rows[0].id as string;
    await this.audit.record(tenantId, 'WAN_CONNECTION_CREATED', 'wan_connection', id, { routerId: dto.routerId, name: dto.name, capacityMbps: dto.capacityMbps }, context);
    return this.getWan(tenantId, id);
  }

  async updateWan(tenantId: string, id: string, dto: UpdateWanConnectionDto, context: AuditContext = {}) {
    await this.assertWan(tenantId, id);
    const result = await this.db.query(
      `UPDATE wan_connections SET
       name=COALESCE($3,name), provider=COALESCE($4,provider), interface_name=COALESCE($5,interface_name),
       gateway=COALESCE($6::inet,gateway), address=COALESCE($7::cidr,address), capacity_mbps=COALESCE($8,capacity_mbps),
       configured_weight=COALESCE($9,configured_weight), priority=COALESCE($10,priority), failover_priority=COALESCE($11,failover_priority),
       enabled=COALESCE($12,enabled), drain_requested=COALESCE($13,drain_requested),
       health_state=CASE WHEN COALESCE($12,enabled)=false THEN 'DISABLED' WHEN COALESCE($13,drain_requested)=true THEN 'DRAINING' ELSE health_state END,
       last_state_change_at=CASE WHEN COALESCE($12,enabled) IS DISTINCT FROM enabled OR COALESCE($13,drain_requested) IS DISTINCT FROM drain_requested THEN now() ELSE last_state_change_at END,
       updated_at=now()
       WHERE tenant_id=$1 AND id=$2 RETURNING id`,
      [tenantId, id, dto.name?.trim() || null, dto.provider?.trim() || null, dto.interfaceName?.trim() || null,
       dto.gateway ?? null, dto.address ?? null, dto.capacityMbps ?? null, dto.configuredWeight ?? null, dto.priority ?? null,
       dto.failoverPriority ?? null, dto.enabled ?? null, dto.drainRequested ?? null],
    );
    if (!result.rowCount) throw new NotFoundException('WAN connection not found');
    await this.audit.record(tenantId, 'WAN_CONNECTION_UPDATED', 'wan_connection', id, { changes: dto }, context);
    return this.getWan(tenantId, id);
  }

  async createPolicy(tenantId: string, dto: CreateLoadBalancePolicyDto, context: AuditContext = {}) {
    await this.assertRouter(tenantId, dto.routerId);
    const members = dto.members ?? [];
    const seen = new Set<string>();
    for (const member of members) {
      if (seen.has(member.wanConnectionId)) throw new BadRequestException(`Duplicate WAN member: ${member.wanConnectionId}`);
      seen.add(member.wanConnectionId);
    }
    if (members.length) {
      const available = await this.db.query(
        `SELECT id FROM wan_connections WHERE tenant_id=$1 AND router_id=$2 AND id=ANY($3::uuid[])`,
        [tenantId, dto.routerId, members.map((member) => member.wanConnectionId)],
      );
      const availableIds = new Set<string>(available.rows.map((row) => row.id as string));
      const missing = members.map((member) => member.wanConnectionId).filter((id) => !availableIds.has(id));
      if (missing.length) throw new BadRequestException(`WAN member does not belong to router: ${missing.join(', ')}`);
    }

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO load_balance_policies
         (tenant_id,router_id,name,strategy,enabled,capacity_aware,rebalance_threshold_percent,degrade_threshold_percent,unavailable_after_failures,recover_after_successes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [tenantId, dto.routerId, dto.name.trim(), dto.strategy, dto.enabled ?? true, dto.capacityAware ?? true,
         dto.rebalanceThresholdPercent ?? 15, dto.degradeThresholdPercent ?? 80, dto.unavailableAfterFailures ?? 3, dto.recoverAfterSuccesses ?? 3],
      );
      const id = result.rows[0].id as string;
      for (const member of members) {
        await client.query(
          `INSERT INTO load_balance_members (tenant_id,policy_id,wan_connection_id,configured_weight,priority,enabled)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [tenantId, id, member.wanConnectionId, member.configuredWeight ?? 1, member.priority ?? 100, member.enabled ?? true],
        );
      }
      await client.query('COMMIT');
      await this.audit.record(tenantId, 'LOAD_BALANCE_POLICY_CREATED', 'load_balance_policy', id, { routerId: dto.routerId, strategy: dto.strategy, memberCount: members.length }, context);
      return this.getPolicy(tenantId, id);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  async listPolicies(tenantId: string, routerId?: string) {
    const result = await this.db.query(
      `SELECT p.id,p.router_id AS "routerId",p.name,p.strategy,p.enabled,p.capacity_aware AS "capacityAware",
              p.rebalance_threshold_percent AS "rebalanceThresholdPercent",p.degrade_threshold_percent AS "degradeThresholdPercent",
              p.unavailable_after_failures AS "unavailableAfterFailures",p.recover_after_successes AS "recoverAfterSuccesses",
              COUNT(m.id)::int AS "memberCount",r.management_protocol AS "managementProtocol",r.management_enabled AS "managementEnabled"
       FROM load_balance_policies p JOIN routers r ON r.tenant_id=p.tenant_id AND r.id=p.router_id
       LEFT JOIN load_balance_members m ON m.tenant_id=p.tenant_id AND m.policy_id=p.id
       WHERE p.tenant_id=$1 AND ($2::uuid IS NULL OR p.router_id=$2)
       GROUP BY p.id,r.management_protocol,r.management_enabled ORDER BY p.updated_at DESC`,
      [tenantId, routerId ?? null],
    );
    return {
      data: result.rows.map((row) => ({
        ...row,
        routingCapabilities: this.routingCapabilities(row.managementProtocol as NetworkManagementProtocol, row.managementEnabled === true),
      })),
      count: result.rowCount ?? 0,
    };
  }

  async getPolicy(tenantId: string, id: string) {
    const policy = await this.db.query(
      `SELECT p.id,p.router_id AS "routerId",p.name,p.strategy,p.enabled,p.capacity_aware AS "capacityAware",
              p.rebalance_threshold_percent AS "rebalanceThresholdPercent",p.degrade_threshold_percent AS "degradeThresholdPercent",
              p.unavailable_after_failures AS "unavailableAfterFailures",p.recover_after_successes AS "recoverAfterSuccesses",
              r.management_protocol AS "managementProtocol",r.management_enabled AS "managementEnabled"
       FROM load_balance_policies p JOIN routers r ON r.tenant_id=p.tenant_id AND r.id=p.router_id
       WHERE p.tenant_id=$1 AND p.id=$2`, [tenantId, id]);
    if (!policy.rowCount) throw new NotFoundException('Load-balance policy not found');
    const members = await this.db.query(
      `SELECT w.id,w.name,w.provider,w.interface_name AS "interfaceName",host(w.gateway) AS gateway,
              w.capacity_mbps AS "capacityMbps",m.configured_weight AS "configuredWeight",m.priority,m.enabled,
              w.drain_requested AS "drainRequested",w.health_state AS "healthState",w.latency_ms AS "latencyMs",
              w.jitter_ms AS "jitterMs",w.packet_loss_percent AS "packetLossPercent",w.observed_utilization_percent AS "observedUtilizationPercent",
              w.observed_upload_bps::text AS "observedUploadBps",w.observed_download_bps::text AS "observedDownloadBps",w.active_sessions AS "activeSessions",
              w.last_health_check_at AS "lastHealthCheckAt",w.last_state_change_at AS "lastStateChangeAt"
       FROM load_balance_members m JOIN wan_connections w ON w.tenant_id=m.tenant_id AND w.id=m.wan_connection_id
       WHERE m.tenant_id=$1 AND m.policy_id=$2 ORDER BY m.priority ASC,w.name ASC`, [tenantId, id]);
    return {
      ...policy.rows[0],
      members: members.rows,
      routingCapabilities: this.routingCapabilities(policy.rows[0].managementProtocol as NetworkManagementProtocol, policy.rows[0].managementEnabled === true),
    };
  }

  async status(tenantId: string, policyId: string) {
    const policy = await this.getPolicy(tenantId, policyId);
    const decision = this.engine.decide(policyId, policy.strategy, policy.members as WanMemberState[], policy.capacityAware);
    const adapterAvailable = hasWanRoutingAdapter(policy.managementProtocol as NetworkManagementProtocol);
    return {
      policy,
      decision,
      generatedAt: new Date().toISOString(),
      appliedToRouter: false,
      adapterAvailable,
      applyAvailable: adapterAvailable && policy.routingCapabilities.routeWrite,
    };
  }

  async rebalance(tenantId: string, policyId: string, context: AuditContext = {}, action?: LoadBalanceActionDto) {
    const status = await this.status(tenantId, policyId);
    const totalEffectiveWeight = status.decision.eligibleMembers.reduce((sum, member) => sum + member.effectiveWeight, 0);
    const distribution = status.decision.eligibleMembers.map((member) => ({
      wanConnectionId: member.wanConnectionId,
      configuredWeight: member.configuredWeight,
      effectiveWeight: member.effectiveWeight,
      expectedSharePercent: totalEffectiveWeight > 0 ? Number(((member.effectiveWeight / totalEffectiveWeight) * 100).toFixed(3)) : 0,
      observedUtilizationPercent: member.utilizationPercent,
    }));

    let networkApply: { applied: boolean; verified: boolean; reason?: string; protocol?: NetworkManagementProtocol } = { applied: false, verified: false, reason: 'No device routing adapter was invoked.' };
    if (hasWanRoutingAdapter(status.policy.managementProtocol as NetworkManagementProtocol) && status.policy.managementEnabled === true && status.policy.routingCapabilities.routeWrite) {
      const router = await this.db.query(
        `SELECT api_endpoint AS "apiEndpoint", management_credentials_encrypted AS "credentialsEncrypted"
         FROM routers WHERE tenant_id=$1 AND id=$2`,
        [tenantId, status.policy.routerId],
      );
      const row = router.rows[0];
      if (row?.apiEndpoint && row?.credentialsEncrypted) {
        try {
          const credentials = this.secureCredentials.decrypt(row.credentialsEncrypted as string);
          const adapter = new MikrotikWanRoutingAdapter(row.apiEndpoint as string, credentials);
          const targets = (status.policy.members as WanMemberState[]).map((member) => ({
            wanConnectionId: member.id as string,
            interfaceName: member.interfaceName as string | null,
            gateway: member.gateway as string | null,
            weight: Number(member.configuredWeight),
            priority: Number(member.priority),
          }));
          networkApply = await adapter.applyLoadBalanceDecision(status.policy.routerId, status.decision, targets);
        } catch (error: unknown) {
          const code = errorCode(error);
          await this.audit.record(tenantId, 'TRAFFIC_REBALANCED_FAILED', 'load_balance_policy', policyId, { reason: action?.reason ?? 'operator_or_automation', errorCode: code, protocol: status.policy.managementProtocol }, context);
          throw new BadRequestException(`WAN route application failed (${code})`);
        }
      } else {
        networkApply = { applied: false, verified: false, protocol: 'MIKROTIK_REST', reason: 'MikroTik routing is enabled but the router API endpoint or encrypted management credentials are not configured.' };
      }
    }

    const correlationId = `rebalance:${policyId}:${Math.floor(Date.now() / 30000)}`;
    await this.db.query(
      `INSERT INTO load_balance_events (tenant_id,router_id,policy_id,event_type,correlation_id,evidence)
       VALUES ($1,$2,$3,'TRAFFIC_REBALANCED',$4,$5::jsonb)
       ON CONFLICT (tenant_id,event_type,correlation_id) WHERE correlation_id IS NOT NULL DO NOTHING`,
      [tenantId, status.policy.routerId, policyId, correlationId, JSON.stringify({ distribution, reason: action?.reason ?? 'operator_or_automation', networkApply })],
    );
    await this.audit.record(tenantId, networkApply.applied && networkApply.verified ? 'TRAFFIC_REBALANCED_APPLIED' : 'TRAFFIC_REBALANCED_DECISION', 'load_balance_policy', policyId, { distribution, reason: action?.reason ?? 'operator_or_automation', networkApply }, context);
    return { ...status, distribution, appliedToRouter: networkApply.applied && networkApply.verified, networkApply };
  }

  async addHealthCheck(tenantId: string, wanId: string, dto: WanHealthCheckDto, context: AuditContext = {}) {
    await this.assertWan(tenantId, wanId);
    const target = dto.target.trim();
    if (!target) throw new BadRequestException('Health-check target is required');
    const result = await this.db.query(
      `INSERT INTO wan_health_checks (tenant_id,wan_connection_id,method,target,interval_seconds,timeout_ms,failure_threshold,recovery_threshold,enabled)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [tenantId, wanId, dto.method, target, dto.intervalSeconds ?? 10, dto.timeoutMs ?? 3000, dto.failureThreshold ?? 3, dto.recoveryThreshold ?? 3, dto.enabled ?? true]);
    await this.audit.record(tenantId, 'WAN_HEALTH_CHECK_CREATED', 'wan_connection', wanId, { healthCheckId: result.rows[0].id, method: dto.method, target }, context);
    return result.rows[0];
  }

  private routingCapabilities(protocol: NetworkManagementProtocol, managementEnabled: boolean) {
    const enabled = managementEnabled === true;
    return {
      telemetry: enabled && hasWanRoutingCapability(protocol, 'wan_telemetry'),
      gatewayHealth: enabled && hasWanRoutingCapability(protocol, 'gateway_health'),
      policyRouting: enabled && hasWanRoutingCapability(protocol, 'policy_routing'),
      weightedLoadBalancing: enabled && hasWanRoutingCapability(protocol, 'weighted_load_balancing'),
      failover: enabled && hasWanRoutingCapability(protocol, 'failover'),
      routeRead: enabled && hasWanRoutingCapability(protocol, 'route_read'),
      routeWrite: enabled && hasWanRoutingCapability(protocol, 'route_write'),
    };
  }

  private async getWan(tenantId: string, id: string) {
    const result = await this.db.query(
      `SELECT w.id,w.router_id AS "routerId",w.name,w.provider,w.interface_name AS "interfaceName",host(w.gateway) AS gateway,w.address::text AS address,
              w.capacity_mbps AS "capacityMbps",w.configured_weight AS "configuredWeight",w.priority,w.failover_priority AS "failoverPriority",
              w.enabled,w.drain_requested AS "drainRequested",w.health_state AS "healthState",w.latency_ms AS "latencyMs",w.jitter_ms AS "jitterMs",
              w.packet_loss_percent AS "packetLossPercent",w.observed_utilization_percent AS "observedUtilizationPercent",w.observed_upload_bps::text AS "observedUploadBps",
              w.observed_download_bps::text AS "observedDownloadBps",w.active_sessions AS "activeSessions",w.last_health_check_at AS "lastHealthCheckAt",
              w.last_state_change_at AS "lastStateChangeAt",r.management_protocol AS "managementProtocol",r.management_enabled AS "managementEnabled"
       FROM wan_connections w JOIN routers r ON r.tenant_id=w.tenant_id AND r.id=w.router_id WHERE w.tenant_id=$1 AND w.id=$2`, [tenantId, id]);
    if (!result.rowCount) throw new NotFoundException('WAN connection not found');
    return { ...result.rows[0], routingCapabilities: this.routingCapabilities(result.rows[0].managementProtocol as NetworkManagementProtocol, result.rows[0].managementEnabled === true) };
  }

  private async assertWan(tenantId: string, id: string) {
    const result = await this.db.query('SELECT id FROM wan_connections WHERE tenant_id=$1 AND id=$2', [tenantId, id]);
    if (!result.rowCount) throw new NotFoundException('WAN connection not found');
  }

  private async assertRouter(tenantId: string, routerId: string) {
    const result = await this.db.query('SELECT id FROM routers WHERE tenant_id=$1 AND id=$2', [tenantId, routerId]);
    if (!result.rowCount) throw new NotFoundException('Router not found');
  }
}

function errorCode(error: unknown) {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'NETWORK_ERROR';
}


function hasWanRoutingAdapter(protocol: NetworkManagementProtocol) {
  return protocol === 'MIKROTIK_REST';
}
