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
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ pending: '0', failed: '0', verified: '0', abandoned: '0' }] })
        .mockResolvedValueOnce({ rows: [{ active_without_accounting: '0', stale: '0', accounting_lagging: '0' }] })
        .mockResolvedValueOnce({ rows: [{ active_valid: '0', expired_but_active: '0', expiring_24h: '0' }] }),
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

  it('tenant-scopes every relation joined into the live-session overview', async () => {
    const db = mockDb({ total: '0', online: '0', degraded: '0', offline: '0' });
    const service = new OverviewService(db);

    await service.getOverview('tenant-1');

    const calls = (db as unknown as { query: { mock: { calls: Array<[string, unknown[]]> } } }).query.mock.calls;
    const liveSessionsQuery = calls[6][0];
    expect(liveSessionsQuery).toContain('c.tenant_id = s.tenant_id');
    expect(liveSessionsQuery).toContain('r.tenant_id = s.tenant_id');
    expect(liveSessionsQuery).toContain('l.tenant_id = s.tenant_id');
    expect(calls[6][1]).toEqual(['tenant-1']);
  });

  it('exposes command, session accounting and access truth signals', async () => {
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'tenant-1', name: 'Test', currency: 'TZS', timezone: 'Africa/Dar_es_Salaam', status: 'ACTIVE' }] })
        .mockResolvedValueOnce({ rows: [{ total: '10', active: '8' }] })
        .mockResolvedValueOnce({ rows: [{ total: '4', active: '2' }] })
        .mockResolvedValueOnce({ rows: [{ total: '2', online: '1', degraded: '1', offline: '0' }] })
        .mockResolvedValueOnce({ rows: [{ revenue: '15000', successful: '3', failed: '1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'loc-1', name: 'Main Site', routers: '2', active_users: '2', online_routers: '1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'session-1', customer: 'Alice', location: 'Main Site', router: 'R1', ip_address: '10.0.0.2', started_at: '2026-09-16T15:00:00.000Z', bytes_in: '100', bytes_out: '200', status: 'ACTIVE' }] })
        .mockResolvedValueOnce({ rows: [{ day: '16', revenue: '15000' }] })
        .mockResolvedValueOnce({ rows: [{ pending: '2', failed: '1', verified: '4', abandoned: '0' }] })
        .mockResolvedValueOnce({ rows: [{ active_without_accounting: '1', stale: '1', accounting_lagging: '2' }] })
        .mockResolvedValueOnce({ rows: [{ active_valid: '7', expired_but_active: '1', expiring_24h: '2' }] }),
    } as unknown as Pool;
    const service = new OverviewService(db);

    const overview = await service.getOverview('tenant-1');

    expect(overview.operations).toEqual({
      networkCommands: { pending: 2, failed: 1, verified: 4, abandoned: 0 },
      sessions: { stale: 1, activeWithoutAccounting: 1, accountingLagging: 2 },
      access: { activeValid: 7, expiredButActive: 1, expiring24h: 2 },
    });
    expect(overview.kpis.networkAvailability).toBe(50);
    expect(overview.sessions[0]).toMatchObject({ bytesIn: 100, bytesOut: 200 });
  });
  it('builds command center health only from persisted tenant state', async () => {
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'tenant-1', name: 'Test', currency: 'TZS', timezone: 'Africa/Dar_es_Salaam', status: 'ACTIVE' }] })
        .mockResolvedValueOnce({ rows: [{ total: '3', online: '1', degraded: '1', offline: '1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'router-1', name: 'Core', status: 'OFFLINE', activeUsers: 0,  }] })
        .mockResolvedValueOnce({ rows: [{ id: 'session-1', routerId: 'router-1', subscriber: 'Alice', device: 'Core', status: 'ACTIVE', bytesIn: '100', bytesOut: '200', macAddress: 'AA:BB:CC:DD:EE:FF', durationSeconds: 120, authenticationState: 'ACCEPTED', accountingState: 'REPORTED' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'incident-1', category: 'DEVICE_OFFLINE', severity: 'CRITICAL', status: 'OPEN', title: 'Core offline', affectedDevices: 1, affectedSubscribers: 2, rootResourceId: 'router-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'command-1', commandType: 'RESTART', actor: 'operator', provider: 'MikroTik', status: 'FAILED', error: 'timeout', routerId: 'router-1', createdAt: '2026-09-27T08:00:00Z', completedAt: '2026-09-27T08:00:02Z', request: {}, response: null, verification: null }] })
        .mockResolvedValueOnce({ rows: [{ count: '4' }] })
        .mockResolvedValueOnce({ rows: [{ count: '2' }] })
        .mockResolvedValueOnce({ rows: [{ provider: 'MikroTik', failures: '3' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'incident-1', title: 'Core offline', severity: 'CRITICAL', category: 'DEVICE_OFFLINE', occurredAt: '2026-09-27T08:00:00Z' }] }),
    } as unknown as Pool;
    const service = new OverviewService(db);

    const result = await service.getCommandCenter('tenant-1');

    expect(result.systemHealth).toMatchObject({
      status: 'DEGRADED',
      devices: { total: 3, online: 1, degraded: 1, unreachable: 1 },
      activeIncidents: 1,
      activeSessions: 1,
      authenticationFailures24h: 4,
      paymentFailures24h: 2,
      commandQueue: { pending: 0, failed: 1 },
    });
    expect(result.systemHealth.providerFailures24h).toEqual([{ provider: 'MikroTik', failures: 3 }]);
    expect(result.devices[0].reachability).toBe(false);
    expect(result.sessions[0]).toMatchObject({ macAddress: 'AA:BB:CC:DD:EE:FF', durationSeconds: 120 });
    expect(result.devices[0].telemetry.cpu).toBeNull();
    expect(result.devices[0].telemetry.source).toBe('NOT_REPORTED_BY_CURRENT_TELEMETRY_MODEL');
    expect(result.commands[0].durationMs).toBe(2000);
  });
});