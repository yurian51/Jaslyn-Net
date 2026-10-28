import { SubscriptionsController } from './subscriptions.controller';

describe('SubscriptionsController', () => {
  it('returns the active platform catalogue without accepting tenant input from the caller', async () => {
    const subscriptions = {
      catalogue: jest.fn().mockResolvedValue({ data: [{ code: 'STARTER' }] }),
      current: jest.fn(),
    };
    const controller = new SubscriptionsController(subscriptions as any);
    await expect(controller.catalogue()).resolves.toEqual({ data: [{ code: 'STARTER' }] });
    expect(subscriptions.catalogue).toHaveBeenCalledTimes(1);
    expect(subscriptions.current).not.toHaveBeenCalled();
  });

  it('derives subscription tenant scope from the authenticated request', async () => {
    const subscriptions = {
      catalogue: jest.fn(),
      current: jest.fn().mockResolvedValue({ data: null }),
    };
    const controller = new SubscriptionsController(subscriptions as any);
    await expect(controller.current({ user: { tenantId: 'trusted-tenant' } } as any)).resolves.toEqual({ data: null });
    expect(subscriptions.current).toHaveBeenCalledWith('trusted-tenant');
  });
});
