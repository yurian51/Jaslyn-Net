import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NetworkFirmwareInventoryService } from './network-firmware-inventory.service';

describe('NetworkFirmwareInventoryService', () => {
  const inventory = {
    id: 'firmware-1', routerId: 'router-1', vendor: 'MikroTik', model: 'hAP ax3',
    installedVersion: '7.16.2', latestVersion: '7.17.1', releaseSourceVerified: false,
    status: 'UNKNOWN',
    statusReason: 'Release metadata was supplied but has not been independently verified against an authoritative vendor source.',
  };
  let db: { query: jest.Mock };
  let audit: { record: jest.Mock };
  let service: NetworkFirmwareInventoryService;

  beforeEach(() => {
    db = { query: jest.fn() };
    audit = { record: jest.fn().mockResolvedValue({ id: 'audit-1' }) };
    service = new NetworkFirmwareInventoryService(db as any, audit as any);
  });

  it('keeps unverified release metadata UNKNOWN and records an audit event', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 'router-1', vendor: 'MikroTik', model: 'hAP ax3' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [inventory], rowCount: 1 });

    const result = await service.observe('tenant-1', 'router-1', {
      installedVersion: '7.16.2', latestVersion: '7.17.1',
      releaseSourceUrl: 'https://mikrotik.com/download',
    }, { userId: 'user-1' });

    expect(result.status).toBe('UNKNOWN');
    expect(result.releaseSourceVerified).toBe(false);
    expect(db.query.mock.calls[1][0]).toContain('release_source_verified=false');
    expect(audit.record).toHaveBeenCalledWith('tenant-1', 'NETWORK_FIRMWARE_OBSERVED', 'router_firmware', 'firmware-1', expect.objectContaining({ status: 'UNKNOWN', releaseSourceVerified: false }), { userId: 'user-1' });
  });

  it('rejects malformed request bodies and non-string release dates', async () => {
    await expect(service.observe('tenant-1', 'router-1', null as any)).rejects.toThrow(BadRequestException);
    await expect(service.observe('tenant-1', 'router-1', { installedVersion: '1.0', releasePublishedAt: 123 as any })).rejects.toThrow(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects non-HTTPS or credential-bearing release source URLs', async () => {
    await expect(service.observe('tenant-1', 'router-1', {
      installedVersion: '1.0', releaseSourceUrl: 'http://example.com/fw',
    })).rejects.toThrow(BadRequestException);
    await expect(service.observe('tenant-1', 'router-1', {
      installedVersion: '1.0', releaseSourceUrl: 'https://user:secret@example.com/fw',
    })).rejects.toThrow(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects cross-tenant router IDs', async () => {
    db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(service.observe('tenant-2', 'router-1', { installedVersion: '7.16.2' })).rejects.toThrow(NotFoundException);
  });

  it('returns null for routers without a firmware observation', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 'router-1' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(service.list('tenant-1', 'router-1')).resolves.toEqual({ data: null });
  });
});
