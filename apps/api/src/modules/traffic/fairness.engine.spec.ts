import { FairnessEngine } from './fairness.engine';

describe('FairnessEngine', () => {
  const engine = new FairnessEngine();

  it('does not throttle below the congestion threshold', () => {
    const result = engine.decide({
      capacityMbps: 100,
      activeUsers: [{ customerId: 'a', requestedMbps: 20 }],
    });
    expect(result.mode).toBe('NORMAL');
    expect(result.allocations[0].allocatedMbps).toBe(20);
  });

  it('shares congested capacity using weights and priorities', () => {
    const result = engine.decide({
      capacityMbps: 100,
      activeUsers: [
        { customerId: 'basic', requestedMbps: 80, priority: 1 },
        { customerId: 'premium', requestedMbps: 80, priority: 3 },
      ],
    });
    expect(result.mode).toBe('AGGRESSIVE');
    expect(result.allocations[1].allocatedMbps).toBeGreaterThan(result.allocations[0].allocatedMbps);
    expect(result.allocations.reduce((sum, a) => sum + a.allocatedMbps, 0)).toBeCloseTo(100);
  });

  it('redistributes unused demand instead of wasting capacity', () => {
    const result = engine.decide({
      capacityMbps: 100,
      activeUsers: [
        { customerId: 'small', requestedMbps: 10 },
        { customerId: 'large', requestedMbps: 100 },
      ],
    });
    const total = result.allocations.reduce((sum, a) => sum + a.allocatedMbps, 0);
    expect(total).toBeCloseTo(100);
    expect(result.allocations.find((a) => a.customerId === 'small')?.allocatedMbps).toBe(10);
  });

  it('supports custom thresholds', () => {
    const result = engine.decide({
      capacityMbps: 100,
      activateThresholdPercent: 70,
      aggressiveThresholdPercent: 85,
      activeUsers: [{ customerId: 'a', requestedMbps: 75 }],
    });
    expect(result.mode).toBe('FAIRNESS_ACTIVE');
  });
});
