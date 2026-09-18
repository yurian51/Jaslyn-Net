import { Injectable } from '@nestjs/common';
import { PaymentsService } from '../payments/payments.service';
import { InitiatePaymentDto, PaymentWebhookDto } from './billing.dto';

@Injectable()
export class BillingService {
  constructor(private readonly payments: PaymentsService) {}

  /**
   * Compatibility facade for the legacy /billing/payments route.
   * Payment state mutation belongs exclusively to PaymentsService.
   */
  initiatePayment(tenantId: string, dto: InitiatePaymentDto) {
    return this.payments.createIntent(tenantId, {
      purchaseId: dto.purchaseId,
      provider: dto.provider,
      idempotencyKey: dto.idempotencyKey,
    });
  }

  /**
   * Compatibility facade for the legacy /billing/webhooks/:provider route.
   * Signature verification, idempotency and lifecycle transitions are owned by PaymentsService.
   */
  processPaymentWebhook(provider: string, dto: PaymentWebhookDto, rawBody: Buffer, signature?: string) {
    return this.payments.webhook(dto.tenantId, {
      provider,
      providerEventId: dto.eventId,
      eventType: dto.eventType,
      providerReference: dto.providerReference,
      purchaseId: undefined,
      paymentId: dto.paymentId,
      status: dto.status,
      payload: {
        ...dto,
        tenantId: undefined,
        paymentId: undefined,
      },
    }, rawBody, signature);
  }
}
