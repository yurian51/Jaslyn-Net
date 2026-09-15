import { ConflictException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { Pool } from 'pg';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';

describe('PaymentsService', () => {
  function serviceWith(db: Pool) {
    return new PaymentsService(db, new ConfigService());
  }

  it('reuses an existing idempotent payment intent', async () => {
    const client = {
      query: jest.fn(async (sql: string) => {
        if (sql === 'BEGIN' || sql === 'COMMIT') return { rowCount: 0, rows: [] };
        if (sql.includes('FROM wifi_plan_purchases')) return { rowCount: 1, rows: [{ customer_id: 'c1', price: '1000', currency: 'TZS', status: 'PENDING_PAYMENT' }] };
        if (sql.includes('FROM payment_provider_configs')) return { rowCount: 1, rows: [{ metadata: {} }] };
        if (sql.includes('FROM payments WHERE')) return { rowCount: 1, rows: [{ id: 'pay-1', status: 'PENDING', provider: 'mpesa' }] };
        return { rowCount: 0, rows: [] };
      }),
      release: jest.fn(),
    };
    const db = { connect: jest.fn().mockResolvedValue(client) } as unknown as Pool;
    const result = await serviceWith(db).createIntent('tenant-1', { purchaseId: '00000000-0000-0000-0000-000000000001', provider: 'mpesa' });

    expect(result).toMatchObject({ id: 'pay-1', reused: true });
    expect(client.release).toHaveBeenCalled();
  });

  it('rejects an unknown provider at the settlement boundary', async () => {
    const db = { query: jest.fn() } as unknown as Pool;
    await expect(serviceWith(db).assertMethodCanSettle('tenant-1', 'made_up_provider', 'TZS')).rejects.toThrow('Unsupported payment method');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects an unconfigured non-manual provider', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rowCount: 0, rows: [] }) } as unknown as Pool;
    await expect(serviceWith(db).assertMethodCanSettle('tenant-1', 'mpesa', 'TZS')).rejects.toThrow('not configured');
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('allows manual settlement without pretending an external provider is configured', async () => {
    const db = { query: jest.fn() } as unknown as Pool;
    const method = await serviceWith(db).assertMethodCanSettle('tenant-1', 'MANUAL', 'TZS');
    expect(method.code).toBe('manual');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects a provider for an unsupported currency', async () => {
    const db = { query: jest.fn() } as unknown as Pool;
    await expect(serviceWith(db).assertMethodCanSettle('tenant-1', 'mpesa', 'USD')).rejects.toThrow('does not support currency USD');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects a configured provider when tenant metadata excludes the purchase currency', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [{ metadata: { currencies: ['USD'] } }] }) } as unknown as Pool;
    await expect(serviceWith(db).assertMethodCanSettle('tenant-1', 'mpesa', 'TZS')).rejects.toThrow('not configured for currency TZS');
  });

  it('recovers the pending payment when concurrent creation loses the purchase uniqueness race', async () => {
    const client = {
      query: jest.fn(async (sql: string) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rowCount: 0, rows: [] };
        if (sql.includes('FROM wifi_plan_purchases')) return { rowCount: 1, rows: [{ customer_id: 'c1', price: '1000', currency: 'TZS', status: 'PENDING_PAYMENT' }] };
        if (sql.includes('FROM payment_provider_configs')) return { rowCount: 1, rows: [{ metadata: {} }] };
        if (sql.includes('FROM payments WHERE') && sql.includes('idempotency_key')) return { rowCount: 0, rows: [] };
        if (sql.includes('INSERT INTO payments')) {
          const error = new Error('duplicate pending payment') as Error & { code: string; constraint: string };
          error.code = '23505';
          error.constraint = 'payments_one_pending_per_purchase_uq';
          throw error;
        }
        return { rowCount: 0, rows: [] };
      }),
      release: jest.fn(),
    };
    const db = {
      connect: jest.fn().mockResolvedValue(client),
      query: jest.fn().mockResolvedValue({
        rowCount: 1,
        rows: [{ id: 'pay-concurrent', status: 'PENDING', provider: 'mpesa', idempotencyKey: 'intent:purchase-1:mpesa' }],
      }),
    } as unknown as Pool;

    const result = await serviceWith(db).createIntent('tenant-1', {
      purchaseId: 'purchase-1',
      provider: 'mpesa',
    });

    expect(result).toMatchObject({ id: 'pay-concurrent', reused: true });
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("status='PENDING'"), ['tenant-1', 'purchase-1']);
    expect(client.release).toHaveBeenCalled();
  });

  it('rejects reuse of a provider event identifier for a different event type', async () => {
    const secret = 'test-webhook-secret';
    const rawBody = Buffer.from('{"event":"payment.failed"}');
    const signature = createHmac('sha256', secret).update(rawBody).digest('hex');
    const eventClient = {
      query: jest.fn(async (sql: string) => {
        if (sql === 'BEGIN') return { rowCount: 0, rows: [] };
        if (sql.includes('INSERT INTO payment_events')) return { rowCount: 0, rows: [] };
        if (sql.includes('FROM payment_events')) return { rowCount: 1, rows: [{ id: 'event-1', eventType: 'payment.success', processingStatus: 'RECEIVED', paymentId: null }] };
        if (sql === 'ROLLBACK') return { rowCount: 0, rows: [] };
        return { rowCount: 0, rows: [] };
      }),
      release: jest.fn(),
    };
    const config = { get: jest.fn().mockReturnValue(secret) } as unknown as ConfigService;
    const db = {
      query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [{ webhookSecretRef: 'PAYMENT_WEBHOOK_SECRET' }] }),
      connect: jest.fn().mockResolvedValue(eventClient),
    } as unknown as Pool;
    const service = new PaymentsService(db, config);

    await expect(service.webhook(
      'tenant-1',
      {
        provider: 'mpesa',
        providerEventId: 'evt-1',
        eventType: 'payment.failed',
        status: 'FAILED',
        payload: { amount: 1000 },
      },
      rawBody,
      signature,
    )).rejects.toThrow('Payment event identifier is already bound to a different event type');

    expect(eventClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(eventClient.release).toHaveBeenCalled();
    expect(db.connect).toHaveBeenCalledTimes(1);
  });
});
