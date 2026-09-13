import { NotFoundException } from '@nestjs/common';
import { SessionsService } from './sessions.service';

describe('SessionsService', () => {
  const query = jest.fn();
  const db = { query } as any;
  const audit = { record: jest.fn().mockResolvedValue({ id: 'audit-1' }) } as any;
  let service: SessionsService;

  beforeEach(() => {
    query.mockReset();
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

  it('starts a session only after validating the tenant customer and router', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'customer-a' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'router-a' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'session-a', customerId: 'customer-a', routerId: 'router-a' }], rowCount: 1 });

    const result = await service.start('tenant-a', { customerId: 'customer-a', routerId: 'router-a', username: 'alice' });

    expect(result.id).toBe('session-a');
    expect(audit.record).toHaveBeenCalledWith('tenant-a', 'SESSION_STARTED', 'session', 'session-a', expect.any(Object), {});
  });

  it('ends only an active session in the tenant', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'session-a', endedAt: '2026-09-13T00:00:00Z', bytesIn: '10', bytesOut: '20', bytesTotal: '30', status: 'ENDED' }], rowCount: 1 });

    const result = await service.end('tenant-a', 'session-a');

    expect(result.status).toBe('ENDED');
    expect(audit.record).toHaveBeenCalled();
  });
});
