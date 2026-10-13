import { PaymentsService } from '../payments/payments.service';
import { PurchasesService } from './purchases.service';

describe('PurchasesService payment confirmation', () => {
  it('rejects direct confirmation for external providers', async () => {
    const db = { connect: jest.fn() } as any;
    const payments = { assertMethodCanSettle: jest.fn().mockResolvedValue({ code: 'mpesa' }) } as any;
    const service = new PurchasesService(db, payments, {} as any, { enqueue: jest.fn().mockResolvedValue(undefined) } as any);

    await expect(service.confirmPayment('tenant-1', 'purchase-1', {
      provider: 'mpesa',
      providerReference: 'MPESA-001',
      status: 'PAID',
    })).rejects.toThrow('External payment providers must be verified through their provider webhook');

    expect(db.connect).not.toHaveBeenCalled();
    expect(payments.assertMethodCanSettle).not.toHaveBeenCalled();
  });

  it('rejects a changed receipt reference when reusing a paid idempotency key', async () => {
    const purchaseId = '11111111-1111-1111-1111-111111111111';
    const tenantId = '22222222-2222-2222-2222-222222222222';
    const client = {
      query: jest.fn(async (sql: string) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rowCount: 0, rows: [] };
        if (sql.includes('FROM wifi_plan_purchases WHERE tenant_id = $1 AND id = $2 FOR UPDATE')) {
          return { rowCount: 1, rows: [{ id: purchaseId, customer_id: 'customer-1', package_id: 'package-1', router_id: null, price: 5000, currency: 'TZS', status: 'PENDING_PAYMENT', correlation_id: 'corr-1' }] };
        }
        if (sql.includes('FROM payments WHERE tenant_id = $1 AND idempotency_key = $2')) {
          return { rowCount: 1, rows: [{ id: 'payment-1', purchaseId, provider: 'manual', providerReference: 'CASH-ORIGINAL', status: 'PAID' }] };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      }),
      release: jest.fn(),
    };
    const db = { connect: jest.fn().mockResolvedValue(client) } as any;
    const payments = { assertMethodCanSettle: jest.fn().mockResolvedValue({ code: 'manual' }) } as any;
    const service = new PurchasesService(db, payments, {} as any, { enqueue: jest.fn().mockResolvedValue(undefined) } as any);

    await expect(service.confirmPayment(tenantId, purchaseId, {
      provider: 'manual',
      providerReference: 'CASH-CHANGED',
      idempotencyKey: 'confirm-reused-001',
      status: 'PAID',
    })).rejects.toThrow('Idempotency key is already bound to another provider reference');

    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });

  it('records a ledger settlement when a new manual payment is inserted as PAID', async () => {
    const purchaseId = '11111111-1111-1111-1111-111111111111';
    const tenantId = '22222222-2222-2222-2222-222222222222';
    const customerId = '33333333-3333-3333-3333-333333333333';
    const packageId = '44444444-4444-4444-4444-444444444444';
    const paymentId = '66666666-6666-6666-6666-666666666666';
    const client = {
      query: jest.fn(async (sql: string) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rowCount: 0, rows: [] };
        if (sql.includes('FROM wifi_plan_purchases WHERE tenant_id = $1 AND id = $2 FOR UPDATE')) {
          return { rowCount: 1, rows: [{ id: purchaseId, customer_id: customerId, package_id: packageId, router_id: null, price: 5000, currency: 'TZS', discount_amount: 0, promo_code_id: null, status: 'PENDING_PAYMENT', correlation_id: 'corr-1' }] };
        }
        if (sql.includes('FROM payments WHERE tenant_id = $1 AND idempotency_key = $2')) return { rowCount: 0, rows: [] };
        if (sql.includes("FROM payments WHERE tenant_id=$1 AND purchase_id=$2 AND status='PENDING'")) return { rowCount: 0, rows: [] };
        if (sql.includes('INSERT INTO payments')) return { rowCount: 1, rows: [{ id: paymentId }] };
        if (sql.includes('SELECT id, name, duration_seconds, data_limit_bytes, download_bps, upload_bps FROM packages')) {
          return { rowCount: 1, rows: [{ id: packageId, name: 'Daily', duration_seconds: 86400, data_limit_bytes: null, download_bps: 10000000, upload_bps: 2000000 }] };
        }
        if (sql.includes("UPDATE wifi_plan_purchases SET status='PAID'")) return { rowCount: 1, rows: [] };
        if (sql.includes('INSERT INTO access_grants')) return { rowCount: 1, rows: [] };
        throw new Error(`Unexpected SQL: ${sql}`);
      }),
      release: jest.fn(),
    };
    const db = {
      connect: jest.fn().mockResolvedValue(client),
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM wifi_plan_purchases p')) {
          return { rowCount: 1, rows: [{ id: purchaseId, customerId, packageId, routerId: null, price: 5000, currency: 'TZS', status: 'PAID' }] };
        }
        throw new Error(`Unexpected pool SQL: ${sql}`);
      }),
    } as any;
    const payments = {
      assertMethodCanSettle: jest.fn().mockResolvedValue({ code: 'manual' }),
      recordVerifiedSettlement: jest.fn().mockResolvedValue('ledger-tx-1'),
    } as any;
    const service = new PurchasesService(db, payments, {} as any, { enqueue: jest.fn().mockResolvedValue(undefined) } as any);

    const result = await service.confirmPayment(tenantId, purchaseId, {
      provider: 'manual',
      providerReference: 'CASH-NEW-001',
      idempotencyKey: 'confirm-new-001',
      status: 'PAID',
    });

    expect(result.paymentId).toBe(paymentId);
    expect(payments.recordVerifiedSettlement).toHaveBeenCalledWith(client, tenantId, paymentId, 5000, 'TZS', 'manual');
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('settles an existing pending intent instead of creating a second payment', async () => {
    const purchaseId = '11111111-1111-1111-1111-111111111111';
    const tenantId = '22222222-2222-2222-2222-222222222222';
    const customerId = '33333333-3333-3333-3333-333333333333';
    const packageId = '44444444-4444-4444-4444-444444444444';
    const paymentId = '55555555-5555-5555-5555-555555555555';

    const calls: string[] = [];
    const client = {
      query: jest.fn(async (sql: string) => {
        calls.push(sql);
        if (sql === 'BEGIN' || sql === 'COMMIT') return { rowCount: 0, rows: [] };
        if (sql === 'ROLLBACK') return { rowCount: 0, rows: [] };
        if (sql.includes('FROM wifi_plan_purchases WHERE tenant_id = $1 AND id = $2 FOR UPDATE')) {
          return { rowCount: 1, rows: [{ id: purchaseId, customer_id: customerId, package_id: packageId, router_id: null, price: 5000, currency: 'TZS', status: 'PENDING_PAYMENT' }] };
        }
        if (sql.includes('FROM payment_provider_configs')) return { rowCount: 1, rows: [{ metadata: {} }] };
        if (sql.includes('FROM payments WHERE tenant_id = $1 AND idempotency_key = $2')) return { rowCount: 0, rows: [] };
        if (sql.includes("FROM payments WHERE tenant_id=$1 AND purchase_id=$2 AND status='PENDING'")) {
          return { rowCount: 1, rows: [{ id: paymentId, provider: 'manual', status: 'PENDING' }] };
        }
        if (sql.includes('SELECT id, name, duration_seconds, data_limit_bytes, download_bps, upload_bps FROM packages')) {
          return { rowCount: 1, rows: [{ id: packageId, name: 'Daily', duration_seconds: 86400, data_limit_bytes: null, download_bps: 10000000, upload_bps: 2000000 }] };
        }
        if (sql.includes('SELECT status, amount, currency, provider FROM payments')) return { rowCount: 1, rows: [{ status: 'PAID', amount: '5000', currency: 'TZS', provider: 'manual' }] };
        if (sql.includes('INSERT INTO financial_ledger_accounts')) return { rowCount: 1, rows: [{ id: sql.includes('WiFi service revenue') ? 'revenue-account' : 'cash-account' }] };
        if (sql.includes('INSERT INTO financial_ledger_transactions')) return { rowCount: 1, rows: [{ id: 'ledger-tx-1' }] };
        if (sql.includes('FROM financial_ledger_entries')) return { rowCount: 0, rows: [] };
        if (sql.includes('INSERT INTO financial_ledger_entries')) return { rowCount: 2, rows: [] };
        if (sql.includes('UPDATE payments SET provider_reference=$2, status=\'PAID\'')) return { rowCount: 1, rows: [] };
        if (sql.includes('UPDATE wifi_plan_purchases SET status=\'PAID\'')) return { rowCount: 1, rows: [] };
        if (sql.includes('INSERT INTO access_grants')) return { rowCount: 1, rows: [] };
        throw new Error(`Unexpected SQL: ${sql}`);
      }),
      release: jest.fn(),
    };

    const db = {
      connect: jest.fn(async () => client),
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM wifi_plan_purchases p')) {
          return { rowCount: 1, rows: [{ id: purchaseId, customerId, packageId, routerId: null, price: 5000, currency: 'TZS', status: 'PAID' }] };
        }
        throw new Error(`Unexpected pool SQL: ${sql}`);
      }),
    } as any;

    const config = { get: jest.fn() } as any;
    const payments = new PaymentsService(db, config, { enqueue: jest.fn().mockResolvedValue(undefined) } as never);
    const service = new PurchasesService(db, payments, {} as any, { enqueue: jest.fn().mockResolvedValue(undefined) } as any);

    const result = await service.confirmPayment(tenantId, purchaseId, {
      provider: 'manual',
      providerReference: 'CASH-001',
      idempotencyKey: 'confirm-001',
      status: 'PAID',
    });

    expect(result.paymentId).toBe(paymentId);
    expect(calls.some(sql => sql.includes('INSERT INTO payments'))).toBe(false);
    expect(calls.some(sql => sql.includes("UPDATE payments SET provider_reference=$2, status='PAID'"))).toBe(true);
    expect(calls.some(sql => sql.includes('INSERT INTO access_grants'))).toBe(true);
    expect(client.release).toHaveBeenCalled();
  });
});


describe('PurchasesService tier selection', () => {
  it('resolves an active tenant package by tier before creating a purchase', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [{ id: 'pkg-nexus' }] }) } as any;
    const service = new PurchasesService(db, {} as any, {} as any, { enqueue: jest.fn().mockResolvedValue(undefined) } as any);
    const create = jest.spyOn(service, 'create').mockResolvedValue({ id: 'purchase-1' } as any);

    const result = await service.createFromTier('tenant-1', 'nexus', { customerId: 'customer-1' });

    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('tier_code=$2'), ['tenant-1', 'NEXUS']);
    expect(create).toHaveBeenCalledWith('tenant-1', {
      customerId: 'customer-1',
      packageId: 'pkg-nexus',
      routerId: undefined,
      promoCode: undefined,
    });
    expect(result).toEqual({ id: 'purchase-1' });
  });

  it('does not silently provision a missing tier', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rowCount: 0, rows: [] }) } as any;
    const service = new PurchasesService(db, {} as any, {} as any, { enqueue: jest.fn().mockResolvedValue(undefined) } as any);

    await expect(service.createFromTier('tenant-1', 'infinity', { customerId: 'customer-1' }))
      .rejects.toThrow('Active package for Jaslyn tier INFINITY is not configured');
  });
});


describe('PurchasesService failed payment', () => {
  it('cancels the purchase when a verified manual payment fails', async () => {
    const client = {
      query: jest.fn(async (sql: string) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rowCount: 0, rows: [] };
        if (sql.includes('FROM wifi_plan_purchases WHERE tenant_id = $1 AND id = $2 FOR UPDATE')) return { rowCount: 1, rows: [{ id: 'p1', customer_id: 'c1', package_id: 'pkg', price: 5000, currency: 'TZS', status: 'PENDING_PAYMENT', correlation_id: null }] };
        if (sql.includes('FROM payment_provider_configs')) return { rowCount: 0, rows: [] };
        if (sql.includes('FROM payments WHERE tenant_id = $1 AND idempotency_key = $2')) return { rowCount: 0, rows: [] };
        if (sql.includes("FROM payments WHERE tenant_id=$1 AND purchase_id=$2 AND status='PENDING'")) return { rowCount: 0, rows: [] };
        if (sql.includes('INSERT INTO payments')) return { rowCount: 1, rows: [{ id: 'pay-1' }] };
        if (sql.includes("UPDATE wifi_plan_purchases SET status='CANCELED'")) return { rowCount: 1, rows: [] };
        throw new Error(`Unexpected SQL: ${sql}`);
      }),
      release: jest.fn(),
    };
    const db = { connect: jest.fn().mockResolvedValue(client) } as any;
    const payments = { assertMethodCanSettle: jest.fn().mockResolvedValue({ code: 'manual' }) } as any;
    const service = new PurchasesService(db, payments, {} as any, { enqueue: jest.fn().mockResolvedValue(undefined) } as any);

    const result = await service.confirmPayment('tenant-1', 'p1', {
      provider: 'manual',
      providerReference: 'CASH-FAILED',
      idempotencyKey: 'failed-001',
      status: 'FAILED',
    });

    expect(result.paymentId).toBe('pay-1');
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE wifi_plan_purchases SET status='CANCELED'"),
      ['tenant-1', 'p1'],
    );
  });
});
