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
});
