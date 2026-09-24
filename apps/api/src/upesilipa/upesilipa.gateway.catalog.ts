export type UpesiLipaGatewayLifecycle = 'CATALOG_ONLY' | 'NATIVE_ADAPTER';

export interface UpesiLipaGatewayDefinition {
  code: string;
  name: string;
  lifecycle: UpesiLipaGatewayLifecycle;
  country: 'TZ';
  currencies: readonly ['TZS'];
  webhook: boolean;
  reconciliation: boolean;
  note: string;
}

export const UPESILIPA_GATEWAY_CATALOG: readonly UpesiLipaGatewayDefinition[] = [
  { code: 'palmpesa', name: 'PalmPesa', lifecycle: 'CATALOG_ONLY', country: 'TZ', currencies: ['TZS'], webhook: false, reconciliation: false, note: 'Provider listed by UpesiLipa; executable Jaslyn adapter requires verified provider API contract.' },
  { code: 'pluspesa', name: 'PlusPesa', lifecycle: 'CATALOG_ONLY', country: 'TZ', currencies: ['TZS'], webhook: false, reconciliation: false, note: 'Provider listed by UpesiLipa; executable Jaslyn adapter requires verified provider API contract.' },
  { code: 'fimipay', name: 'FimiPay', lifecycle: 'CATALOG_ONLY', country: 'TZ', currencies: ['TZS'], webhook: false, reconciliation: false, note: 'Provider listed by UpesiLipa; executable Jaslyn adapter requires verified provider API contract.' },
  { code: 'clickpesa', name: 'ClickPesa', lifecycle: 'CATALOG_ONLY', country: 'TZ', currencies: ['TZS'], webhook: false, reconciliation: false, note: 'Provider listed by UpesiLipa; executable Jaslyn adapter requires verified provider API contract.' },
  { code: 'azampay', name: 'AzamPay', lifecycle: 'CATALOG_ONLY', country: 'TZ', currencies: ['TZS'], webhook: false, reconciliation: false, note: 'Provider listed by UpesiLipa; executable Jaslyn adapter requires verified provider API contract.' },
  { code: 'snippe', name: 'Snippe', lifecycle: 'CATALOG_ONLY', country: 'TZ', currencies: ['TZS'], webhook: false, reconciliation: false, note: 'Provider listed by UpesiLipa; executable Jaslyn adapter requires verified provider API contract.' },
  { code: 'selcom', name: 'Selcom', lifecycle: 'CATALOG_ONLY', country: 'TZ', currencies: ['TZS'], webhook: false, reconciliation: false, note: 'Provider listed by UpesiLipa; executable Jaslyn adapter requires verified provider API contract.' },
  { code: 'sonicpesa', name: 'SonicPesa', lifecycle: 'CATALOG_ONLY', country: 'TZ', currencies: ['TZS'], webhook: false, reconciliation: false, note: 'Provider listed by UpesiLipa; executable Jaslyn adapter requires verified provider API contract.' },
];
