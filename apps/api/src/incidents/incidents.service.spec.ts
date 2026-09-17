import { IncidentsService } from './incidents.service';

describe('IncidentsService', () => {
  it('lists incidents with tenant isolation', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) } as any;
    const audit = { record: jest.fn() } as any;
    const service = new IncidentsService(db, audit);

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
});
