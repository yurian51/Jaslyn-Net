import { NotFoundException } from '@nestjs/common';
import { PackagesService } from './packages.service';

describe('PackagesService tier availability', () => {
  it('maps configured tenant packages onto the canonical tier catalog', async () => {
    const db = { query: jest.fn().mockResolvedValue({
      rows: [{ tierCode: 'NEXUS', id: 'pkg-1', name: 'Jaslyn Nexus', price: '50000', isActive: true, showOnPortal: true }],
    }) } as any;
    const service = new PackagesService(db);
    const result = await service.tierAvailability('tenant-1');

    expect(db.query).toHaveBeenCalledTimes(1);
    expect(result.data).toHaveLength(8);
    expect(result.data.find((tier) => tier.code === 'NEXUS')?.configured).toBe(true);
    expect(result.data.find((tier) => tier.code === 'SPARK')?.configured).toBe(false);
  });

  it('rejects unknown catalog entries', () => {
    const service = new PackagesService({ query: jest.fn() } as any);
    expect(() => service.getTierCatalogEntry('not-a-tier')).toThrow(NotFoundException);
  });
});
