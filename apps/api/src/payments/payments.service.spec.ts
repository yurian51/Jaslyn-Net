import { PaymentsService } from './payments.service';
import { Pool } from 'pg';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';

describe('PaymentsService', () => {
  function serviceWith(db: Pool) {
    return new PaymentsService(db, new ConfigService(), { enqueue: jest.fn().mockResolvedValue(undefined) } as never);
  }

  it('reuses an existing idempotent payment intent', async () => {
    const client = {
      query: jest.fn(async (sql: string) => {
        if (sql === 'BEGIN' || sql === 'COMMIT') return { rowCount: 0, rows: [] };
        if (sql.includes('FROM wifi_plan_purchases')) return { rowCount: 1, rows: [{ customer_id: 'c1', price: '1000', currency: 'TZS', status: 'PENDING_PAYMENT' }] };
        if (sql.includes('FROM payment_provider_configs')) return { rowCount: 1, rows: [{ metadata: {} }] };
        if (sql.includes('FROM payments WHERE')) return { rowCount: 1, rows: [{ id: 'pay-1', status: 'PENDING', provider: 'mpesa', purchaseId: '00000000-0000-0000-0000-000000000001' }] };
        return { rowCount: 0, rows: [] };
      }),
      release: jest.fn(),
    };
    const db = { connect: jest.fn().mockResolvedValue(client) } as unknown as Pool;
    const result = await serviceWith(db).createIntent('tenant-1', { purchaseId: '00000000-0000-0000-0000-000000000001', provider: 'mpesa' });

    expect(result).toMatchObject({ id: 'pay-1', reused: true });
    expect(client.release).toHaveBeenCalled();
  });

  it('rejects an idempotency key reused for a different purchase', async () => {
    const client = {
      query: jest.fn(async (sql: string) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rowCount: 0, rows: [] };
        if (sql.includes('FROM wifi_plan_purchases')) return { rowCount: 1, rows: [{ customer_id: 'c1', price: '1000', currency: 'TZS', status: 'PENDING_PAYMENT' }] };
        if (sql.includes('FROM payment_provider_configs')) return { rowCount: 1, rows: [{ metadata: {} }] };
        if (sql.includes('FROM payments WHERE')) return { rowCount: 1, rows: [{
          id: 'pay-existing', status: 'PENDING', provider: 'mpesa',
          purchaseId: '00000000-0000-0000-0000-000000000099',
        }] };
        return { rowCount: 0, rows: [] };
      }),
      release: jest.fn(),
    };
    const db = { connect: jest.fn().mockResolvedValue(client) } as unknown as Pool;
    await expect(serviceWith(db).createIntent('tenant-1', {
      purchaseId: '00000000-0000-0000-0000-000000000001',
      provider: 'mpesa',
      idempotencyKey: 'reused-key-1234567890',
    })).rejects.toThrow('Idempotency key is already bound to another purchase');
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
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

  it('rejects cross-purchase idempotency reuse when recovering a unique-key race', async () => {
    const client = {
      query: jest.fn(async (sql: string) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rowCount: 0, rows: [] };
        if (sql.includes('FROM wifi_plan_purchases')) return { rowCount: 1, rows: [{ customer_id: 'c1', price: '1000', currency: 'TZS', status: 'PENDING_PAYMENT' }] };
        if (sql.includes('FROM payment_provider_configs')) return { rowCount: 1, rows: [{ metadata: {} }] };
        if (sql.includes('FROM payments WHERE') && sql.includes('idempotency_key')) return { rowCount: 0, rows: [] };
        if (sql.includes('INSERT INTO payments')) {
          const error = new Error('duplicate idempotency key') as Error & { code: string; constraint: string };
          error.code = '23505';
          error.constraint = 'payments_tenant_idempotency_key_uq';
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
        rows: [{ id: 'pay-existing', status: 'PENDING', provider: 'mpesa', purchaseId: '00000000-0000-0000-0000-000000000099', idempotencyKey: 'reused-key-1234567890' }],
      }),
    } as unknown as Pool;

    await expect(serviceWith(db).createIntent('tenant-1', {
      purchaseId: '00000000-0000-0000-0000-000000000001',
      provider: 'mpesa',
      idempotencyKey: 'reused-key-1234567890',
    })).rejects.toThrow('Idempotency key is already bound to another purchase');
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
    const service = new PaymentsService(db, config, { enqueue: jest.fn().mockResolvedValue(undefined) } as never);

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


  it('accepts a signed webhook as an unverified event without settling payment', async () => {
    const secret = 'test-webhook-secret';
    const rawBody = Buffer.from('{"event":"payment.refunded","paymentId":"pay-1"}');
    const signature = createHmac('sha256', secret).update(rawBody).digest('hex');
    const eventClient = {
      query: jest.fn(async (sql: string) => {
        if (sql === 'BEGIN' || sql === 'COMMIT') return { rowCount: 0, rows: [] };
        if (sql.includes('FROM payments WHERE tenant_id=$1 AND id=$2 AND provider=$3')) return { rowCount: 1, rows: [{ id: 'pay-1' }] };
        if (sql.includes('INSERT INTO payment_events')) return { rowCount: 1, rows: [{ id: 'event-1' }] };
        if (sql === 'ROLLBACK') return { rowCount: 0, rows: [] };
        throw new Error(`Unexpected SQL: ${sql}`);
      }),
      release: jest.fn(),
    };
    const config = { get: jest.fn().mockReturnValue(secret) } as unknown as ConfigService;
    const db = {
      query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [{ webhookSecretRef: 'PAYMENT_WEBHOOK_SECRET' }] }),
      connect: jest.fn().mockResolvedValue(eventClient),
    } as unknown as Pool;
    const service = new PaymentsService(db, config, { enqueue: jest.fn().mockResolvedValue(undefined) } as never);

    await expect(service.webhook('tenant-1', {
      provider: 'mpesa',
      providerEventId: 'evt-refund-1',
      eventType: 'payment.refunded',
      paymentId: 'pay-1',
      status: 'REFUNDED',
      providerReference: 'MPESA-REFUND-1',
    }, rawBody, signature)).resolves.toMatchObject({
      accepted: true,
      eventId: 'event-1',
      processingStatus: 'RECEIVED',
      requiresVerification: true,
    });

    expect(eventClient.query).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE payments'));
    expect(eventClient.release).toHaveBeenCalled();
  });


  it('rejects a payment ID that is not owned by the webhook tenant and provider', async () => {
    const secret = 'test-webhook-secret';
    const rawBody = Buffer.from('{"event":"payment.success"}');
    const signature = createHmac('sha256', secret).update(rawBody).digest('hex');
    const eventClient = {
      query: jest.fn(async (sql: string) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rowCount: 0, rows: [] };
        if (sql.includes('FROM payments WHERE tenant_id=$1 AND id=$2 AND provider=$3')) return { rowCount: 0, rows: [] };
        return { rowCount: 0, rows: [] };
      }),
      release: jest.fn(),
    };
    const config = { get: jest.fn().mockReturnValue(secret) } as unknown as ConfigService;
    const db = {
      query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [{ webhookSecretRef: 'PAYMENT_WEBHOOK_SECRET' }] }),
      connect: jest.fn().mockResolvedValue(eventClient),
    } as unknown as Pool;
    const service = new PaymentsService(db, config, { enqueue: jest.fn().mockResolvedValue(undefined) } as never);

    await expect(service.webhook('tenant-1', {
      provider: 'mpesa',
      providerEventId: 'evt-wrong-tenant',
      eventType: 'payment.success',
      paymentId: '00000000-0000-0000-0000-000000000099',
      status: 'SUCCESS',
    }, rawBody, signature)).rejects.toThrow('Payment not found for this tenant and provider');

    expect(eventClient.query).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO payment_events'), expect.anything());
    expect(eventClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(eventClient.release).toHaveBeenCalled();
  });

  it('rolls back the webhook event when durable domain-event enqueue fails', async () => {
    const secret = 'test-webhook-secret';
    const rawBody = Buffer.from('{"event":"payment.success"}');
    const signature = createHmac('sha256', secret).update(rawBody).digest('hex');
    const eventClient = {
      query: jest.fn(async (sql: string) => {
        if (sql === 'BEGIN') return { rowCount: 0, rows: [] };
        if (sql.includes('INSERT INTO payment_events')) return { rowCount: 1, rows: [{ id: 'event-atomic-1' }] };
        if (sql === 'ROLLBACK') return { rowCount: 0, rows: [] };
        if (sql === 'COMMIT') throw new Error('Webhook transaction must not commit');
        return { rowCount: 0, rows: [] };
      }),
      release: jest.fn(),
    };
    const config = { get: jest.fn().mockReturnValue(secret) } as unknown as ConfigService;
    const db = {
      query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [{ webhookSecretRef: 'PAYMENT_WEBHOOK_SECRET' }] }),
      connect: jest.fn().mockResolvedValue(eventClient),
    } as unknown as Pool;
    const enqueue = jest.fn().mockRejectedValue(new Error('outbox unavailable'));
    const service = new PaymentsService(db, config, { enqueue } as never);

    await expect(service.webhook('tenant-1', {
      provider: 'mpesa',
      providerEventId: 'evt-atomic-1',
      eventType: 'payment.success',
      status: 'SUCCESS',
    }, rawBody, signature)).rejects.toThrow('outbox unavailable');

    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({
      eventKey: 'payment-webhook:mpesa:evt-atomic-1',
      aggregateId: 'event-atomic-1',
      payload: expect.objectContaining({ status: 'SUCCESS', paymentId: null, purchaseId: null }),
    }), eventClient);
    expect(eventClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(eventClient.query).not.toHaveBeenCalledWith('COMMIT');
    expect(eventClient.release).toHaveBeenCalled();
  });

  it('rejects a webhook with a missing signature before opening an event transaction', async () => {
    const config = { get: jest.fn().mockReturnValue('test-webhook-secret') } as unknown as ConfigService;
    const db = {
      query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [{ webhookSecretRef: 'PAYMENT_WEBHOOK_SECRET' }] }),
      connect: jest.fn(),
    } as unknown as Pool;
    const service = new PaymentsService(db, config, { enqueue: jest.fn().mockResolvedValue(undefined) } as never);

    await expect(service.webhook('tenant-1', {
      provider: 'mpesa',
      providerEventId: 'evt-no-signature',
      eventType: 'payment.success',
      status: 'SUCCESS',
    }, Buffer.from('{"event":"payment.success"}'))).rejects.toThrow('Missing webhook signature');

    expect(db.connect).not.toHaveBeenCalled();
  });

  it('rejects a malformed webhook signature before opening an event transaction', async () => {
    const config = { get: jest.fn().mockReturnValue('test-webhook-secret') } as unknown as ConfigService;
    const db = {
      query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [{ webhookSecretRef: 'PAYMENT_WEBHOOK_SECRET' }] }),
      connect: jest.fn(),
    } as unknown as Pool;
    const service = new PaymentsService(db, config, { enqueue: jest.fn().mockResolvedValue(undefined) } as never);

    await expect(service.webhook('tenant-1', {
      provider: 'mpesa',
      providerEventId: 'evt-bad-signature',
      eventType: 'payment.success',
      status: 'SUCCESS',
    }, Buffer.from('{"event":"payment.success"}'), 'not-a-signature')).rejects.toThrow('Invalid webhook signature');

    expect(db.connect).not.toHaveBeenCalled();
  });


  it('rejects reuse of a provider event identifier with changed payment facts', async () => {
    const secret = 'test-webhook-secret';
    const rawBody = Buffer.from('{"event":"payment.success","status":"PAID"}');
    const signature = createHmac('sha256', secret).update(rawBody).digest('hex');
    const eventClient = {
      query: jest.fn(async (sql: string) => {
        if (sql === 'BEGIN') return { rowCount: 0, rows: [] };
        if (sql.includes('INSERT INTO payment_events')) return { rowCount: 0, rows: [] };
        if (sql.includes('FROM payment_events')) return { rowCount: 1, rows: [{
          id: 'event-1', eventType: 'payment.success', processingStatus: 'PROCESSED',
          paymentId: 'pay-1', payload: { status: 'FAILED', paymentId: 'pay-1', purchaseId: 'purchase-1', providerReference: 'provider-ref-1' },
        }] };
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
    const service = new PaymentsService(db, config, { enqueue: jest.fn().mockResolvedValue(undefined) } as never);

    await expect(service.webhook('tenant-1', {
      provider: 'mpesa',
      providerEventId: 'evt-immutable-1',
      eventType: 'payment.success',
      status: 'PAID',
      paymentId: 'pay-1',
      purchaseId: 'purchase-1',
      providerReference: 'provider-ref-1',
    }, rawBody, signature)).rejects.toThrow('Payment event identifier is already bound to different payment data');

    expect(eventClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(eventClient.release).toHaveBeenCalled();
  });
});
