import { FairnessAllocation, FairnessDecision, TrafficFairnessMode } from './traffic.types';

export interface FairnessInput {
  capacityMbps: number;
  activeUsers: Array<{
    customerId: string;
    sessionId?: string;
    requestedMbps: number;
    priority?: number;
    weight?: number;
  }>;
  activateThresholdPercent?: number;
  aggressiveThresholdPercent?: number;
  recoveryThresholdPercent?: number;
}

/**
 * Deterministic weighted max-min style allocator.
 * It deliberately has no network side effects: router/RADIUS enforcement belongs
 * to an adapter layer so the policy can be tested independently.
 */
export class FairnessEngine {
  decide(input: FairnessInput): FairnessDecision {
    const capacity = Math.max(0, input.capacityMbps);
    const users = input.activeUsers.filter((u) => Number.isFinite(u.requestedMbps) && u.requestedMbps > 0);
    const requested = users.reduce((sum, u) => sum + u.requestedMbps, 0);
    const utilizationPercent = capacity > 0 ? (requested / capacity) * 100 : 0;
    const activateAt = input.activateThresholdPercent ?? 80;
    const aggressiveAt = input.aggressiveThresholdPercent ?? 90;
    const recoveryAt = input.recoveryThresholdPercent ?? 60;

    let mode: TrafficFairnessMode;
    if (utilizationPercent >= aggressiveAt) mode = 'AGGRESSIVE';
    else if (utilizationPercent >= activateAt) mode = 'FAIRNESS_ACTIVE';
    else if (utilizationPercent <= recoveryAt) mode = 'NORMAL';
    else mode = 'RECOVERING';

    if (mode === 'NORMAL' || users.length === 0) {
      return {
        mode,
        utilizationPercent,
        capacityMbps: capacity,
        allocations: users.map((u) => ({
          customerId: u.customerId,
          sessionId: u.sessionId,
          requestedMbps: u.requestedMbps,
          allocatedMbps: u.requestedMbps,
          weight: Math.max(0.1, u.weight ?? 1),
          priority: Math.max(1, u.priority ?? 1),
        })),
      };
    }

    const allocations = this.allocate(users, capacity, mode === 'AGGRESSIVE');
    return { mode, utilizationPercent, capacityMbps: capacity, allocations };
  }

  private allocate(
    users: FairnessInput['activeUsers'],
    capacity: number,
    aggressive: boolean,
  ): FairnessAllocation[] {
    const normalized = users.map((u) => ({
      ...u,
      priority: Math.max(1, u.priority ?? 1),
      weight: Math.max(0.1, u.weight ?? 1),
    }));

    const totalWeight = normalized.reduce((sum, u) => sum + u.weight * u.priority, 0);
    if (totalWeight <= 0) return [];

    // Weighted proportional allocation, capped by each user's demand.
    // The iterative pass redistributes unused capacity instead of wasting it.
    const remaining = new Map(normalized.map((u) => [u.customerId + ':' + (u.sessionId ?? ''), u.requestedMbps]));
    const allocated = new Map<string, number>();
    let remainingCapacity = capacity;
    let pool = normalized.slice();

    for (let pass = 0; pass < normalized.length && pool.length > 0 && remainingCapacity > 0; pass += 1) {
      const poolWeight = pool.reduce((sum, u) => sum + u.weight * u.priority, 0);
      if (poolWeight <= 0) break;
      const next: typeof pool = [];

      for (const user of pool) {
        const key = user.customerId + ':' + (user.sessionId ?? '');
        const share = remainingCapacity * ((user.weight * user.priority) / poolWeight);
        const demand = remaining.get(key) ?? 0;
        const target = aggressive ? Math.min(demand, share) : Math.min(demand, share);
        allocated.set(key, (allocated.get(key) ?? 0) + target);
        remaining.set(key, Math.max(0, demand - target));
        if (demand - target > 0.000001) next.push(user);
      }

      const used = pool.reduce((sum, user) => {
        const key = user.customerId + ':' + (user.sessionId ?? '');
        const before = remaining.get(key) ?? 0;
        return sum + Math.min(before, 0);
      }, 0);
      void used;
      remainingCapacity = Math.max(0, capacity - Array.from(allocated.values()).reduce((a, b) => a + b, 0));
      if (next.length === pool.length) break;
      pool = next;
    }

    return normalized.map((u) => {
      const key = u.customerId + ':' + (u.sessionId ?? '');
      return {
        customerId: u.customerId,
        sessionId: u.sessionId,
        requestedMbps: u.requestedMbps,
        allocatedMbps: Math.max(0, Math.min(u.requestedMbps, allocated.get(key) ?? 0)),
        weight: u.weight,
        priority: u.priority,
      };
    });
  }
}
