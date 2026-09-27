import { IncidentsService } from './incidents.service';

describe('IncidentsService', () => {
  it('lists incidents with tenant isolation', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) } as any;
    const audit = { record: jest.fn() } as any;
    const domainEvents = { enqueue: jest.fn() } as any;
    const service = new IncidentsService(db, audit, domainEvents);

    const result = await service.list('tenant-1', 'OPEN');

    expect(result).toEqual({ data: [], count: 0 });
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('WHERE i.tenant_id=$1'), ['tenant-1', 'OPEN']);
  });

  it('returns not-found for an unknown incident', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) } as any;
    const audit = { record: jest.fn() } as any;
    const domainEvents = { enqueue: jest.fn() } as any;
    const service = new IncidentsService(db, audit, domainEvents);

    await expect(service.get('tenant-1', 'missing')).rejects.toThrow('Incident not found');
  });
});

  it('rejects assignment to an inactive or cross-tenant user', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) } as any;
    const audit = { record: jest.fn() } as any;
    const domainEvents = { enqueue: jest.fn() } as any;
    const service = new IncidentsService(db, audit, domainEvents);

    await expect(service.assign('tenant-1', 'incident-1', 'user-2')).rejects.toThrow('Active assignee not found in tenant');
    expect(db.query).toHaveBeenCalledWith(
      'SELECT id FROM users WHERE tenant_id=$1 AND id=$2 AND is_active=true',
      ['tenant-1', 'user-2'],
    );
  });

  it('records an assignment transition and returns the updated incident', async () => {
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ id: 'user-2' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 'incident-1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 'incident-1', status: 'OPEN' }], rowCount: 1 }),
    } as any;
    const audit = { record: jest.fn() } as any;
    const domainEvents = { enqueue: jest.fn() } as any;
    const service = new IncidentsService(db, audit, domainEvents);

    const result = await service.assign('tenant-1', 'incident-1', 'user-2', { userId: 'operator-1' });

    expect(result).toEqual({ id: 'incident-1', status: 'OPEN' });
    expect(audit.record).toHaveBeenCalledWith('tenant-1', 'INCIDENT_ASSIGNED', 'incident', 'incident-1', { assigneeUserId: 'user-2' }, { userId: 'operator-1' });
  });
});
