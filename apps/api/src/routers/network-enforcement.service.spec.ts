import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NetworkEnforcementService } from './network-enforcement.service';

describe('NetworkEnforcementService', () => {
  function createService(row: Record<string, unknown> | null, enforcementResult = {
    applied: true,
    commandCount: 1,
    commands: [],
    commandIds: ['command-1'],
    verifiedCommandIds: ['command-1'],
    verificationFailures: 0,
  }) {
    const db = { query: jest.fn().mockResolvedValue({ rowCount: row ? 1 : 0, rows: row ? [row] : [] }) };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const secureCredentials = { decrypt: jest.fn().mockReturnValue({ username: 'admin', password: 'secret' }) };
    const trafficEnforcement = {
      supportsProtocol: jest.fn().mockReturnValue(true),
      applyCommands: jest.fn().mockResolvedValue(enforcementResult),
    };
    const service = new NetworkEnforcementService(db as never, audit as never, secureCredentials as never, trafficEnforcement as never);
    return { service, db, audit, secureCredentials, trafficEnforcement };
  }

  const validRow = {
    managementEnabled: true,
    apiEndpoint: 'https://router.example',
    credentialsEncrypted: '1.encrypted.payload',
    managementProtocol: 'MIKROTIK_REST',
    packageId: 'package-1',
    downloadBps: '2048000',
    uploadBps: '512000',
  };

  it('rejects a missing router or inactive package without touching the network', async () => {
    const { service, trafficEnforcement } = createService(null);
    await expect(service.enforce('tenant-1', 'router-1', { packageId: 'package-1', ipAddress: '10.0.0.8' }))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(trafficEnforcement.applyCommands).not.toHaveBeenCalled();
  });

  it('fails closed when router management is disabled', async () => {
    const { service, trafficEnforcement } = createService({ managementEnabled: false });
    await expect(service.enforce('tenant-1', 'router-1', { packageId: 'package-1', ipAddress: '10.0.0.8' }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(trafficEnforcement.applyCommands).not.toHaveBeenCalled();
  });

  it('routes policy enforcement through the durable command fabric and preserves verification', async () => {
    const { service, audit, secureCredentials, trafficEnforcement } = createService(validRow);

    await expect(service.enforce('tenant-1', 'router-1', { packageId: 'package-1', ipAddress: '10.0.0.8' }))
      .resolves.toMatchObject({ ok: true, status: 'verified', clientIp: '10.0.0.8', commandIds: ['command-1'], verifiedCommandIds: ['command-1'] });

    expect(secureCredentials.decrypt).toHaveBeenCalledWith('1.encrypted.payload');
    expect(trafficEnforcement.applyCommands).toHaveBeenCalledWith(
      [{
        routerId: 'router-1',
        customerId: 'ip:10.0.0.8',
        targetAddress: '10.0.0.8',
        apiEndpoint: 'https://router.example',
        protocol: 'MIKROTIK_REST',
        maxDownloadMbps: 2.048,
        maxUploadMbps: 0.512,
        priority: 1,
      }],
      { username: 'admin', password: 'secret' },
      'MIKROTIK_REST',
      'tenant-1',
      'router-policy:router-1:10.0.0.8:package-1',
    );
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain('secret');
  });

  it('does not decrypt credentials for an unsupported protocol', async () => {
    const { service, secureCredentials, trafficEnforcement } = createService({
      ...validRow,
      managementProtocol: 'UNIFI_NETWORK_API',
    });
    trafficEnforcement.supportsProtocol.mockReturnValue(false);

    await expect(service.enforce('tenant-1', 'router-1', { packageId: 'package-1', ipAddress: '10.0.0.8' }))
      .resolves.toMatchObject({ ok: false, status: 'blocked', reason: 'UNSUPPORTED_NETWORK_PROTOCOL' });
    expect(secureCredentials.decrypt).not.toHaveBeenCalled();
    expect(trafficEnforcement.applyCommands).not.toHaveBeenCalled();
  });

  it('surfaces an executed-but-unverified network operation without fabricating verification', async () => {
    const { service } = createService(validRow, {
      applied: true,
      commandCount: 1,
      commands: [],
      commandIds: ['command-2'],
      verifiedCommandIds: [],
      verificationFailures: 1,
    });

    await expect(service.enforce('tenant-1', 'router-1', { packageId: 'package-1', ipAddress: '10.0.0.9' }))
      .resolves.toMatchObject({ ok: true, status: 'executed_unverified', verificationFailures: 1, verifiedCommandIds: [] });
  });
});
