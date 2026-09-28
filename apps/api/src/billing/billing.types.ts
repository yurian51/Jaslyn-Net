export type WifiPurchaseStatus = 'PENDING_PAYMENT' | 'PAID' | 'ACTIVE' | 'EXPIRED' | 'CANCELED' | 'REFUNDED';
export type PaymentStatus = 'INITIATED' | 'PENDING' | 'AUTHORIZED' | 'PAID' | 'FAILED' | 'CANCELLED' | 'REVERSED' | 'REFUNDED';

export interface PaymentInitiation {
  tenantId: string; customerId: string; purchaseId: string; amount: number; currency: string; phone?: string; idempotencyKey: string;
}

export interface PaymentProviderResult {
  providerReference: string; status: 'PENDING' | 'SUCCESS' | 'FAILED'; message?: string;
}

export interface PaymentProvider {
  readonly name: string;
  initiate(input: PaymentInitiation): Promise<PaymentProviderResult>;
  verify(providerReference: string): Promise<PaymentProviderResult>;
}
