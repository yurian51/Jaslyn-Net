import { ServiceUnavailableException } from '@nestjs/common';
import { FairnessService } from './fairness.service';
import { TrafficEnforcementService } from './enforcement.service';
import { NetworkDisconnectCommand, TrafficEnforcementAdapter } from './enforcement.adapter';

describe('TrafficEnforcementService disconnect control', () => {
  const command: NetworkDisconnectCommand = {
    routerId: 'router-1',
    customerId: 'customer-1',
    sessionId: 'session-1',
    username: 'customer-1',
    targetAddress: '10.0.0.20',
    targetMacAddress: 'AA:BB:CC:DD:EE:FF',
    protocol: 'MIKROTIK_REST',
  };

  function adapter(overrides: Partial<TrafficEnforcementAdapter> = {}): TrafficEnforcementAdapter {
    return {
      apply: async () => undefined,
      clearManaged: async () => 0,
      reconcileManaged: async () => 0,
      disconnect: async () => [{ disconnected: true, details: { source: 'router' } }],
      verifyDisconnected: async () => [{ verified: true, details: { source: 'router-read-back' } }],
      ...overrides,
    };
  }

  it('executes and verifies a newly queued disconnect', async () => {
    const disconnect = jest.fn().mockResolvedValue([{ disconnected: true, details: { source: 'router' } }]);
    const verifyDisconnected = jest.fn().mockResolvedValue([{ verified: true, details: { source: 'router-read-back' } }]);
    const markExecuted = jest.fn().mockResolvedValue(undefined);
    const markVerified = jest.fn().mockResolvedValue(undefined);
    const networkCommands = {
      queue: jest.fn().mockResolvedValue({ id: 'cmd-1', reused: false }),
      get: jest.fn().mockResolvedValue({ id: 'cmd-1', status: 'QUEUED' }),
      markExecuted,
      markVerified,
    } as any;
    const service = new TrafficEnforcementService(new FairnessService(), { MIKROTIK_REST: adapter({ disconnect, verifyDisconnected }) }, networkCommands);

    const result = await service.disconnectClient(command, undefined, 'MIKROTIK_REST', 'tenant-1', 'access-reconcile:session-1');

    expect(result.verified).toBe(true);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(verifyDisconnected).toHaveBeenCalledTimes(1);
    expect(markExecuted).toHaveBeenCalledWith('tenant-1', ['cmd-1'], { source: 'router' });
    expect(markVerified).toHaveBeenCalledWith('tenant-1', 'cmd-1', { source: 'router-read-back' });
  });

  it('does not repeat the network side effect when a reused command is already verified', async () => {
    const disconnect = jest.fn();
    const verifyDisconnected = jest.fn();
    const networkCommands = {
      queue: jest.fn().mockResolvedValue({ id: 'cmd-2', reused: true }),
      get: jest.fn().mockResolvedValue({ id: 'cmd-2', status: 'VERIFIED', verification: { source: 'previous-read-back' } }),
    } as any;
    const service = new TrafficEnforcementService(new FairnessService(), { MIKROTIK_REST: adapter({ disconnect, verifyDisconnected }) }, networkCommands);

    const result = await service.disconnectClient(command, undefined, 'MIKROTIK_REST', 'tenant-1', 'access-reconcile:session-2');

    expect(result.verified).toBe(true);
    expect(disconnect).not.toHaveBeenCalled();
    expect(verifyDisconnected).not.toHaveBeenCalled();
  });

  it('re-verifies an EXECUTED reused command before considering another disconnect', async () => {
    const disconnect = jest.fn();
    const verifyDisconnected = jest.fn().mockResolvedValue([{ verified: true, details: { source: 're-read' } }]);
    const markVerified = jest.fn().mockResolvedValue(undefined);
    const networkCommands = {
      queue: jest.fn().mockResolvedValue({ id: 'cmd-3', reused: true }),
      get: jest.fn().mockResolvedValue({ id: 'cmd-3', status: 'EXECUTED' }),
      markVerified,
    } as any;
    const service = new TrafficEnforcementService(new FairnessService(), { MIKROTIK_REST: adapter({ disconnect, verifyDisconnected }) }, networkCommands);

    const result = await service.disconnectClient(command, undefined, 'MIKROTIK_REST', 'tenant-1', 'access-reconcile:session-3');

    expect(result.verified).toBe(true);
    expect(disconnect).not.toHaveBeenCalled();
    expect(verifyDisconnected).toHaveBeenCalledTimes(1);
    expect(markVerified).toHaveBeenCalledWith('tenant-1', 'cmd-3', { source: 're-read' });
  });

  it('fails closed for a terminal failed command instead of silently retrying it', async () => {
    const disconnect = jest.fn();
    const networkCommands = {
      queue: jest.fn().mockResolvedValue({ id: 'cmd-4', reused: true }),
      get: jest.fn().mockResolvedValue({ id: 'cmd-4', status: 'FAILED' }),
    } as any;
    const service = new TrafficEnforcementService(new FairnessService(), { MIKROTIK_REST: adapter({ disconnect }) }, networkCommands);

    await expect(service.disconnectClient(command, undefined, 'MIKROTIK_REST', 'tenant-1', 'access-reconcile:session-4')).rejects.toThrow(ServiceUnavailableException);
    expect(disconnect).not.toHaveBeenCalled();
  });
});
