import { TrafficEnforcementService } from './enforcement.service';
import { TrafficEnforcementAdapter } from './enforcement.adapter';

describe('TrafficEnforcementService network verification', () => {
  it('marks a command VERIFIED only after the adapter confirms observed state', async () => {
    const adapter: TrafficEnforcementAdapter = {
      apply: jest.fn().mockResolvedValue(undefined),
      verify: jest.fn().mockResolvedValue([{ verified: true, details: { observed: true } }]),
      clearManaged: jest.fn().mockResolvedValue(0),
      reconcileManaged: jest.fn().mockResolvedValue(0),
    };
    const networkCommands = {
      queueBandwidthCommands: jest.fn().mockResolvedValue([{
        id: 'command-1',
        status: 'QUEUED',
        reused: false,
        command: {
          routerId: 'router-1',
          customerId: 'customer-1',
          sessionId: 'session-1',
          targetAddress: '10.0.0.10',
          maxDownloadMbps: 10,
          maxUploadMbps: 5,
          priority: 1,
          protocol: 'MIKROTIK_REST',
        },
      }]),
      markExecuted: jest.fn().mockResolvedValue(undefined),
      markVerified: jest.fn().mockResolvedValue({ id: 'command-1', status: 'VERIFIED' }),
      markFailed: jest.fn().mockResolvedValue(undefined),
    };
    const fairness = {
      evaluate: jest.fn().mockReturnValue({
        mode: 'NORMAL',
        utilizationPercent: 10,
        allocations: [{ customerId: 'customer-1', sessionId: 'session-1', allocatedMbps: 10, priority: 1 }],
      }),
    };
    const service = new TrafficEnforcementService(fairness as any, { MIKROTIK_REST: adapter }, networkCommands as any);

    const result = await service.evaluateAndApply(
      'router-1',
      { enabled: true, capacityMbps: 100, activateThresholdPercent: 70, aggressiveThresholdPercent: 90, recoveryThresholdPercent: 60 },
      [{ customerId: 'customer-1', sessionId: 'session-1', requestedMbps: 10, priority: 1, weight: 1, uploadRatio: 0.5 }],
      { 'customer-1:session-1': { targetAddress: '10.0.0.10', protocol: 'MIKROTIK_REST' } },
      0.5,
      undefined,
      'MIKROTIK_REST',
      'tenant-1',
      'corr-1',
    );

    expect(adapter.apply).toHaveBeenCalledTimes(1);
    expect(adapter.verify).toHaveBeenCalledTimes(1);
    expect(networkCommands.markExecuted).toHaveBeenCalledWith('tenant-1', ['command-1'], { protocol: 'MIKROTIK_REST', commandCount: 1 });
    expect(networkCommands.markVerified).toHaveBeenCalledWith('tenant-1', 'command-1', { observed: true });
    expect(result.verifiedCommandIds).toEqual(['command-1']);
    expect(result.verificationFailures).toBe(0);
  });

  it('does not mark a command VERIFIED when observed state disagrees', async () => {
    const adapter: TrafficEnforcementAdapter = {
      apply: jest.fn().mockResolvedValue(undefined),
      verify: jest.fn().mockResolvedValue([{ verified: false, details: { observed: false } }]),
      clearManaged: jest.fn().mockResolvedValue(0),
      reconcileManaged: jest.fn().mockResolvedValue(0),
    };
    const networkCommands = {
      queueBandwidthCommands: jest.fn().mockResolvedValue([{
        id: 'command-1', status: 'QUEUED', reused: false,
        command: { routerId: 'router-1', customerId: 'customer-1', sessionId: 'session-1', targetAddress: '10.0.0.10', maxDownloadMbps: 10, maxUploadMbps: 5, priority: 1, protocol: 'MIKROTIK_REST' },
      }]),
      markExecuted: jest.fn().mockResolvedValue(undefined),
      markVerified: jest.fn(),
      markFailed: jest.fn(),
    };
    const fairness = { evaluate: jest.fn().mockReturnValue({ mode: 'NORMAL', utilizationPercent: 10, allocations: [{ customerId: 'customer-1', sessionId: 'session-1', allocatedMbps: 10, priority: 1 }] }) };
    const service = new TrafficEnforcementService(fairness as any, { MIKROTIK_REST: adapter }, networkCommands as any);

    const result = await service.evaluateAndApply(
      'router-1',
      { enabled: true, capacityMbps: 100, activateThresholdPercent: 70, aggressiveThresholdPercent: 90, recoveryThresholdPercent: 60 },
      [{ customerId: 'customer-1', sessionId: 'session-1', requestedMbps: 10, priority: 1, weight: 1, uploadRatio: 0.5 }],
      { 'customer-1:session-1': { targetAddress: '10.0.0.10', protocol: 'MIKROTIK_REST' } },
      0.5,
      undefined,
      'MIKROTIK_REST',
      'tenant-1',
      'corr-1',
    );

    expect(networkCommands.markVerified).not.toHaveBeenCalled();
    expect(result.verifiedCommandIds).toEqual([]);
    expect(result.verificationFailures).toBe(1);
  });
});
