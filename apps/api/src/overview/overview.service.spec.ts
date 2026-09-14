import { OverviewService } from './overview.service';
import { Pool } from 'pg';

describe('OverviewService', () => {
  function mockDb(routerRow: Record<string, string>) {
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'tenant-1', currency: 'TZS' }] })
        .mockResolvedValueOnce({ rows: [{ total: '0', active: '0' }] })
        .mockResolvedValueOnce({ rows: [{ total: '0', active: '0' }] })
        .mockResolvedValueOnce({ rows: [routerRow] })
        .mockResolvedValueOnce({ rows: [{ revenue: '0', failed: '0' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
    } as unknown as Pool;
    return db;
  }

  it('does not report 100% availability when no routers exist', async () => {
    const db = mockDb({ total: '0', online: '0', degraded: '0', offline: '0' });
    const service = new OverviewService(db);

    const overview = await service.getOverview('tenant-1');

    expect(overview.kpis.networkAvailability).toBeNull();
  });

  it('calculates availability from online routers only', async () => {
    const db = mockDb({ total: '4', online: '3', degraded: '1', offline: '0' });
    const service = new OverviewService(db);

    const overview = await service.getOverview('tenant-1');

    expect(overview.kpis.networkAvailability).toBe(75);
    expect(overview.network).toEqual({ totalRouters: 4, online: 3, degraded: 1, offline: 0 });
  });
});
