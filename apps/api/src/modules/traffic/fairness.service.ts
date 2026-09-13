import { FairnessAllocation, FairnessDecision } from './traffic.types';
import { FairnessEngine, FairnessInput } from './fairness.engine';

export interface FairnessPolicy {
  enabled: boolean;
  capacityMbps: number;
  activateThresholdPercent: number;
  aggressiveThresholdPercent: number;
  recoveryThresholdPercent: number;
}

export interface FairnessState {
  mode: FairnessDecision['mode'];
  utilizationPercent: number;
  capacityMbps: number;
  allocations: FairnessAllocation[];
  evaluatedAt: Date;
}

/** Pure orchestration layer. Persistence and router enforcement stay behind adapters. */
export class FairnessService {
  constructor(private readonly engine = new FairnessEngine()) {}

  evaluate(policy: FairnessPolicy, activeUsers: FairnessInput['activeUsers']): FairnessState {
    const now = new Date();
    if (!policy.enabled) {
      return {
        mode: 'NORMAL',
        utilizationPercent: 0,
        capacityMbps: Math.max(0, policy.capacityMbps),
        allocations: activeUsers.filter((u) => Number.isFinite(u.requestedMbps) && u.requestedMbps > 0).map((u) => ({
          customerId: u.customerId,
          sessionId: u.sessionId,
          requestedMbps: u.requestedMbps,
          allocatedMbps: u.requestedMbps,
          weight: Math.max(0.1, u.weight ?? 1),
          priority: Math.max(1, u.priority ?? 1),
        })),
        evaluatedAt: now,
      };
    }

    const decision = this.engine.decide({
      capacityMbps: policy.capacityMbps,
      activeUsers,
      activateThresholdPercent: policy.activateThresholdPercent,
      aggressiveThresholdPercent: policy.aggressiveThresholdPercent,
      recoveryThresholdPercent: policy.recoveryThresholdPercent,
    });
    return { ...decision, evaluatedAt: now };
  }
}
