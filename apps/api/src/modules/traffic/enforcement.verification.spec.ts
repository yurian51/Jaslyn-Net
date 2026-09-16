import { TrafficEnforcementService } from './enforcement.service';
import { TrafficEnforcementAdapter } from './enforcement.adapter';

describe('TrafficEnforcementService network verification', () => {
  const policy = { enabled: true, capacityMbps: 100, activateThresholdPercent: 70, aggressiveThresholdPercent: 90, recoveryThresholdPercent: 60 };
  const user = { customerId: 'customer-1', sessionId: 'session-1', requestedMbps: 10, priority: 1, weight: 1, uploadRatio: 0.5 };
  const command = { routerId: 'router-1', customerId: 'customer-1', sessionId: 'session-1', targetAddress: '10.0.0.10', maxDownloadMbps: 10, maxUploadMbps: 5, priority: 1, protocol: 'MIKROTIK_REST' as const };
  const fairness = { evaluate: jest.fn().mockReturnValue({ mode: 'NORMAL', utilizationPercent: 10, allocations: [{ customerId: 'customer-1', sessionId: 'session-1', allocatedMbps: 10, priority: 1 }] }) };

  function makeAdapter(verified: boolean): TrafficEnforcementAdapter {
    return { apply: jest.fn().mockResolvedValue(undefined), verify: jest.fn().mockResolvedValue([{ verified, details: { observed: verified } }]), clearManaged: jest.fn().mockResolvedValue(0), reconcileManaged: jest.fn().mockResolvedValue(0) };
  }
  function makeCommands() { return { queueBandwidthCommands: jest.fn().mockResolvedValue([{ id: 'command-1', status: 'QUEUED', reused: false, command }]), markExecuted: jest.fn().mockResolvedValue(undefined), markVerified: jest.fn().mockResolvedValue(undefined), markFailed: jest.fn().mockResolvedValue(undefined) }; }

  it('marks a command VERIFIED only after actual state matches', async () => {
    const adapter = makeAdapter(true); const networkCommands = makeCommands();
    const service = new TrafficEnforcementService(fairness as any, { MIKROTIK_REST: adapter }, networkCommands as any);
    const result = await service.evaluateAndApply('router-1', policy, [user], { 'customer-1:session-1': { targetAddress: '10.0.0.10', protocol: 'MIKROTIK_REST' } }, 0.5, undefined, 'MIKROTIK_REST', 'tenant-1', 'corr-1');
    expect(adapter.apply).toHaveBeenCalledTimes(1); expect(adapter.verify).toHaveBeenCalledTimes(1); expect(networkCommands.markVerified).toHaveBeenCalledWith('tenant-1', 'command-1', { observed: true }); expect(result.verifiedCommandIds).toEqual(['command-1']); expect(result.verificationFailures).toBe(0);
  });

  it('does not mark a command VERIFIED when actual state disagrees', async () => {
    const adapter = makeAdapter(false); const networkCommands = makeCommands();
    const service = new TrafficEnforcementService(fairness as any, { MIKROTIK_REST: adapter }, networkCommands as any);
    const result = await service.evaluateAndApply('router-1', policy, [user], { 'customer-1:session-1': { targetAddress: '10.0.0.10', protocol: 'MIKROTIK_REST' } }, 0.5, undefined, 'MIKROTIK_REST', 'tenant-1', 'corr-1');
    expect(networkCommands.markVerified).not.toHaveBeenCalled(); expect(result.verifiedCommandIds).toEqual([]); expect(result.verificationFailures).toBe(1);
  });
});
