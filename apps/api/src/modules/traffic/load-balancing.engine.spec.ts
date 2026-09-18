import { LoadBalancingEngine } from './load-balancing.engine';
import { WanMemberState } from './load-balancing.types';

const member = (overrides: Partial<WanMemberState> = {}): WanMemberState => ({
  id: 'wan-1', name: 'WAN A', capacityMbps: 100, configuredWeight: 1, priority: 100,
  enabled: true, drainRequested: false, healthState: 'HEALTHY', latencyMs: 10,
  jitterMs: 2, packetLossPercent: 0, observedUtilizationPercent: 20,
  observedUploadBps: '1000000', observedDownloadBps: '5000000', activeSessions: 10,
  lastHealthCheckAt: null, lastStateChangeAt: null, ...overrides,
});

describe('LoadBalancingEngine', () => {
  it('rejects unsupported strategies', () => {
    expect(() => new LoadBalancingEngine().decide('p1', 'ROUND_ROBIN', [member()])).toThrow('Unsupported load-balancing strategy');
  });

  it('keeps only healthy eligible members for distribution', () => {
    const result = new LoadBalancingEngine().decide('p1', 'WEIGHTED', [
      member({ id: 'a', name: 'A' }),
      member({ id: 'b', name: 'B', healthState: 'UNAVAILABLE' }),
      member({ id: 'c', name: 'C', drainRequested: true }),
    ]);
    expect(result.eligibleMembers.map((item) => item.wanConnectionId)).toEqual(['a']);
    expect(result.failoverActive).toBe(true);
  });

  it('uses capacity in effective weight without changing configured weight', () => {
    const result = new LoadBalancingEngine().decide('p1', 'WEIGHTED', [
      member({ id: 'a', capacityMbps: 100, configuredWeight: 1, observedUtilizationPercent: 10 }),
      member({ id: 'b', capacityMbps: 500, configuredWeight: 1, observedUtilizationPercent: 10 }),
    ]);
    expect(result.eligibleMembers.find((item) => item.wanConnectionId === 'a')?.configuredWeight).toBe(1);
    expect(result.eligibleMembers.find((item) => item.wanConnectionId === 'b')?.configuredWeight).toBe(1);
    expect(result.eligibleMembers.find((item) => item.wanConnectionId === 'b')!.effectiveWeight)
      .toBeGreaterThan(result.eligibleMembers.find((item) => item.wanConnectionId === 'a')!.effectiveWeight);
  });

  it('selects the highest priority path for primary/secondary failover', () => {
    const result = new LoadBalancingEngine().decide('p1', 'PRIMARY_SECONDARY', [
      member({ id: 'primary', priority: 10 }),
      member({ id: 'secondary', priority: 20 }),
    ]);
    expect(result.eligibleMembers).toHaveLength(1);
    expect(result.eligibleMembers[0].wanConnectionId).toBe('primary');
  });
});
