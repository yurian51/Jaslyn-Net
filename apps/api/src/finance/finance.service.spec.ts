import { FinanceService } from './finance.service';

describe('FinanceService invoice integrity', () => {
  const db = { query: jest.fn() };
  const audit = { record: jest.fn().mockResolvedValue({ id: 'audit-1' }) };
  const service = new FinanceService(db as any, audit as any);

  beforeEach(() => {
    db.query.mockReset();
    audit.record.mockClear();
  });

  it('uses the database invoice sequence and audits creation', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ number: 'INV-00000042' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'purchase-1' }] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: 'invoice-1',
          invoice_number: 'INV-00000042',
          total: '118000',
          currency: 'TZS',
        }],
      });

    const result = await service.createInvoice('tenant-1', {
      customerId: 'customer-1',
      purchaseId: 'purchase-1',
      currency: 'tzs',
      subtotal: 100000,
      taxTotal: 18000,
    });

    expect(db.query.mock.calls[0]).toEqual([
      'SELECT next_invoice_number($1) AS number',
      ['tenant-1'],
    ]);
    expect(result.invoice_number).toBe('INV-00000042');
    expect(audit.record).toHaveBeenCalledWith(
      'tenant-1',
      'CREATE',
      'invoice',
      'invoice-1',
      expect.objectContaining({
        invoiceNumber: 'INV-00000042',
        total: '118000',
        currency: 'TZS',
      }),
      { userId: undefined },
    );
  });

  it('refuses a purchase that does not belong to the customer', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ number: 'INV-00000043' }] });
    db.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    await expect(
      service.createInvoice('tenant-1', {
        customerId: 'customer-1',
        purchaseId: 'purchase-other-customer',
        currency: 'TZS',
        subtotal: 1000,
        taxTotal: 0,
      }),
    ).rejects.toThrow('Purchase not found for customer');

    expect(audit.record).not.toHaveBeenCalled();
  });

  it('rejects a refund idempotency-key race bound to another payment', async () => {
    const client = {
      query: jest.fn(async (sql: string) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rowCount: 0, rows: [] };
        if (sql.includes('FROM payments WHERE tenant_id=$1 AND id=$2 FOR UPDATE')) {
          return { rowCount: 1, rows: [{ id: 'payment-requested', amount: '100', currency: 'TZS', status: 'PAID' }] };
        }
        if (sql.includes('FROM refunds WHERE tenant_id=$1 AND idempotency_key=$2 FOR UPDATE')) return { rowCount: 0, rows: [] };
        if (sql.includes('SELECT COALESCE(SUM(amount),0) AS total FROM refunds')) return { rowCount: 1, rows: [{ total: '0' }] };
        if (sql.includes('INSERT INTO refunds')) {
          const error = new Error('unique refund idempotency key') as Error & { code: string };
          error.code = '23505';
          throw error;
        }
        return { rowCount: 0, rows: [] };
      }),
      release: jest.fn(),
    };
    const db = {
      connect: jest.fn().mockResolvedValue(client),
      query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [{ id: 'refund-1', payment_id: 'payment-other', amount: '10', currency: 'TZS' }] }),
    };
    const service = new FinanceService(db as any, { record: jest.fn().mockResolvedValue({ id: 'audit-1' }) } as any);

    await expect(service.requestRefund('tenant-1', {
      paymentId: 'payment-requested', amount: 10, reason: 'duplicate test', idempotencyKey: 'refund-key-001',
    })).rejects.toThrow('Refund idempotency key is already bound to another refund');

    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });
});
