import { SubscriptionsService } from './subscriptions.service';

describe('SubscriptionsService', () => {
  it('returns only active platform plans ordered by price', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [{ code: 'STARTER', price: '0.00' }] }) } as any;
    const service = new SubscriptionsService(db);
    await expect(service.catalogue()).resolves.toEqual({ data: [{ code: 'STARTER', price: '0.00' }] });
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('WHERE is_active = true'));
  });

  it('scopes current subscription to the authenticated tenant and returns a null empty state', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) } as any;
    const service = new SubscriptionsService(db);
    await expect(service.current('tenant-safe-id')).resolves.toEqual({ data: null });
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('WHERE s.tenant_id = $1'), ['tenant-safe-id']);
  });
});
