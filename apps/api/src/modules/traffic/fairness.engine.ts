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

  private allocate(users: FairnessInput['activeUsers'], capacity: number): FairnessAllocation[] {
    const remaining = new Map<string, number>();
    const allocated = new Map<string, number>();
    for (const u of users) { const key = this.key(u); remaining.set(key, u.requestedMbps); allocated.set(key, 0); }
    let pool = users.slice();
    let remainingCapacity = capacity;
    for (let pass = 0; pass < users.length && pool.length > 0 && remainingCapacity > 0; pass += 1) {
      const totalWeight = pool.reduce((sum, u) => sum + (u.weight ?? 1) * (u.priority ?? 1), 0);
      if (totalWeight <= 0) break;
      let usedThisPass = 0;
      const next: typeof pool = [];
      for (const u of pool) {
        const key = this.key(u); const demand = remaining.get(key) ?? 0;
        const share = remainingCapacity * (((u.weight ?? 1) * (u.priority ?? 1)) / totalWeight);
        const grant = Math.min(demand, share);
        allocated.set(key, (allocated.get(key) ?? 0) + grant); remaining.set(key, demand - grant); usedThisPass += grant;
        if (demand - grant > 0.000001) next.push(u);
      }
      remainingCapacity = Math.max(0, remainingCapacity - usedThisPass);
      if (next.length === pool.length || usedThisPass <= 0.000001) break;
      pool = next;
    }
    return users.map((u) => { const key = this.key(u); return { customerId: u.customerId, sessionId: u.sessionId, requestedMbps: u.requestedMbps, allocatedMbps: Math.max(0, Math.min(u.requestedMbps, allocated.get(key) ?? 0)), weight: Math.max(0.1, u.weight ?? 1), priority: Math.max(1, u.priority ?? 1) }; });
  }

  private key(user: { customerId: string; sessionId?: string }): string { return `${user.customerId}:${user.sessionId ?? ''}`; }
}
