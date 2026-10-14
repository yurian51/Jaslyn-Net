import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { AuditService } from '../audit/audit.service';
import { FiberTopologyService } from './fiber-topology.service';

describe('FiberTopologyService', () => {
  const db = { query: jest.fn() };
  const audit = { record: jest.fn() };
  let service: FiberTopologyService;
  beforeEach(() => { jest.clearAllMocks(); service = new FiberTopologyService(db as unknown as Pool, audit as unknown as AuditService); });

  it('lists only tenant-owned assets and filters by type/status in SQL', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 'asset-1', assetCode: 'OLT-1' }], rowCount: 1 });
    const result = await service.list('tenant-a', { assetType: 'OLT', status: 'ACTIVE' });
    expect(result.data).toHaveLength(1);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('WHERE a.tenant_id=$1'), ['tenant-a', 'OLT', 'ACTIVE']);
  });

  it('rejects duplicate asset codes inside a tenant before insertion', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 'asset-existing' }], rowCount: 1 });
    await expect(service.create('tenant-a', 'user-a', { assetType: 'OLT', name: 'Core OLT', assetCode: 'olt-1' }))
      .rejects.toBeInstanceOf(ConflictException);
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('requires latitude and longitude to be supplied together', async () => {
    db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(service.create('tenant-a', 'user-a', {
      assetType: 'CABINET', name: 'Cabinet 1', assetCode: 'CAB-1', latitude: -3.4,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('rejects a parent asset from another tenant', async () => {
    db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }).mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(service.create('tenant-a', 'user-a', {
      assetType: 'ONU', name: 'ONU 1', assetCode: 'ONU-1', parentAssetId: 'foreign-parent',
    })).rejects.toBeInstanceOf(NotFoundException);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('rejects a router reference from another tenant', async () => {
    db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }).mockResolvedValueOnce({ rows: [{ id: 'parent-a' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(service.create('tenant-a', 'user-a', {
      assetType: 'ONU', name: 'ONU 2', assetCode: 'ONU-2', parentAssetId: 'parent-a', routerId: 'foreign-router',
    })).rejects.toBeInstanceOf(NotFoundException);
    expect(audit.record).not.toHaveBeenCalled();
  });
});
