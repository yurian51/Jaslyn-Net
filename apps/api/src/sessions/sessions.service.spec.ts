import { NotFoundException } from '@nestjs/common';
import { SessionsService } from './sessions.service';

describe('SessionsService', () => {
  const query = jest.fn();
  const clientQuery = jest.fn();
  const client = { query: clientQuery, release: jest.fn() } as any;
  const db = { query, connect: jest.fn().mockResolvedValue(client) } as any;
  const audit = { record: jest.fn().mockResolvedValue({ id: 'audit-1' }) } as any;
  let service: SessionsService;

  beforeEach(() => {
    query.mockReset();
    clientQuery.mockReset();
    client.release.mockClear();
    db.connect.mockClear();
    audit.record.mockClear();
    service = new SessionsService(db, audit);
  });

  it('lists only sessions belonging to the tenant', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 's1', status: 'ACTIVE' }], rowCount: 1 });

    const result = await service.list('tenant-a', 'ACTIVE', 50);

    expect(result.data).toHaveLength(1);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE tenant_id=$1'), ['tenant-a', 'ACTIVE', 50]);
  });

  it('rejects a session update when the session is not active in the tenant', async () => {
    query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(service.updateUsage('tenant-a', 'session-b', { bytesIn: 100 })).rejects.toBeInstanceOf(NotFoundException);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("status='ACTIVE'"), ['tenant-a', 'session-b', 100, null]);
  });

  it('starts a session transactionally and refreshes router active users', async () => {
    clientQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: 'customer-a' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'router-a' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'session-a', customerId: 'customer-a', routerId: 'router-a' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await service.start('tenant-a', { customerId: 'customer-a', routerId: 'router-a', username: 'alice' });

    expect(result.id).toBe('session-a');
    expect(clientQuery).toHaveBeenCalledWith('BEGIN');
    expect(clientQuery).toHaveBeenCalledWith('COMMIT');
    expect(audit.record).toHaveBeenCalledWith('tenant-a', 'SESSION_STARTED', 'session', 'session-a', expect.any(Object), {});
  });

  it('ends an active session transactionally and refreshes the router count', async () => {
    clientQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: 'session-a', routerId: 'router-a', endedAt: '2026-09-13T00:00:00Z', bytesIn: '10', bytesOut: '20', bytesTotal: '30', status: 'ENDED' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await service.end('tenant-a', 'session-a');

    expect(result.status).toBe('ENDED');
    expect(clientQuery).toHaveBeenCalledWith('COMMIT');
    expect(audit.record).toHaveBeenCalled();
  });
});
