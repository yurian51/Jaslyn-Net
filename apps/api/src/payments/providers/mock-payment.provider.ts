import { Injectable, NotImplementedException } from '@nestjs/common';
import { PaymentProvider, PaymentProviderResult, PaymentProviderTransaction } from './payment-provider';

@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';

  async initiatePayment(input: { amount: string | number; currency: string; reference: string; metadata?: Record<string, unknown> }): Promise<PaymentProviderResult> {
    return {
      providerReference: `MOCK-${input.reference}`,
      status: 'PENDING',
      raw: { provider: this.name, amount: input.amount, currency: input.currency, metadata: input.metadata ?? {} },
    };
  }

  async createPayment(input: { amount: string | number; currency: string; reference: string; metadata?: Record<string, unknown> }): Promise<PaymentProviderResult> {
    return this.initiatePayment(input);
  }

  async verifyPayment(): Promise<PaymentProviderResult> {
    throw new NotImplementedException('Mock provider cannot verify real payments');
  }

  async getTransaction(): Promise<PaymentProviderTransaction> {
    throw new NotImplementedException('Mock provider cannot retrieve real transactions');
  }

  async getStatus(): Promise<PaymentProviderResult> {
    throw new NotImplementedException('Mock provider cannot query real payment status');
  }

  async refund(): Promise<PaymentProviderResult> {
    throw new NotImplementedException('Mock provider cannot refund real payments');
  }

  async handleWebhook(): Promise<PaymentProviderResult> {
    throw new NotImplementedException('Mock provider cannot process production webhooks');
  }
}
