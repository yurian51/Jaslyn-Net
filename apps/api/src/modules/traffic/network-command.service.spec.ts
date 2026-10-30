import { NetworkCommandService } from './network-command.service';
import { BandwidthEnforcementCommand } from './enforcement.adapter';

describe('NetworkCommandService', () => {
  const command: BandwidthEnforcementCommand = {
    routerId: '00000000-0000-0000-0000-000000000001',
    customerId: '00000000-0000-0000-0000-000000000002',
    sessionId: '00000000-0000-0000-0000-000000000003',
    targetAddress: '10.0.0.10',
    maxDownloadMbps: 10,
    maxUploadMbps: 5,
    priority: 1,
    protocol: 'MIKROTIK_REST',
  };

  const matchingPayload = { target_matches: true, request_matches: true, provider_matches: true };

  it('queues a durable command with target and request snapshots', async () => {
    const clientQuery = jest.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'command-1', status: 'QUEUED' }] })
      .mockResolvedValueOnce(undefined);
    const client = { query: clientQuery, release: jest.fn() } as any;
    const db = { connect: jest.fn().mockResolvedValue(client) } as any;
    const service = new NetworkCommandService(db);

    await expect(service.queueBandwidthCommands('tenant-1', [command], 'operator', 'corr-1'))
      .resolves.toEqual([{ id: 'command-1', command, status: 'QUEUED', reused: false }]);
    expect(clientQuery).toHaveBeenCalledWith('BEGIN');
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (tenant_id, command_type, correlation_id)'));
    expect(clientQuery).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('converts a concurrent unique-conflict into a validated idempotent replay', async () => {
    const clientQuery = jest.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'command-winner', status: 'EXECUTED', ...matchingPayload }], rowCount: 1 })
      .mockResolvedValueOnce(undefined);
    const client = { query: clientQuery, release: jest.fn() } as any;
    const db = { connect: jest.fn().mockResolvedValue(client) } as any;
    const service = new NetworkCommandService(db);

    await expect(service.queueBandwidthCommands('tenant-1', [command], 'operator', 'corr-1'))
      .resolves.toEqual([{ id: 'command-winner', command, status: 'EXECUTED', reused: true }]);
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (tenant_id, command_type, correlation_id)'));
    expect(clientQuery).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('reuses verified commands without reopening their lifecycle when payload matches', async () => {
    const clientQuery = jest.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [{ id: 'command-1', status: 'VERIFIED', ...matchingPayload }], rowCount: 1 })
      .mockResolvedValueOnce(undefined);
    const client = { query: clientQuery, release: jest.fn() } as any;
    const db = { connect: jest.fn().mockResolvedValue(client) } as any;
    const service = new NetworkCommandService(db);

    await expect(service.queueBandwidthCommands('tenant-1', [command], 'operator', 'corr-1'))
      .resolves.toEqual([{ id: 'command-1', command, status: 'VERIFIED', reused: true }]);
  });

  it('preserves failed commands until an explicit retry is requested', async () => {
    const clientQuery = jest.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [{ id: 'command-1', status: 'FAILED', ...matchingPayload }], rowCount: 1 })
      .mockResolvedValueOnce(undefined);
    const client = { query: clientQuery, release: jest.fn() } as any;
    const db = { connect: jest.fn().mockResolvedValue(client) } as any;
    const service = new NetworkCommandService(db);

    await expect(service.queueBandwidthCommands('tenant-1', [command], 'operator', 'corr-1'))
      .resolves.toEqual([{ id: 'command-1', command, status: 'FAILED', reused: true }]);
  });

  it('rejects correlation reuse when the requested network side effect changed', async () => {
    const clientQuery = jest.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [{ id: 'command-1', status: 'VERIFIED', target_matches: false, request_matches: true, provider_matches: true }], rowCount: 1 })
      .mockResolvedValueOnce(undefined);
    const client = { query: clientQuery, release: jest.fn() } as any;
    const db = { connect: jest.fn().mockResolvedValue(client) } as any;
    const service = new NetworkCommandService(db);

    await expect(service.queueBandwidthCommands('tenant-1', [command], 'operator', 'corr-1'))
      .rejects.toThrow('Network command correlation is already bound to a different operation');
    expect(clientQuery).toHaveBeenCalledWith('ROLLBACK');
  });

  it('moves a FAILED command to RETRYING only through an explicit retry', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ id: 'command-1', status: 'RETRYING' }], rowCount: 1 });
    const db = { query } as any;
    const service = new NetworkCommandService(db);

    await expect(service.retry('tenant-1', 'command-1')).resolves.toEqual({ id: 'command-1', status: 'RETRYING' });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("status='RETRYING'"), ['tenant-1', 'command-1']);
  });

  it('rejects retrying a command that is not FAILED', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const db = { query } as any;
    const service = new NetworkCommandService(db);

    await expect(service.retry('tenant-1', 'command-1')).rejects.toThrow('Only FAILED network commands can be explicitly retried');
  });

  it('marks executed commands and increments attempts', async () => {
    const query = jest.fn().mockResolvedValue({ rowCount: 1 });
    const db = { query } as any;
    const service = new NetworkCommandService(db);

    await service.markExecuted('tenant-1', ['command-1'], { accepted: true });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("status='EXECUTED'"), ['tenant-1', ['command-1'], JSON.stringify({ accepted: true })]);
  });

  it('marks adapter failures as FAILED instead of hiding the error', async () => {
    const query = jest.fn().mockResolvedValue({ rowCount: 1 });
    const db = { query } as any;
    const service = new NetworkCommandService(db);

    await service.markFailed('tenant-1', ['command-1'], new Error('router timeout'));
    expect(query).toHaveBeenCalledWith(expect.stringContaining("status='FAILED'"), ['tenant-1', ['command-1'], 'router timeout']);
  });

  it('only transitions EXECUTED commands to VERIFIED', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ id: 'command-1', status: 'VERIFIED' }] });
    const db = { query } as any;
    const service = new NetworkCommandService(db);

    await expect(service.markVerified('tenant-1', 'command-1', { observed: true })).resolves.toEqual({ id: 'command-1', status: 'VERIFIED' });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("status='VERIFIED'"), ['tenant-1', 'command-1', JSON.stringify({ observed: true })]);
  });
});
