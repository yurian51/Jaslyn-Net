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
    expect(clientQuery).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('reuses verified commands without reopening their lifecycle', async () => {
    const clientQuery = jest.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [{ id: 'command-1', status: 'VERIFIED' }], rowCount: 1 })
      .mockResolvedValueOnce(undefined);
    const client = { query: clientQuery, release: jest.fn() } as any;
    const db = { connect: jest.fn().mockResolvedValue(client) } as any;
    const service = new NetworkCommandService(db);

    await expect(service.queueBandwidthCommands('tenant-1', [command], 'operator', 'corr-1'))
      .resolves.toEqual([{ id: 'command-1', command, status: 'VERIFIED', reused: true }]);
    expect(clientQuery).not.toHaveBeenCalledWith(expect.stringContaining("status='QUEUED'"), expect.anything());
  });

  it('requeues failed commands as an explicit retry attempt', async () => {
    const clientQuery = jest.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [{ id: 'command-1', status: 'FAILED' }], rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce(undefined);
    const client = { query: clientQuery, release: jest.fn() } as any;
    const db = { connect: jest.fn().mockResolvedValue(client) } as any;
    const service = new NetworkCommandService(db);

    await expect(service.queueBandwidthCommands('tenant-1', [command], 'operator', 'corr-1'))
      .resolves.toEqual([{ id: 'command-1', command, status: 'QUEUED', reused: true }]);
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining("status='QUEUED'"), expect.any(Array));
  });

  it('marks executed commands and increments attempts', async () => {
    const query = jest.fn().mockResolvedValue({ rowCount: 1 });
    const db = { query } as any;
    const service = new NetworkCommandService(db);

    await service.markExecuted('tenant-1', ['command-1'], { accepted: true });

    expect(query).toHaveBeenCalledWith(expect.stringContaining("status='EXECUTED'"), [
      'tenant-1',
      ['command-1'],
      JSON.stringify({ accepted: true }),
    ]);
  });

  it('marks adapter failures as FAILED instead of hiding the error', async () => {
    const query = jest.fn().mockResolvedValue({ rowCount: 1 });
    const db = { query } as any;
    const service = new NetworkCommandService(db);

    await service.markFailed('tenant-1', ['command-1'], new Error('router timeout'));

    expect(query).toHaveBeenCalledWith(expect.stringContaining("status='FAILED'"), [
      'tenant-1',
      ['command-1'],
      'router timeout',
    ]);
  });

  it('only transitions EXECUTED commands to VERIFIED', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ id: 'command-1', status: 'VERIFIED' }] });
    const db = { query } as any;
    const service = new NetworkCommandService(db);

    await expect(service.markVerified('tenant-1', 'command-1', { observed: true }))
      .resolves.toEqual({ id: 'command-1', status: 'VERIFIED' });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("status='VERIFIED'"), [
      'tenant-1',
      'command-1',
      JSON.stringify({ observed: true }),
    ]);
  });
});
