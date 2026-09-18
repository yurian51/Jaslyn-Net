import { BillingController } from './billing.controller';

function makeController() {
  const billing = {
    initiatePayment: jest.fn(),
    verifyWebhookSignature: jest.fn(),
    processPaymentWebhook: jest.fn(),
  } as any;
  const purchases = {
    list: jest.fn(),
    create: jest.fn(),
  } as any;
  return { controller: new BillingController(billing, purchases), billing, purchases };
}

describe('BillingController purchase delegation', () => {
  it('uses the canonical PurchasesService for purchase listing', async () => {
    const { controller, purchases, billing } = makeController();
    purchases.list.mockResolvedValue({ data: [] });

    await expect(controller.listPurchases({ user: { tenantId: 'tenant-1' } } as any, 'customer-1')).resolves.toEqual({ data: [] });

    expect(purchases.list).toHaveBeenCalledWith('tenant-1', 'customer-1');
    expect(billing.initiatePayment).not.toHaveBeenCalled();
  });

  it('uses the canonical PurchasesService for purchase creation', async () => {
    const { controller, purchases } = makeController();
    const dto = { customerId: 'customer-1', packageId: 'package-1', routerId: 'router-1' };
    purchases.create.mockResolvedValue({ id: 'purchase-1' });

    await expect(controller.createPurchase({ user: { tenantId: 'tenant-1' } } as any, dto as any)).resolves.toEqual({ id: 'purchase-1' });

    expect(purchases.create).toHaveBeenCalledWith('tenant-1', dto);
  });
});
