import { ServiceUnavailableException } from '@nestjs/common';
import { FairnessService } from './fairness.service';
import { TrafficEnforcementService } from './enforcement.service';
import { BandwidthEnforcementCommand, TrafficEnforcementAdapter } from './enforcement.adapter';

describe('TrafficEnforcementService', () => {
  const policy = {
    enabled: true,
    capacityMbps: 100,
    activateThresholdPercent: 80,
    aggressiveThresholdPercent: 90,
    recoveryThresholdPercent: 60,
  };
  const users = [
    { customerId: 'customer-1', sessionId: 'session-1', requestedMbps: 80, priority: 1, weight: 1 },
    { customerId: 'customer-2', sessionId: 'session-2', requestedMbps: 80, priority: 1, weight: 1 },
  ];

  it('evaluates fairness and forwards router-neutral commands to the adapter', async () => {
    const applied: BandwidthEnforcementCommand[][] = [];
    const adapter: TrafficEnforcementAdapter = {
      apply: async (commands) => {
        applied.push(commands);
      },
      clearManaged: async () => 0,
      reconcileManaged: async () => 0,
    };
    const service = new TrafficEnforcementService(new FairnessService(), { MIKROTIK_REST: adapter });

    const result = await service.evaluateAndApply('router-1', policy, users, {}, 0.5);

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
    const service = new TrafficEnforcementService(new FairnessService(), { MIKROTIK_REST: adapter });

    const result = await service.evaluateAndApply(
      'router-2',
      policy,
      [
        { customerId: 'zero', requestedMbps: 0 },
        { customerId: 'nan', requestedMbps: Number.NaN },
      ],
    );

    expect(result.applied).toBe(false);
    expect(result.commandCount).toBe(0);
    expect(received).toEqual([]);
  });

  it('fails closed when the requested protocol has no adapter', async () => {
    const service = new TrafficEnforcementService(new FairnessService(), {});

    await expect(service.evaluateAndApply(
      'router-unsupported',
      policy,
      [{ customerId: 'customer-1', requestedMbps: 10, priority: 1, weight: 1 }],
      {},
      0.5,
      undefined,
      'SNMP',
    )).rejects.toThrow(ServiceUnavailableException);
  });

  it('does not send a VERIFIED reused command back to the network adapter', async () => {
    const apply = jest.fn().mockResolvedValue(undefined);
    const markExecuted = jest.fn().mockResolvedValue(undefined);
    const networkCommands = {
      queueBandwidthCommands: jest.fn().mockImplementation(async (_tenantId: string, commands: BandwidthEnforcementCommand[]) =>
        commands.map((command, index) => ({ id: `cmd-${index}`, command, status: 'VERIFIED', reused: true }))),
      markExecuted,
    } as any;
    const adapter: TrafficEnforcementAdapter = {
      apply,
      clearManaged: async () => 0,
      reconcileManaged: async () => 0,
    };
    const service = new TrafficEnforcementService(new FairnessService(), { MIKROTIK_REST: adapter }, networkCommands);

    const result = await service.evaluateAndApply('router-3', policy, users, {}, 0.5, undefined, 'MIKROTIK_REST', 'tenant-1', 'fairness-1');

    expect(result.applied).toBe(false);
    expect(result.commandCount).toBe(0);
    expect(result.commandIds).toEqual([]);
    expect(apply).not.toHaveBeenCalled();
    expect(markExecuted).not.toHaveBeenCalled();
  });

  it('requeues a FAILED command and sends the executable retry to the adapter', async () => {
    const apply = jest.fn().mockResolvedValue(undefined);
    const markExecuted = jest.fn().mockResolvedValue(undefined);
    const networkCommands = {
      queueBandwidthCommands: jest.fn().mockImplementation(async (_tenantId: string, commands: BandwidthEnforcementCommand[]) =>
        commands.map((command, index) => ({ id: `retry-${index}`, command, status: 'QUEUED', reused: true }))),
      markExecuted,
    } as any;
    const adapter: TrafficEnforcementAdapter = {
      apply,
      clearManaged: async () => 0,
      reconcileManaged: async () => 0,
    };
    const service = new TrafficEnforcementService(new FairnessService(), { MIKROTIK_REST: adapter }, networkCommands);

    const result = await service.evaluateAndApply('router-4', policy, users, {}, 0.5, undefined, 'MIKROTIK_REST', 'tenant-1', 'fairness-2');

    expect(result.applied).toBe(true);
    expect(result.commandCount).toBe(2);
    expect(result.commandIds).toEqual(['retry-0', 'retry-1']);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply.mock.calls[0][0]).toHaveLength(2);
    expect(markExecuted).toHaveBeenCalledWith('tenant-1', ['retry-0', 'retry-1'], { protocol: 'MIKROTIK_REST', commandCount: 2 });
  });

  it('executes only non-terminal commands when the durable queue returns a mixed set', async () => {
    const apply = jest.fn().mockResolvedValue(undefined);
    const markExecuted = jest.fn().mockResolvedValue(undefined);
    const networkCommands = {
      queueBandwidthCommands: jest.fn().mockImplementation(async (_tenantId: string, commands: BandwidthEnforcementCommand[]) => [
        { id: 'terminal-0', command: commands[0], status: 'VERIFIED', reused: true },
        { id: 'exec-1', command: commands[1], status: 'QUEUED', reused: true },
      ]),
      markExecuted,
    } as any;
    const adapter: TrafficEnforcementAdapter = {
      apply,
      clearManaged: async () => 0,
      reconcileManaged: async () => 0,
    };
    const service = new TrafficEnforcementService(new FairnessService(), { MIKROTIK_REST: adapter }, networkCommands);

    const result = await service.evaluateAndApply('router-5', policy, users, {}, 0.5, undefined, 'MIKROTIK_REST', 'tenant-1', 'fairness-3');

    expect(result.commandCount).toBe(1);
    expect(result.commandIds).toEqual(['exec-1']);
    expect(result.commands[0]).toEqual(users.length ? expect.any(Object) : undefined);
    expect(apply.mock.calls[0][0]).toHaveLength(1);
    expect(markExecuted).toHaveBeenCalledWith('tenant-1', ['exec-1'], { protocol: 'MIKROTIK_REST', commandCount: 1 });
  });

  it('delegates managed queue cleanup to the router adapter', async () => {
    const clearManaged = jest.fn().mockResolvedValue(3);
    const adapter: TrafficEnforcementAdapter = {
      apply: async () => undefined,
      clearManaged,
      reconcileManaged: async () => 0,
    };
    const service = new TrafficEnforcementService(new FairnessService(), { MIKROTIK_REST: adapter });

    await expect(service.clearManaged('https://router.example/rest')).resolves.toBe(3);
    expect(clearManaged).toHaveBeenCalledWith('https://router.example/rest', undefined, undefined);
  });

  it('delegates stale queue reconciliation to the router adapter', async () => {
    const reconcileManaged = jest.fn().mockResolvedValue(2);
    const adapter: TrafficEnforcementAdapter = {
      apply: async () => undefined,
      clearManaged: async () => 0,
      reconcileManaged,
    };
    const service = new TrafficEnforcementService(new FairnessService(), { MIKROTIK_REST: adapter });

    await expect(service.reconcileManaged('https://router.example/rest', ['JASLYN-session-1'])).resolves.toBe(2);
    expect(reconcileManaged).toHaveBeenCalledWith('https://router.example/rest', ['JASLYN-session-1'], undefined, undefined);
  });
});
