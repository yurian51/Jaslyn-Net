import { IncidentsService } from './incidents.service';

describe('IncidentsService', () => {
  it('lists incidents with tenant isolation', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) } as any;
    const audit = { record: jest.fn() } as any;
    const service = new IncidentsService(db, audit, { enqueue: jest.fn() } as any);

    const result = await service.list('tenant-1', 'OPEN');

    expect(result).toEqual({ data: [], count: 0 });
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('WHERE i.tenant_id=$1'), ['tenant-1', 'OPEN']);
  });

  it('returns not-found for an unknown incident', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) } as any;
    const audit = { record: jest.fn() } as any;
    const service = new IncidentsService(db, audit);

    await expect(service.get('tenant-1', 'missing')).rejects.toThrow('Incident not found');
  });
  it('rejects invalid or excessively long SLA report ranges before querying data', async () => {
    const db = { query: jest.fn() } as any;
    const service = new IncidentsService(db, { record: jest.fn() } as any, { enqueue: jest.fn() } as any);
    await expect(service.getSlaReport('tenant-1','not-a-date','2026-10-11T00:00:00.000Z')).rejects.toThrow('A valid report date range is required');
    await expect(service.getSlaReport('tenant-1','2020-01-01T00:00:00.000Z','2026-10-11T00:00:00.000Z')).rejects.toThrow('SLA report range cannot exceed 366 days');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects a maintenance window with an invalid time range before persistence', async () => {
    const db = { query: jest.fn() } as any;
    const service = new IncidentsService(db, { record: jest.fn() } as any, { enqueue: jest.fn() } as any);

    await expect(service.createMaintenanceWindow('tenant-1', 'owner-1', {
      title: 'Planned core upgrade',
      scopeType: 'TENANT' as any,
      startsAt: '2026-10-11T12:00:00.000Z',
      endsAt: '2026-10-11T11:00:00.000Z',
    } as any)).rejects.toThrow('Maintenance end time must be later than its start time');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('returns only published public status data and derives overall status from visible incidents', async () => {
    const db = { query: jest.fn()
      .mockResolvedValueOnce({ rows: [{ tenantId: 'tenant-secret', slug: 'example-isp', displayName: 'Example ISP', description: 'Service status' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ componentKey: 'internet', name: 'Internet', status: 'OPERATIONAL' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'incident-1', title: 'Public outage', severity: 'CRITICAL', status: 'OPEN' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }),
    } as any;
    const service = new IncidentsService(db, { record: jest.fn() } as any, { enqueue: jest.fn() } as any);

    const result = await service.getPublicStatus('example-isp');

    expect(result).toMatchObject({ slug: 'example-isp', displayName: 'Example ISP', overallStatus: 'MAJOR_OUTAGE', incidents: [{ title: 'Public outage' }] });
    expect(result).not.toHaveProperty('tenantId');
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('is_published=true'), ['example-isp']);
  });

});
