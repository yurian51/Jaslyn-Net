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

  it('achieves equal-share fairness for equal-demand equal-weight users', () => {
    const result = engine.decide({
      capacityMbps: 100,
      activeUsers: Array.from({ length: 10 }, (_, index) => ({
        customerId: `equal-${index}`,
        requestedMbps: 100,
        weight: 1,
        priority: 1,
      })),
    });
    const allocations = result.allocations.map((allocation) => allocation.allocatedMbps);
    expect(new Set(allocations).size).toBe(1);
    expect(allocations[0]).toBeCloseTo(10);
    expect(allocations.reduce((sum, value) => sum + value, 0)).toBeCloseTo(100);
  });

  it('preserves weighted max-min ratios for uncapped service tiers', () => {
    const result = engine.decide({
      capacityMbps: 60,
      activeUsers: [
        { customerId: 'basic', requestedMbps: 100, weight: 1, priority: 1 },
        { customerId: 'premium', requestedMbps: 100, weight: 2, priority: 1 },
      ],
    });
    const basic = result.allocations.find((allocation) => allocation.customerId === 'basic')?.allocatedMbps ?? 0;
    const premium = result.allocations.find((allocation) => allocation.customerId === 'premium')?.allocatedMbps ?? 0;
    expect(premium / basic).toBeCloseTo(2, 5);
    expect(basic + premium).toBeCloseTo(60);
  });

  it('never allocates more than demand and remains work-conserving', () => {
    const result = engine.decide({
      capacityMbps: 100,
      activeUsers: [
        { customerId: 'small', requestedMbps: 10 },
        { customerId: 'large', requestedMbps: 100 },
      ],
    });
    for (const allocation of result.allocations) expect(allocation.allocatedMbps).toBeLessThanOrEqual(allocation.requestedMbps);
    expect(result.allocations.reduce((sum, allocation) => sum + allocation.allocatedMbps, 0)).toBeCloseTo(100);
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
