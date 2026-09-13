import { FairnessAllocation, FairnessDecision, TrafficFairnessMode } from './traffic.types';

export interface FairnessInput {
  capacityMbps: number;
  activeUsers: Array<{ customerId: string; sessionId?: string; requestedMbps: number; priority?: number; weight?: number }>;
  activateThresholdPercent?: number;
  aggressiveThresholdPercent?: number;
  recoveryThresholdPercent?: number;
}

export class FairnessEngine {
  decide(input: FairnessInput): FairnessDecision {
    const capacity = Math.max(0, input.capacityMbps);
    const users = input.activeUsers.filter((u) => Number.isFinite(u.requestedMbps) && u.requestedMbps > 0);
    const requested = users.reduce((sum, u) => sum + u.requestedMbps, 0);
    const utilizationPercent = capacity > 0 ? (requested / capacity) * 100 : 0;
    const activateAt = input.activateThresholdPercent ?? 80;
    const aggressiveAt = input.aggressiveThresholdPercent ?? 90;
    const recoveryAt = input.recoveryThresholdPercent ?? 60;
    const mode: TrafficFairnessMode = utilizationPercent >= aggressiveAt ? 'AGGRESSIVE' : utilizationPercent >= activateAt ? 'FAIRNESS_ACTIVE' : utilizationPercent <= recoveryAt ? 'NORMAL' : 'RECOVERING';
    const normalized = users.map((u) => ({ ...u, priority: Math.max(1, u.priority ?? 1), weight: Math.max(0.1, u.weight ?? 1) }));
    if (mode === 'NORMAL' || normalized.length === 0) return { mode, utilizationPercent, capacityMbps: capacity, allocations: normalized.map((u) => ({ customerId: u.customerId, sessionId: u.sessionId, requestedMbps: u.requestedMbps, allocatedMbps: u.requestedMbps, weight: u.weight, priority: u.priority })) };
    return { mode, utilizationPercent, capacityMbps: capacity, allocations: this.allocate(normalized, capacity) };
  }

  /**
   * Weighted max-min allocation in O(n log n).
   * The previous repeated redistribution loop could degrade to O(n²) when many
   * users had capped demand. Sorting demand/fairness-factor lets us solve the
   * same water-filling problem without repeatedly scanning the whole pool.
   */
  private allocate(users: FairnessInput['activeUsers'], capacity: number): FairnessAllocation[] {
    const remainingCapacity = Math.max(0, capacity);
    if (remainingCapacity <= 0) return users.map((u) => this.allocation(u, 0));

    const ordered = users
      .map((user, index) => {
        const weight = Math.max(0.1, user.weight ?? 1);
        const priority = Math.max(1, user.priority ?? 1);
        return { user, index, factor: weight * priority, demand: user.requestedMbps };
      })
      .sort((a, b) => (a.demand / a.factor) - (b.demand / b.factor));

    const allocated = new Array<number>(users.length).fill(0);
    let remainingWeight = ordered.reduce((sum, item) => sum + item.factor, 0);
    let remaining = remainingCapacity;

    for (let position = 0; position < ordered.length; position += 1) {
      const item = ordered[position];
      if (remainingWeight <= 0 || remaining <= 0) break;

      const fairShare = remaining * (item.factor / remainingWeight);
      if (item.demand <= fairShare + 0.000001) {
        allocated[item.index] = item.demand;
        remaining -= item.demand;
        remainingWeight -= item.factor;
        continue;
      }

      const share = Math.max(0, fairShare);
      for (let i = position; i < ordered.length; i += 1) {
        const active = ordered[i];
        allocated[active.index] = Math.min(active.demand, share * (active.factor / remainingWeight));
      }
      remaining = 0;
      break;
    }

    return users.map((user, index) => this.allocation(user, Math.min(user.requestedMbps, allocated[index] ?? 0)));
  }

  private allocation(user: FairnessInput['activeUsers'][number], allocatedMbps: number): FairnessAllocation {
    return {
      customerId: user.customerId,
      sessionId: user.sessionId,
      requestedMbps: user.requestedMbps,
      allocatedMbps: Math.max(0, Math.min(user.requestedMbps, allocatedMbps)),
      weight: Math.max(0.1, user.weight ?? 1),
      priority: Math.max(1, user.priority ?? 1),
    };
  }
}
