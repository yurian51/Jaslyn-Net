import { SubscriptionService } from './subscription.service';

describe('SubscriptionService', () => {
  const db = { query: jest.fn() } as any;
  let service: SubscriptionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SubscriptionService(db);
  });

  it('returns active platform plans in catalogue order', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ code: 'FREE', name: 'Free' }, { code: 'STARTER', name: 'Starter' }] });
    await expect(service.plans()).resolves.toEqual({
      data: [{ code: 'FREE', name: 'Free' }, { code: 'STARTER', name: 'Starter' }],
    });
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('reports an enabled feature from the current tenant plan', async () => {
    db.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ code: 'PROFESSIONAL', name: 'Professional', features: { radius: true, multiWan: true } }],
    });
    await expect(service.feature('tenant-1', 'multiWan')).resolves.toEqual({
      key: 'multiWan',
      enabled: true,
      plan: 'PROFESSIONAL',
    });
  });

  it('reports disabled when the feature is not present', async () => {
    db.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ code: 'STARTER', name: 'Starter', features: { radius: true } }],
    });
    await expect(service.feature('tenant-1', 'multiWan')).resolves.toEqual({
      key: 'multiWan',
      enabled: false,
      plan: 'STARTER',
    });
  });
});
