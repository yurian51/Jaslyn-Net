import { BadRequestException, Injectable } from '@nestjs/common';
import { LOAD_BALANCE_STRATEGIES, LoadBalanceDecision, LoadBalanceStrategy, WanMemberState } from './load-balancing.types';

@Injectable()
export class LoadBalancingEngine {
  decide(
    policyId: string,
    strategy: string,
    members: WanMemberState[],
    capacityAware = true,
  ): LoadBalanceDecision {
    if (!policyId) throw new BadRequestException('policyId is required');
    if (!LOAD_BALANCE_STRATEGIES.includes(strategy as LoadBalanceStrategy)) {
      throw new BadRequestException(`Unsupported load-balancing strategy: ${strategy}`);
    }

    const normalized = members.map((member) => ({
      ...member,
      capacityMbps: Number(member.capacityMbps),
      configuredWeight: Math.max(1, Math.trunc(member.configuredWeight)),
      priority: Math.max(0, Math.trunc(member.priority)),
    }));

    const available = normalized.filter(
      (member) => member.enabled && !member.drainRequested && ['HEALTHY', 'DEGRADED', 'RECOVERING'].includes(member.healthState),
    );

    const primarySecondary = strategy === 'PRIMARY_SECONDARY';
    const minPriority = available.length ? Math.min(...available.map((member) => member.priority)) : undefined;
    const selected = primarySecondary && minPriority !== undefined
      ? available.filter((member) => member.priority === minPriority)
      : available;

    const effective = selected.map((member) => {
      const utilization = member.observedUtilizationPercent;
      const healthFactor = member.healthState === 'HEALTHY' ? 1 : member.healthState === 'RECOVERING' ? 0.35 : 0.65;
      const capacityFactor = capacityAware ? Math.max(0.1, member.capacityMbps) : 1;
      const utilizationFactor = utilization == null ? 1 : Math.max(0.1, 1 - Math.min(0.95, utilization / 100));
      let weight = member.configuredWeight * healthFactor * capacityFactor * utilizationFactor;
      if (strategy === 'LEAST_UTILIZED' && utilization != null) weight = Math.max(0.1, 100 - Math.min(99.9, utilization));
      if (strategy === 'CONNECTION_BASED') weight = Math.max(0.1, member.activeSessions === 0 ? 1 : 1 / member.activeSessions);
      if (primarySecondary) weight = member.priority === minPriority ? weight : 0;
      return { member, effectiveWeight: Number(weight.toFixed(6)) };
    }).filter((item) => item.effectiveWeight > 0);

    const failoverActive = normalized.length > 0 && effective.length > 0 && effective.length < normalized.filter((member) => member.enabled && !member.drainRequested).length;

    return {
      policyId,
      strategy: strategy as LoadBalanceStrategy,
      eligibleMembers: effective.map(({ member, effectiveWeight }) => ({
        wanConnectionId: member.id,
        configuredWeight: member.configuredWeight,
        effectiveWeight,
        priority: member.priority,
        healthState: member.healthState,
        capacityMbps: member.capacityMbps,
        utilizationPercent: member.observedUtilizationPercent,
      })),
      failoverActive,
    };
  }
}
