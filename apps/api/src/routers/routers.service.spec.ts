import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { SecureNetworkCredentials } from '../common/secure-network-credentials';
import { RoutersService } from './routers.service';

describe('RoutersService', () => {
  const query = jest.fn();
  const db = { query } as unknown as Pool;
  const audit = { record: jest.fn().mockResolvedValue({ id: 'audit-1' }) };
  const config = { get: jest.fn() } as unknown as ConfigService;
  let service: RoutersService;

  beforeEach(() => {
    query.mockReset();
    audit.record.mockClear();
    service = new RoutersService(db, audit, new SecureNetworkCredentials(config));
  });

  it('lists only routers belonging to the tenant', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'r1', status: 'ONLINE' }], rowCount: 1 });

    const result = await service.list('tenant-a');

    expect(result.data).toEqual([{ id: 'r1', status: 'ONLINE' }]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE tenant_id=$1'), ['tenant-a']);
  });

  it('rejects an update when the router does not belong to the tenant', async () => {
    query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(service.update('tenant-a', 'router-b', { name: 'Changed' })).rejects.toBeInstanceOf(NotFoundException);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('records a heartbeat against the authenticated tenant', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'router-a', status: 'ONLINE', activeUsers: 4 }], rowCount: 1 });

    const result = await service.heartbeat('tenant-a', 'router-a', { status: 'ONLINE', activeUsers: 4 }, { userId: 'user-a' });

    expect(result.id).toBe('router-a');
    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE tenant_id=$1 AND id=$2'), ['tenant-a', 'router-a', 'ONLINE', 4]);
    expect(audit.record).toHaveBeenCalledWith('tenant-a', 'ROUTER_HEARTBEAT', 'router', 'router-a', { status: 'ONLINE', activeUsers: 4 }, { userId: 'user-a' });
  });

  it('marks stale routers offline and audits the affected ids', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'router-a', status: 'OFFLINE' }], rowCount: 1 });

    const result = await service.markOfflineStale('tenant-a', 5, { userId: 'admin-a' });

    expect(result.updated).toBe(1);
    expect(audit.record).toHaveBeenCalledWith(
      'tenant-a',
      'ROUTERS_MARKED_OFFLINE',
      'router',
      undefined,
      { staleMinutes: 5, routerIds: ['router-a'], count: 1 },
      { userId: 'admin-a' },
    );
  });

  it('rejects a non-finite stale interval instead of sending NaN to PostgreSQL', async () => {
    await expect(service.markOfflineStale('tenant-a', Number.NaN)).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('clamps a valid stale interval to the supported range', async () => {
    query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await service.markOfflineStale('tenant-a', 99999);

    expect(result.updated).toBe(0);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('($2 * interval \'1 minute\')'), ['tenant-a', 1440]);
  });

  it('infers a native management protocol when a vendor is supplied without one', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: 'router-unifi', name: 'AP', vendor: 'Ubiquiti UniFi', managementProtocol: 'UNIFI_NETWORK_API',
        capabilities: { vendor: 'Ubiquiti UniFi', capabilities: ['telemetry'] }, managementCredentialsConfigured: false,
      }],
      rowCount: 1,
    });

    const result = await service.create('tenant-a', { name: 'AP', vendor: 'Ubiquiti UniFi' });

    expect(result.managementProtocol).toBe('UNIFI_NETWORK_API');
    expect(query).toHaveBeenCalledWith(expect.stringContaining('management_protocol'), expect.arrayContaining(['UNIFI_NETWORK_API']));
  });

  it('re-infers the protocol when an existing router changes vendor', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ id: 'router-a', vendor: 'MikroTik', managementProtocol: 'MIKROTIK_REST' }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'router-a', vendor: 'Ubiquiti UniFi', managementProtocol: 'UNIFI_NETWORK_API' }],
        rowCount: 1,
      });

    const result = await service.update('tenant-a', 'router-a', { vendor: 'Ubiquiti UniFi' });

    expect(result.managementProtocol).toBe('UNIFI_NETWORK_API');
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('management_protocol=COALESCE($12,management_protocol)'),
      expect.arrayContaining(['UNIFI_NETWORK_API']),
    );
  });
});
