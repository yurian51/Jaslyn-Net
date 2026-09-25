import { UpesiLipaService } from './upesilipa.service';

describe('UpesiLipaService', () => {
  it('exposes UpesiLipa hardware lifecycle without claiming catalogue-only adapters are native', () => {
    const service = new UpesiLipaService({} as never, {} as never);
    const result = service.capabilities();

    expect(result.provider).toBe('upesilipa');
    expect(result.paymentMethods).toContain('M-Pesa');
    expect(result.hardware.find((item) => item.vendor === 'MikroTik')?.mode).toBe('NATIVE');
    expect(result.hardware.find((item) => item.vendor === 'TP-Link Omada')?.mode).toBe('CATALOG_ONLY');
    expect(result.catalogOnlyHardware).toContain('Cambium');
  });

  it('builds a live dashboard from tenant-isolated database aggregates', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [{ count: 2 }] })
      .mockResolvedValueOnce({ rows: [{ total: 5, online: 4, degraded: 1 }] })
      .mockResolvedValueOnce({ rows: [{ count: 17 }] })
      .mockResolvedValueOnce({ rows: [{ amount: '42500', count: 9 }] })
      .mockResolvedValueOnce({ rows: [{ total: 100, unused: 61, used: 35, expired: 4 }] });
    const service = new UpesiLipaService({ query } as never, {} as never);

    const result = await service.dashboard('tenant-1');

    expect(result.data.locations.count).toBe(2);
    expect(result.data.routers.online).toBe(4);
    expect(result.data.activeSessions).toBe(17);
    expect(result.data.todaySales.amount).toBe('42500');
    expect(result.data.vouchers.unused).toBe(61);
    expect(query).toHaveBeenCalledTimes(5);
    for (const call of query.mock.calls) expect(call[1]).toEqual(['tenant-1']);
  });

  it('aggregates tenant site health without leaking routers across tenants', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [
        { locationId: 'loc-1', locationName: 'Site A', routers: 2, online: 2, offline: 0, degraded: 0 },
        { locationId: 'loc-2', locationName: 'Site B', routers: 2, online: 1, offline: 1, degraded: 0 },
        { locationId: 'loc-3', locationName: 'Site C', routers: 0, online: 0, offline: 0, degraded: 0 },
      ],
    });
    const service = new UpesiLipaService({ query } as never, {} as never);

    const result = await service.healthOverview('tenant-1');

    expect(result.summary).toEqual({ sites: 3, healthy: 1, degraded: 1, offline: 0, noDevices: 1 });
    expect(result.sites.map((site) => site.health)).toEqual(['HEALTHY', 'DEGRADED', 'NO_DEVICES']);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE l.tenant_id=$1'), ['tenant-1']);
  });

  it('derives site health from actual router states', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'loc-1', name: 'Site A' }] })
      .mockResolvedValueOnce({
        rows: [
          { id: 'r1', name: 'Router 1', status: 'ONLINE' },
          { id: 'r2', name: 'Router 2', status: 'OFFLINE' },
        ],
      });
    const service = new UpesiLipaService({ query } as never, {} as never);

    const result = await service.siteHealth('tenant-1', 'loc-1');

    expect(result.summary).toMatchObject({ routers: 2, online: 1, offline: 1, health: 'DEGRADED' });
    expect(result.routers).toHaveLength(2);
  });
});
