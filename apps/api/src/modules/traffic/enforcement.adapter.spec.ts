import { NoopTrafficEnforcementAdapter, toEnforcementCommands } from './enforcement.adapter';

describe('traffic enforcement adapter', () => {
  it('converts allocations into bounded router-neutral commands', () => {
    const commands = toEnforcementCommands('router-1', [
      { customerId: 'c1', sessionId: 's1', requestedMbps: 20, allocatedMbps: 7.12345, weight: 1, priority: 3 },
      { customerId: 'c2', requestedMbps: 10, allocatedMbps: 0, weight: 1, priority: 0 },
    ], 0.4);
    expect(commands).toEqual([{
      routerId: 'router-1', customerId: 'c1', sessionId: 's1',
      maxDownloadMbps: 7.123, maxUploadMbps: 2.849, priority: 3,
    }]);
  });

  it('clamps invalid upload ratios', () => {
    expect(toEnforcementCommands('r', [{ customerId: 'c', requestedMbps: 5, allocatedMbps: 5, weight: 1, priority: 1 }], 9)[0].maxUploadMbps).toBe(5);
    expect(toEnforcementCommands('r', [{ customerId: 'c', requestedMbps: 5, allocatedMbps: 5, weight: 1, priority: 1 }], -1)[0].maxUploadMbps).toBe(0);
  });

  it('keeps the default adapter side-effect free', async () => {
    await expect(new NoopTrafficEnforcementAdapter().apply([])).resolves.toBeUndefined();
  });
});
