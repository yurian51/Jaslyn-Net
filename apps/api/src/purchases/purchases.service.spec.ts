import { PaymentsService } from '../payments/payments.service';
import { PurchasesService } from './purchases.service';

describe('PurchasesService payment confirmation', () => {
  it('rejects direct confirmation for external providers', async () => {
    const db = { connect: jest.fn() } as any;
    const payments = { assertMethodCanSettle: jest.fn().mockResolvedValue({ code: 'mpesa' }) } as any;
    const service = new PurchasesService(db, payments);

    await expect(service.confirmPayment('tenant-1', 'purchase-1', {
      provider: 'mpesa',
      providerReference: 'MPESA-001',
      status: 'SUCCESS',
    })).rejects.toThrow('External payment providers must be verified through their provider webhook');

    expect(db.connect).not.toHaveBeenCalled();
    expect(payments.assertMethodCanSettle).not.toHaveBeenCalled();
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
        if (sql.includes('SELECT status, amount, currency, provider FROM payments')) return { rowCount: 1, rows: [{ status: 'SUCCESS', amount: '5000', currency: 'TZS', provider: 'manual' }] };
        if (sql.includes('INSERT INTO financial_ledger_accounts')) return { rowCount: 1, rows: [{ id: sql.includes('WiFi service revenue') ? 'revenue-account' : 'cash-account' }] };
        if (sql.includes('INSERT INTO financial_ledger_transactions')) return { rowCount: 1, rows: [{ id: 'ledger-tx-1' }] };
        if (sql.includes('FROM financial_ledger_entries')) return { rowCount: 0, rows: [] };
        if (sql.includes('INSERT INTO financial_ledger_entries')) return { rowCount: 2, rows: [] };
        if (sql.includes('UPDATE payments SET provider_reference=$2, status=\'SUCCESS\'')) return { rowCount: 1, rows: [] };
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
    const payments = new PaymentsService(db, config);
    const service = new PurchasesService(db, payments);

    const result = await service.confirmPayment(tenantId, purchaseId, {
      provider: 'manual',
      providerReference: 'CASH-001',
      idempotencyKey: 'confirm-001',
      status: 'SUCCESS',
    });

    expect(result.paymentId).toBe(paymentId);
    expect(calls.some(sql => sql.includes('INSERT INTO payments'))).toBe(false);
    expect(calls.some(sql => sql.includes("UPDATE payments SET provider_reference=$2, status='SUCCESS'"))).toBe(true);
    expect(calls.some(sql => sql.includes('INSERT INTO access_grants'))).toBe(true);
    expect(client.release).toHaveBeenCalled();
  });
});
