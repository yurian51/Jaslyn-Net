import { IpamService } from './ipam.service';

describe('IpamService', () => {
  it('lists pools with normalized counts from the database', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'pool-1', availableCount: 7 }], rowCount: 1 }) };
    const audit = { record: jest.fn() };
    const service = new IpamService(db as never, audit as never);
    await expect(service.listPools('tenant-1')).resolves.toEqual({ data: [{ id: 'pool-1', availableCount: 7 }] });
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][1]).toEqual(['tenant-1']);
  });

  it('rejects overlapping pools before insertion', async () => {
    const db = { query: jest.fn().mockResolvedValueOnce({ rows: [{ id: 'existing', name: 'LAN', network: '10.0.0.0/24' }], rowCount: 1 }) };
    const audit = { record: jest.fn() };
    const service = new IpamService(db as never, audit as never);
    await expect(service.createPool('tenant-1', {
      name: 'Customer',
      network: '10.0.0.0/25',
    })).rejects.toThrow('IPAM network overlaps existing pool LAN');
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});
