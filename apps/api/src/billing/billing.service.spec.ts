import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { BillingService } from './billing.service';

function makeClient(query: jest.Mock) {
  return { query, release: jest.fn() } as any;
}

function makeService(db: any, secret = 'test-webhook-secret') {
  return new BillingService(db, { get: jest.fn().mockReturnValue(secret) } as any);
}

describe('BillingService', () => {
  it('rejects a purchase from another tenant', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce(undefined);
    const client = makeClient(query);
    const db = { connect: jest.fn().mockResolvedValue(client) } as any;
    const service = makeService(db);

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
    const service = makeService(db);

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
    const service = makeService(db);

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
    const service = makeService(db);

    await expect(service.initiatePayment('tenant-a', {
      purchaseId: 'purchase-1', provider: 'test', idempotencyKey: 'idem-new-key',
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('uses the tenant-scoped payment-event uniqueness contract', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rowCount: 1, rows: [{
        id: 'payment-1', tenant_id: 'tenant-a', customer_id: 'customer-1', purchase_id: null,
        provider: 'test', amount: '1000', currency: 'TZS', status: 'PENDING', duration_seconds: null,
      }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'event-1' }] })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    const client = makeClient(query);
    const db = { connect: jest.fn().mockResolvedValue(client) } as any;
    const service = makeService(db);

    await expect(service.processPaymentWebhook('test', {
      tenantId: 'tenant-a',
      paymentId: 'payment-1',
      eventId: 'event-1',
      eventType: 'payment.success',
      status: 'SUCCESS',
      amount: '1000',
      currency: 'TZS',
    })).resolves.toMatchObject({ accepted: true, duplicate: false });

    const eventInsert = query.mock.calls.find((call: unknown[]) => String(call[0]).includes('INSERT INTO payment_events'));
    expect(eventInsert?.[0]).toContain('ON CONFLICT(tenant_id,provider,provider_event_id)');
  });

  it('accepts a valid HMAC signature and rejects a tampered signature', () => {
    const db = { connect: jest.fn() } as any;
    const service = makeService(db);
    const body = Buffer.from('{"event":"payment.success"}');
    const signature = createHmac('sha256', 'test-webhook-secret').update(body).digest('hex');

    expect(() => service.verifyWebhookSignature(body, `sha256=${signature}`)).not.toThrow();
    expect(() => service.verifyWebhookSignature(body, '00'.repeat(32))).toThrow(UnauthorizedException);
  });
});
