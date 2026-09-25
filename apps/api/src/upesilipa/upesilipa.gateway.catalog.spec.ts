import { UPESILIPA_GATEWAY_CATALOG } from './upesilipa.gateway.catalog';

describe('UpesiLipa gateway catalog', () => {
  it('keeps listed gateways catalogue-only until executable contracts are verified', () => {
    expect(UPESILIPA_GATEWAY_CATALOG).toHaveLength(8);
    expect(UPESILIPA_GATEWAY_CATALOG.every((gateway) => gateway.lifecycle === 'CATALOG_ONLY')).toBe(true);
    expect(UPESILIPA_GATEWAY_CATALOG.every((gateway) => gateway.country === 'TZ')).toBe(true);
    expect(UPESILIPA_GATEWAY_CATALOG.every((gateway) => gateway.currencies.includes('TZS'))).toBe(true);
  });
});
