import { BadRequestException } from '@nestjs/common';
import { LoadBalancingService } from './load-balancing.service';

describe('LoadBalancingService', () => {
  function createService() {
    const db = { query: jest.fn(), connect: jest.fn() } as any;
    const engine = { decide: jest.fn() } as any;
    const audit = { record: jest.fn().mockResolvedValue(undefined) } as any;
    const secureCredentials = { decrypt: jest.fn() } as any;
    return { service: new LoadBalancingService(db, engine, audit, secureCredentials), db, engine, audit, secureCredentials };
  }

  it('rejects an empty WAN health-check target before writing to the database', async () => {
    const { service, db } = createService();
    db.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'wan-1' }] });

    await expect(
      service.addHealthCheck('tenant-1', 'wan-1', {
        method: 'HTTPS',
        target: '   ',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query).toHaveBeenCalledWith(
      'SELECT id FROM wan_connections WHERE tenant_id=$1 AND id=$2',
      ['tenant-1', 'wan-1'],
    );
  });

  it('persists a trimmed WAN health-check target', async () => {
    const { service, db } = createService();
    db.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'wan-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'check-1' }] });

    const result = await service.addHealthCheck('tenant-1', 'wan-1', {
      method: 'HTTPS',
      target: '  https://example.com/health  ',
    });

    expect(result).toEqual({ id: 'check-1' });
    expect(db.query.mock.calls[1][1]).toEqual(['tenant-1', 'wan-1', 'HTTPS', 'https://example.com/health', 10, 3000, 3, 3, true]);
  });

  it('does not advertise router application for protocols without a wired adapter', async () => {
    const { service, db, engine } = createService();
    db.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: 'policy-1',
          routerId: 'router-1',
          name: 'Primary / Secondary',
          strategy: 'PRIMARY_SECONDARY',
          enabled: true,
          capacityAware: true,
          rebalanceThresholdPercent: 15,
          degradeThresholdPercent: 80,
          unavailableAfterFailures: 3,
          recoverAfterSuccesses: 3,
          managementProtocol: 'PFSENSE_API',
          managementEnabled: true,
        }],
      })
      .mockResolvedValueOnce({ rows: [] });
    engine.decide.mockReturnValue({ policyId: 'policy-1', strategy: 'PRIMARY_SECONDARY', eligibleMembers: [], failoverActive: false });

    const status = await service.status('tenant-1', 'policy-1');

    expect(status.adapterAvailable).toBe(false);
    expect(status.policy.routingCapabilities.routeWrite).toBe(true);
    expect(status.applyAvailable).toBe(false);
  });

  it('advertises application for the verified MikroTik adapter path', async () => {
    const { service, db, engine } = createService();
    db.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: 'policy-1',
          routerId: 'router-1',
          name: 'Primary / Secondary',
          strategy: 'PRIMARY_SECONDARY',
          enabled: true,
          capacityAware: true,
          rebalanceThresholdPercent: 15,
          degradeThresholdPercent: 80,
          unavailableAfterFailures: 3,
          recoverAfterSuccesses: 3,
          managementProtocol: 'MIKROTIK_REST',
          managementEnabled: true,
        }],
      })
      .mockResolvedValueOnce({ rows: [] });
    engine.decide.mockReturnValue({ policyId: 'policy-1', strategy: 'PRIMARY_SECONDARY', eligibleMembers: [], failoverActive: false });

    const status = await service.status('tenant-1', 'policy-1');

    expect(status.adapterAvailable).toBe(true);
    expect(status.policy.routingCapabilities.routeWrite).toBe(true);
    expect(status.applyAvailable).toBe(true);
  });
});
