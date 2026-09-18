import { BillingService } from './billing.service';
import { PaymentsService } from '../payments/payments.service';

describe('BillingService compatibility facade', () => {
  it('delegates payment initiation to the authoritative PaymentsService', async () => {
    const payments = {
      createIntent: jest.fn().mockResolvedValue({ id: 'payment-1', status: 'PENDING', reused: false }),
      webhook: jest.fn(),
    } as unknown as PaymentsService;
    const service = new BillingService(payments);

    await expect(service.initiatePayment('tenant-a', {
      purchaseId: '00000000-0000-0000-0000-000000000001',
      provider: 'mpesa',
      idempotencyKey: 'idem-12345678',
    })).resolves.toEqual({ id: 'payment-1', status: 'PENDING', reused: false });

    expect(payments.createIntent).toHaveBeenCalledWith('tenant-a', {
      purchaseId: '00000000-0000-0000-0000-000000000001',
      provider: 'mpesa',
      idempotencyKey: 'idem-12345678',
    });
  });

  it('delegates the legacy webhook route without reimplementing payment state', async () => {
    const payments = {
      createIntent: jest.fn(),
      webhook: jest.fn().mockResolvedValue({ accepted: true, duplicate: false, paymentId: 'payment-1' }),
    } as unknown as PaymentsService;
    const service = new BillingService(payments);
    const rawBody = Buffer.from('{"event":"payment.refunded"}');

    await expect(service.processPaymentWebhook('mpesa', {
      tenantId: 'tenant-a',
      paymentId: 'payment-1',
      eventId: 'provider-event-1',
      eventType: 'payment.refunded',
      status: 'REFUNDED',
      providerReference: 'MPESA-1',
      amount: '5000',
      currency: 'TZS',
    }, rawBody, 'sha256=test')).resolves.toEqual({
      accepted: true,
      duplicate: false,
      paymentId: 'payment-1',
    });

    expect(payments.webhook).toHaveBeenCalledWith('tenant-a', expect.objectContaining({
      provider: 'mpesa',
      providerEventId: 'provider-event-1',
      paymentId: 'payment-1',
      status: 'REFUNDED',
    }), rawBody, 'sha256=test');
  });
});
