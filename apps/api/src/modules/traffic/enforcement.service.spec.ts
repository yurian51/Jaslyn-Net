import { FairnessService } from './fairness.service';
import { TrafficEnforcementService } from './enforcement.service';
import { BandwidthEnforcementCommand, TrafficEnforcementAdapter } from './enforcement.adapter';

describe('TrafficEnforcementService', () => {
  it('evaluates fairness and forwards router-neutral commands to the adapter', async () => {
    const applied: BandwidthEnforcementCommand[][] = [];
    const adapter: TrafficEnforcementAdapter = {
      apply: async (commands) => {
        applied.push(commands);
      },
      clearManaged: async () => 0,
      reconcileManaged: async () => 0,
    };
    const service = new TrafficEnforcementService(new FairnessService(), adapter);

    const result = await service.evaluateAndApply(
      'router-1',
      {
        enabled: true,
        capacityMbps: 100,
        activateThresholdPercent: 80,
        aggressiveThresholdPercent: 90,
        recoveryThresholdPercent: 60,
      },
      [
        { customerId: 'customer-1', sessionId: 'session-1', requestedMbps: 80, priority: 1, weight: 1 },
        { customerId: 'customer-2', sessionId: 'session-2', requestedMbps: 80, priority: 1, weight: 1 },
      ],
      {},
      0.5,
    );

    expect(result.applied).toBe(true);
    expect(result.commandCount).toBe(2);
    expect(applied).toHaveLength(1);
    expect(applied[0].map((command) => command.routerId)).toEqual(['router-1', 'router-1']);
    expect(applied[0].every((command) => command.maxDownloadMbps > 0)).toBe(true);
    expect(applied[0].every((command) => command.maxUploadMbps > 0)).toBe(true);
  });

  it('does not create commands for invalid or zero-demand users', async () => {
    let received: BandwidthEnforcementCommand[] = [];
    const adapter: TrafficEnforcementAdapter = {
      apply: async (commands) => {
        received = commands;
      },
      clearManaged: async () => 0,
      reconcileManaged: async () => 0,
    };
    const service = new TrafficEnforcementService(new FairnessService(), adapter);

    const result = await service.evaluateAndApply(
      'router-2',
      {
        enabled: true,
        capacityMbps: 100,
        activateThresholdPercent: 80,
        aggressiveThresholdPercent: 90,
        recoveryThresholdPercent: 60,
      },
      [
        { customerId: 'zero', requestedMbps: 0 },
        { customerId: 'nan', requestedMbps: Number.NaN },
      ],
    );

    expect(result.applied).toBe(false);
    expect(result.commandCount).toBe(0);
    expect(received).toEqual([]);
  });

  it('delegates managed queue cleanup to the router adapter', async () => {
    const clearManaged = jest.fn().mockResolvedValue(3);
    const adapter: TrafficEnforcementAdapter = {
      apply: async () => undefined,
      clearManaged,
      reconcileManaged: async () => 0,
    };
    const service = new TrafficEnforcementService(new FairnessService(), adapter);

    await expect(service.clearManaged('https://router.example/rest')).resolves.toBe(3);
    expect(clearManaged).toHaveBeenCalledWith('https://router.example/rest');
  });

  it('delegates stale queue reconciliation to the router adapter', async () => {
    const reconcileManaged = jest.fn().mockResolvedValue(2);
    const adapter: TrafficEnforcementAdapter = {
      apply: async () => undefined,
      clearManaged: async () => 0,
      reconcileManaged,
    };
    const service = new TrafficEnforcementService(new FairnessService(), adapter);

    await expect(service.reconcileManaged('https://router.example/rest', ['JASLYN-session-1'])).resolves.toBe(2);
    expect(reconcileManaged).toHaveBeenCalledWith('https://router.example/rest', ['JASLYN-session-1']);
  });
});
