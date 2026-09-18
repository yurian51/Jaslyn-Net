export type PaymentProviderStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED' | 'UNKNOWN';

export type PaymentProviderResult = {
  providerReference?: string;
  status: PaymentProviderStatus;
  raw?: Record<string, unknown>;
};

export type PaymentProviderTransaction = PaymentProviderResult & {
  amount?: string | number;
  currency?: string;
};

export interface PaymentProvider {
  readonly name: string;

  initiatePayment(input: {
    amount: string | number;
    currency: string;
    reference: string;
    metadata?: Record<string, unknown>;
  }): Promise<PaymentProviderResult>;

  verifyPayment(input: {
    providerReference: string;
    amount?: string | number;
    currency?: string;
    metadata?: Record<string, unknown>;
  }): Promise<PaymentProviderResult>;

  getTransaction(providerReference: string): Promise<PaymentProviderTransaction>;

  getStatus(providerReference: string): Promise<PaymentProviderResult>;

  refund(input: {
    providerReference: string;
    amount?: string | number;
    currency?: string;
    reason?: string;
  }): Promise<PaymentProviderResult>;

  handleWebhook(input: {
    rawBody: Buffer;
    signature?: string;
    headers: Record<string, string | undefined>;
  }): Promise<PaymentProviderResult>;

  /**
   * Legacy alias retained only for existing test/mock callers.
   * Production payment orchestration must use initiatePayment().
   */
  createPayment(input: {
    amount: string | number;
    currency: string;
    reference: string;
    metadata?: Record<string, unknown>;
  }): Promise<PaymentProviderResult>;
}
