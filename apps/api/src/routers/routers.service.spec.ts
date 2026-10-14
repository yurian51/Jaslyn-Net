import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { SecureNetworkCredentials } from '../common/secure-network-credentials';
import { RoutersService } from './routers.service';

describe('RoutersService', () => {
  const query = jest.fn();
  const connect = jest.fn();
  const db = { query, connect } as unknown as Pool;
  const audit = { record: jest.fn().mockResolvedValue({ id: 'audit-1' }) };
  const incidents = { syncRouterOffline: jest.fn() } as any;
  const config = { get: jest.fn() } as unknown as ConfigService;
  let service: RoutersService;

  beforeEach(() => {
    query.mockReset();
    audit.record.mockClear();
    connect.mockReset();
    service = new RoutersService(db, audit, new SecureNetworkCredentials(config), incidents);
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

  it('requires complete Meraki Dashboard credentials before registering a Meraki adapter', async () => {
    await expect(service.create('tenant-a', {
      name: 'Meraki network', vendor: 'Cisco Meraki', managementProtocol: 'MERAKI_DASHBOARD_API',
      managementCredentials: { apiKey: 'api-key-value' },
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
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
  it('rotates all tenant router credentials transactionally and writes an audit record', async () => {
    const oldKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const newKey = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
    const oldCipher = new SecureNetworkCredentials(new ConfigService({ JASLYN_NETWORK_CREDENTIAL_KEY: oldKey }))
      .encrypt({ username: 'router-admin', password: 'rotate-me' });
    const clientQuery = jest.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'router-1', management_credentials_encrypted: oldCipher }], rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({});
    const client = { query: clientQuery, release: jest.fn() };
    connect.mockResolvedValue(client);
    service = new RoutersService(
      db,
      audit,
      new SecureNetworkCredentials(new ConfigService({
        JASLYN_NETWORK_CREDENTIAL_KEYRING: `1:${oldKey},2:${newKey}`,
        JASLYN_NETWORK_CREDENTIAL_ACTIVE_KEY_ID: '2',
      })),
      incidents,
    );

    await expect(service.rotateCredentials('tenant-a', { userId: 'owner-1' })).resolves.toEqual({
      rotatedCount: 1, activeKeyId: '2', completed: true,
    });
    expect(clientQuery).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(clientQuery).toHaveBeenNthCalledWith(3, expect.stringContaining('management_credentials_version=2'), ['tenant-a', 'router-1', expect.stringMatching(/^2\.2\./)]);
    expect(clientQuery).toHaveBeenNthCalledWith(4, expect.stringContaining('INSERT INTO audit_logs'), expect.arrayContaining(['tenant-a', 'owner-1']));
    expect(clientQuery).toHaveBeenLastCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('rolls back credential rotation when an existing credential cannot be decrypted', async () => {
    const clientQuery = jest.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'router-1', management_credentials_encrypted: 'broken-ciphertext' }], rowCount: 1 })
      .mockResolvedValueOnce({});
    const client = { query: clientQuery, release: jest.fn() };
    connect.mockResolvedValue(client);
    const key = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    service = new RoutersService(db, audit, new SecureNetworkCredentials(new ConfigService({ JASLYN_NETWORK_CREDENTIAL_KEY: key })), incidents);

    await expect(service.rotateCredentials('tenant-a', { userId: 'owner-1' })).rejects.toThrow('Unable to decrypt network device credentials');
    expect(clientQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });

});
