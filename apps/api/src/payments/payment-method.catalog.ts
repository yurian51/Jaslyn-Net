export type PaymentMethodCategory = 'MANUAL' | 'MOBILE_MONEY' | 'CARD' | 'BANK' | 'WALLET' | 'CRYPTO';

export interface PaymentMethodDefinition {
  code: string;
  name: string;
  subtitle: string;
  category: PaymentMethodCategory;
  countries: string[];
  currencies: string[];
  logoUrl?: string;
  fallback: string;
  tone: string;
  directIntegration: boolean;
  webhookSupported: boolean;
  reconciliationSupported: boolean;
}

/**
 * Product catalog only. A method is not considered operational until the
 * tenant has an active provider configuration. Keeping this distinction here
 * prevents the checkout UI from turning a brand list into a fake integration.
 */
export const PAYMENT_METHOD_CATALOG: readonly PaymentMethodDefinition[] = [
  { code: 'manual', name: 'Manual', subtitle: 'JASLYN NET operations', category: 'MANUAL', countries: ['TZ'], currencies: ['TZS'], fallback: 'J', tone: 'jaslyn', directIntegration: true, webhookSupported: false, reconciliationSupported: true },
  { code: 'mpesa', name: 'M-Pesa', subtitle: 'Vodacom Tanzania', category: 'MOBILE_MONEY', countries: ['TZ'], currencies: ['TZS'], fallback: 'M', tone: 'mpesa', directIntegration: true, webhookSupported: true, reconciliationSupported: true },
  { code: 'airtel_money', name: 'Airtel Money', subtitle: 'Airtel Tanzania', category: 'MOBILE_MONEY', countries: ['TZ'], currencies: ['TZS'], fallback: 'A', tone: 'airtel_money', directIntegration: true, webhookSupported: true, reconciliationSupported: true },
  { code: 'tigopesa', name: 'Mixx by Yas', subtitle: 'Formerly Tigo Pesa', category: 'MOBILE_MONEY', countries: ['TZ'], currencies: ['TZS'], fallback: 'M', tone: 'tigopesa', directIntegration: true, webhookSupported: true, reconciliationSupported: true },
  { code: 'halopesa', name: 'HaloPesa', subtitle: 'Tanzania mobile money', category: 'MOBILE_MONEY', countries: ['TZ'], currencies: ['TZS'], fallback: 'H', tone: 'halopesa', directIntegration: true, webhookSupported: true, reconciliationSupported: true },
  { code: 'azampesa', name: 'AzamPesa', subtitle: 'Tanzania mobile money', category: 'MOBILE_MONEY', countries: ['TZ'], currencies: ['TZS'], fallback: 'A', tone: 'azampesa', directIntegration: true, webhookSupported: true, reconciliationSupported: true },
  { code: 'card', name: 'Visa / Mastercard', subtitle: 'Debit & credit cards', category: 'CARD', countries: ['*'], currencies: ['*'], fallback: 'V', tone: 'card', directIntegration: false, webhookSupported: true, reconciliationSupported: true },
  { code: 'paypal', name: 'PayPal', subtitle: 'Global wallet', category: 'WALLET', countries: ['*'], currencies: ['*'], fallback: 'P', tone: 'paypal', directIntegration: true, webhookSupported: true, reconciliationSupported: true },
  { code: 'apple_pay', name: 'Apple Pay', subtitle: 'Digital wallet', category: 'WALLET', countries: ['*'], currencies: ['*'], fallback: '', tone: 'apple_pay', directIntegration: false, webhookSupported: true, reconciliationSupported: true },
  { code: 'google_pay', name: 'Google Pay', subtitle: 'Digital wallet', category: 'WALLET', countries: ['*'], currencies: ['*'], fallback: 'G', tone: 'google_pay', directIntegration: false, webhookSupported: true, reconciliationSupported: true },
  { code: 'binance_pay', name: 'Binance Pay', subtitle: 'Crypto payments', category: 'CRYPTO', countries: ['*'], currencies: ['*'], fallback: 'B', tone: 'binance_pay', directIntegration: true, webhookSupported: true, reconciliationSupported: true },
  { code: 'bank', name: 'Bank transfer', subtitle: 'Bank / settlement', category: 'BANK', countries: ['TZ'], currencies: ['TZS'], fallback: 'BK', tone: 'bank', directIntegration: false, webhookSupported: false, reconciliationSupported: true },
];

export function getPaymentMethod(code: string) {
  const normalized = code.trim().toLowerCase();
  return PAYMENT_METHOD_CATALOG.find(method => method.code === normalized) ?? null;
}
