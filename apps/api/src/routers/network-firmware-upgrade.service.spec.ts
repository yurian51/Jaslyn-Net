import { BadRequestException, ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { NetworkFirmwareUpgradeService } from './network-firmware-upgrade.service';

describe('NetworkFirmwareUpgradeService', () => {
  let db: { query: jest.Mock };
  let audit: { record: jest.Mock };
  let service: NetworkFirmwareUpgradeService;
  let credentials: { decrypt: jest.Mock };
  let mikrotik: { inspect: jest.Mock };
  const request = () => ({
    targetVersion: '7.17.1',
    releaseSourceUrl: 'https://mikrotik.com/download',
    idempotencyKey: 'job-test-001',
    hardwareRevision: 'r3',
    maintenanceWindowStart: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    maintenanceWindowEnd: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    artifactSha256: 'a'.repeat(64),
  });

  beforeEach(() => {
    db = { query: jest.fn() };
    audit = { record: jest.fn().mockResolvedValue({ id: 'audit-1' }) };
    credentials = { decrypt: jest.fn().mockReturnValue({ username: 'u', password: 'p' }) };
    mikrotik = { inspect: jest.fn().mockResolvedValue({ identity: { model: 'hAP ax3', architecture: 'arm64', version: '7.16.2', factoryFirmware: '7.10' }, update: { status: 'New version is available', installedVersion: '7.16.2', latestVersion: '7.17.1', channel: 'stable' } }) };
    service = new NetworkFirmwareUpgradeService(db as any, audit as any, credentials as any, mikrotik as any);
  });

  it('performs live MikroTik inspection and persists official update-channel evidence', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'r1', vendor: 'MikroTik', model: 'hAP ax3', managementProtocol: 'MIKROTIK_REST', managementEnabled: true, apiEndpoint: 'https://router.example/rest', controllerEndpoint: null, encryptedCredentials: 'cipher' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const result = await service.inspectLive('t1', 'r1', { userId: 'u1' });
    expect(credentials.decrypt).toHaveBeenCalledWith('cipher');
    expect(mikrotik.inspect).toHaveBeenCalledWith({ endpoint: 'https://router.example/rest', credentials: { username: 'u', password: 'p' } });
    expect(result.inventoryStatus).toBe('UPDATE_AVAILABLE');
    expect(db.query.mock.calls[1][0]).toContain('release_source_verified=true');
    expect(audit.record).toHaveBeenCalledWith('t1', 'MIKROTIK_FIRMWARE_LIVE_INSPECTED', 'router_firmware', 'r1', expect.any(Object), { userId: 'u1' });
  });

  it('rejects live inspection for a non-MikroTik vendor without making a device call', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 'r1', vendor: 'Ubiquiti', managementProtocol: 'UNIFI_NETWORK_API', managementEnabled: true, encryptedCredentials: 'cipher' }], rowCount: 1 });
    await expect(service.inspectLive('t1', 'r1')).rejects.toThrow('MikroTik RouterOS only');
    expect(mikrotik.inspect).not.toHaveBeenCalled();
  });

  it('rejects invalid or credential-bearing release URLs before database access', async () => {
    await expect(service.preview('t1', 'r1', { ...request(), releaseSourceUrl: 'http://example.com/fw' }))
      .rejects.toThrow(BadRequestException);
    await expect(service.preview('t1', 'r1', { ...request(), releaseSourceUrl: 'https://user:pass@example.com/fw' }))
      .rejects.toThrow(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects malformed SHA-256 and invalid maintenance windows', async () => {
    await expect(service.preview('t1', 'r1', { ...request(), artifactSha256: 'abc' }))
      .rejects.toThrow(BadRequestException);
    await expect(service.preview('t1', 'r1', { ...request(), maintenanceWindowStart: undefined }))
      .rejects.toThrow(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('fails closed and records a blocked job when vendor-specific executor is unavailable', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{
        id: 'r1', vendor: 'MikroTik', model: 'hAP ax3', osVersion: '7.16.2',
        managementProtocol: 'MIKROTIK_REST', managementEnabled: true,
        credentialsConfigured: true,
      }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{
        installedVersion: '7.16.2', hardwareRevision: 'r3', releaseSourceVerified: true,
        releaseSourceUrl: 'https://mikrotik.com/download', latestVersion: '7.17.1', inventoryStatus: 'UPDATE_AVAILABLE',
      }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'job1', status: 'BLOCKED', preview: { safeToExecute: false } }], rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 });

    const result = await service.preview('t1', 'r1', request(), { userId: 'u1' });

    expect(result.status).toBe('BLOCKED');
    expect(result.preview.safeToExecute).toBe(false);
    expect(result.preview.blockers).toContain('vendorSpecificFirmwareExecutorNotRegistered');
    expect(db.query.mock.calls[2][0]).toContain("'BLOCKED'");
    expect(audit.record).toHaveBeenCalledWith('t1', 'NETWORK_FIRMWARE_UPGRADE_PREVIEWED', 'firmware_upgrade_job', 'job1',
      expect.objectContaining({ status: 'BLOCKED' }), { userId: 'u1' });
  });

  it('rejects duplicate idempotency keys', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'r1', vendor: 'MikroTik', model: 'hAP ax3', osVersion: '7.16.2', managementProtocol: 'MIKROTIK_REST', managementEnabled: true, credentialsConfigured: true }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ installedVersion: '7.16.2', hardwareRevision: 'r3', releaseSourceVerified: false, releaseSourceUrl: null, latestVersion: null }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(service.preview('t1', 'r1', request())).rejects.toThrow(ConflictException);
  });

  it('never permits approval to bypass a missing executable path', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 'job1', status: 'BLOCKED', preview: { safeToExecute: false } }], rowCount: 1 });
    await expect(service.approve('t1', 'r1', 'job1')).rejects.toThrow(ServiceUnavailableException);
  });

  it('does not reveal cross-tenant router data', async () => {
    db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(service.list('t1', 'r2')).rejects.toThrow(NotFoundException);
  });
});
