import { CustomerCommerceService } from './customer-commerce.service';

describe('CustomerCommerceService renewal execution', () => {
  const tenantId = 'tenant-1';
  const customerId = 'customer-1';

  function makeDb() {
    const client = {
      query: jest.fn(),
      release: jest.fn(),
    };
    const db = {
      connect: jest.fn().mockResolvedValue(client),
      query: jest.fn(),
    };
    return { db, client };
  }

  it('claims due renewals with SKIP LOCKED and a unique execution id', async () => {
    const { db, client } = makeDb();
    const walletClient = { query: jest.fn(), release: jest.fn() };
    db.connect.mockResolvedValueOnce(client).mockResolvedValueOnce(walletClient);
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{
          id: 'renewal-1',
          tenantId,
          customerId,
          savedPurchaseId: 'saved-1',
          packageId: 'package-1',
          routerId: null,
          renewalDays: 30,
          executionId: null,
        }],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ executionId: 'execution-1' }] })
      .mockResolvedValueOnce({});
    walletClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'wallet-1', balance: '20000', currency: 'TZS', status: 'ACTIVE' }] })
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: 'entry-1' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    db.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ price: '10000', currency: 'TZS' }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'wallet-1', balance: '20000', currency: 'TZS', status: 'ACTIVE' }] })
      .mockResolvedValueOnce({});

    const purchases = {
      create: jest.fn().mockResolvedValue({ id: 'purchase-1' }),
      confirmPayment: jest.fn().mockResolvedValue({}),
    };

    const service = new CustomerCommerceService(db as any, purchases as any);
    await (service as any).processDueRenewals();

    expect(client.query.mock.calls[2][0]).toContain('SKIP LOCKED');
    expect(client.query.mock.calls[3][0]).toContain("execution_id=gen_random_uuid()");
    expect(purchases.create).toHaveBeenCalledWith(tenantId, {
      customerId,
      packageId: 'package-1',
      routerId: null,
    });
    expect(purchases.confirmPayment).toHaveBeenCalledWith(tenantId, 'purchase-1', expect.objectContaining({
      idempotencyKey: 'wallet-payment:execution-1',
      providerReference: 'wallet-renewal:execution-1',
      status: 'SUCCESS',
    }));
  });

  it('makes wallet PURCHASE debit idempotent', async () => {
    const { db, client } = makeDb();
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'wallet-1', currency: 'TZS', balance: '20000', status: 'ACTIVE' }] })
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: 'entry-1' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const purchases = {};
    const service = new CustomerCommerceService(db as any, purchases as any);

    const result = await service.addWalletEntry(tenantId, customerId, {
      entryType: 'PURCHASE',
      amount: 10000,
      currency: 'TZS',
      idempotencyKey: 'renewal-debit:execution-1',
      referenceType: 'WIFI_PLAN_PURCHASE',
      referenceId: 'purchase-1',
    });

    expect(result).toEqual({ reused: false, id: 'entry-1', balance: 10000 });
    expect(client.query.mock.calls[3][0]).toContain('reference_type,reference_id,idempotency_key');
    expect(client.query.mock.calls[4][0]).toContain('balance=balance+$3');
  });
});
