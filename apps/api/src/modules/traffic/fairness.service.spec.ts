import { FairnessService } from './fairness.service';

describe('FairnessService', () => {
  it('returns requested rates without throttling when disabled', () => {
    const service = new FairnessService();
    const result = service.evaluate({ enabled: false, capacityMbps: 50, activateThresholdPercent: 80, aggressiveThresholdPercent: 90, recoveryThresholdPercent: 60 }, [
      { customerId: 'c1', requestedMbps: 20 },
      { customerId: 'c2', requestedMbps: 30 },
    ]);
    expect(result.mode).toBe('NORMAL');
    expect(result.allocations.map((a) => a.allocatedMbps)).toEqual([20, 30]);
  });

  it('uses the engine when enabled and traffic is congested', () => {
    const service = new FairnessService();
    const result = service.evaluate({ enabled: true, capacityMbps: 100, activateThresholdPercent: 80, aggressiveThresholdPercent: 90, recoveryThresholdPercent: 60 }, [
      { customerId: 'basic', requestedMbps: 80, priority: 1 },
      { customerId: 'premium', requestedMbps: 80, priority: 3 },
    ]);
    expect(result.mode).toBe('AGGRESSIVE');
    expect(result.allocations.reduce((sum, a) => sum + a.allocatedMbps, 0)).toBeCloseTo(100);
    expect(result.allocations[1].allocatedMbps).toBeGreaterThan(result.allocations[0].allocatedMbps);
    expect(result.evaluatedAt).toBeInstanceOf(Date);
  });
});
