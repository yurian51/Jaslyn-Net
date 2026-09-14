import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NetworkEnforcementService } from './network-enforcement.service';

describe('NetworkEnforcementService', () => {
  function createService(row: Record<string, unknown>, adapterResult = { ok: true, action: 'created' as const, remotePolicyId: '*9' }) {
    const db = { query: jest.fn().mockResolvedValue({ rowCount: row ? 1 : 0, rows: row ? [row] : [] }) };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const secureCredentials = { decrypt: jest.fn().mockReturnValue({ username: 'admin', password: 'secret' }) };
    const mikrotik = {
      health: jest.fn().mockResolvedValue({ ok: true, status: 'online', version: '7.20' }),
      enforcePolicy: jest.fn().mockResolvedValue(adapterResult),
    };
    const service = new NetworkEnforcementService(db as never, audit as never, secureCredentials as never, mikrotik as never);
    return { service, db, audit, secureCredentials, mikrotik };
  }

  it('rejects a missing router or inactive package without touching the network', async () => {
    const { service, mikrotik } = createService(null);
    await expect(service.enforce('tenant-1', 'router-1', { packageId: 'package-1', ipAddress: '10.0.0.8' }))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(mikrotik.health).not.toHaveBeenCalled();
  });

  it('fails closed when router management is disabled', async () => {
    const { service, mikrotik } = createService({ managementEnabled: false });
    await expect(service.enforce('tenant-1', 'router-1', { packageId: 'package-1', ipAddress: '10.0.0.8' }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(mikrotik.health).not.toHaveBeenCalled();
  });

  it('does not expose or send plaintext credentials to the audit trail', async () => {
    const { service, audit, secureCredentials, mikrotik } = createService({
      managementEnabled: true,
      apiEndpoint: 'https://router.example',
      credentialsEncrypted: '1.encrypted.payload',
      managementProtocol: 'MIKROTIK_REST',
      packageId: 'package-1',
      downloadBps: '2048000',
      uploadBps: '512000',
    });

    await expect(service.enforce('tenant-1', 'router-1', { packageId: 'package-1', ipAddress: '10.0.0.8' }))
      .resolves.toMatchObject({ ok: true, status: 'enforced', clientIp: '10.0.0.8' });
    expect(secureCredentials.decrypt).toHaveBeenCalledWith('1.encrypted.payload');
    expect(mikrotik.enforcePolicy).toHaveBeenCalledWith(
      'https://router.example',
      { username: 'admin', password: 'secret' },
      { ipAddress: '10.0.0.8' },
      { planId: 'package-1', bandwidth: { downloadKbps: 2048, uploadKbps: 512 } },
    );
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain('secret');
  });

  it('blocks unsupported protocols before decrypting credentials', async () => {
    const { service, secureCredentials, mikrotik } = createService({
      managementEnabled: true,
      apiEndpoint: 'https://controller.example',
      credentialsEncrypted: '1.encrypted.payload',
      managementProtocol: 'UNIFI_NETWORK_API',
      packageId: 'package-1',
      downloadBps: '1000000',
      uploadBps: '500000',
    });

    await expect(service.enforce('tenant-1', 'router-1', { packageId: 'package-1', ipAddress: '10.0.0.8' }))
      .resolves.toMatchObject({ ok: false, status: 'blocked', reason: 'UNSUPPORTED_NETWORK_PROTOCOL' });
    expect(secureCredentials.decrypt).not.toHaveBeenCalled();
    expect(mikrotik.health).not.toHaveBeenCalled();
  });
});
