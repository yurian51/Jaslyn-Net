import { ConflictException, NotFoundException } from '@nestjs/common';
import { BillingService } from './billing.service';

function makeClient(query: jest.Mock) {
  return { query, release: jest.fn() } as any;
}

function makeConfig() {
  return { get: jest.fn().mockReturnValue('test-secret') } as any;
}

describe('BillingService', () => {
  it('rejects a purchase from another tenant', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce(undefined);
    const client = makeClient(query);
    const db = { connect: jest.fn().mockResolvedValue(client) } as any;
    const service = new BillingService(db, makeConfig());

    await expect(service.initiatePayment('tenant-a', {
      purchaseId: '00000000-0000-0000-0000-000000000001',
      provider: 'test',
      idempotencyKey: 'idem-12345678',
    })).rejects.toBeInstanceOf(NotFoundException);

    expect(query).toHaveBeenCalledWith('BEGIN');
    expect(query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });

  it('returns the existing payment for a repeated idempotency key', async () => {
    const payment = { id: 'payment-1', purchase_id: 'purchase-1', provider: 'test', status: 'PENDING' };
    const query = jest.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'purchase-1', customer_id: 'customer-1', price: 1000, currency: 'TZS', status: 'PENDING_PAYMENT' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [payment] })
      .mockResolvedValueOnce(undefined);
    const client = makeClient(query);
    const db = { connect: jest.fn().mockResolvedValue(client) } as any;
    const service = new BillingService(db, makeConfig());

    await expect(service.initiatePayment('tenant-a', {
      purchaseId: 'purchase-1', provider: 'test', idempotencyKey: 'idem-12345678',
    })).resolves.toEqual(payment);
    expect(query).toHaveBeenCalledWith('COMMIT');
  });

  it('rejects an idempotency key reused for another purchase', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'purchase-1', customer_id: 'customer-1', price: 1000, currency: 'TZS', status: 'PENDING_PAYMENT' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'payment-1', purchase_id: 'purchase-2', status: 'PENDING' }] })
      .mockResolvedValueOnce(undefined);
    const client = makeClient(query);
    const db = { connect: jest.fn().mockResolvedValue(client) } as any;
    const service = new BillingService(db, makeConfig());

    await expect(service.initiatePayment('tenant-a', {
      purchaseId: 'purchase-1', provider: 'test', idempotencyKey: 'idem-12345678',
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('converts a concurrent pending-payment race into a conflict', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'purchase-1', customer_id: 'customer-1', price: 1000, currency: 'TZS', status: 'PENDING_PAYMENT' }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockRejectedValueOnce({ code: '23505' })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'payment-existing' }] })
      .mockResolvedValueOnce(undefined);
    const client = makeClient(query);
    const db = { connect: jest.fn().mockResolvedValue(client) } as any;
    const service = new BillingService(db, makeConfig());

    await expect(service.initiatePayment('tenant-a', {
      purchaseId: 'purchase-1', provider: 'test', idempotencyKey: 'idem-new-key',
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('uses tenant-scoped provider event uniqueness for webhook deduplication', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: 'payment-1', tenant_id: 'tenant-a', customer_id: 'customer-1', purchase_id: null,
          provider: 'test', amount: 1000, currency: 'TZS', status: 'PENDING',
          package_id: null, duration_seconds: null,
        }],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'event-1' }] })
      .mockResolvedValueOnce(undefined);
    const client = makeClient(query);
    const db = { connect: jest.fn().mockResolvedValue(client) } as any;
    const service = new BillingService(db, makeConfig());

    await expect(service.processPaymentWebhook('test', {
      tenantId: 'tenant-a',
      paymentId: 'payment-1',
      eventId: 'provider-event-1',
      eventType: 'payment.success',
      status: 'SUCCESS',
      amount: 1000,
      currency: 'TZS',
    })).resolves.toEqual({
      accepted: true, duplicate: false, paymentId: 'payment-1', eventId: 'provider-event-1', status: 'SUCCESS',
    });

    const eventInsert = query.mock.calls.find((call: unknown[]) => String(call[0]).includes('INSERT INTO payment_events'));
    expect(eventInsert?.[0]).toContain('ON CONFLICT (tenant_id,provider,provider_event_id)');
    expect(query).toHaveBeenCalledWith('COMMIT');
  });
});
