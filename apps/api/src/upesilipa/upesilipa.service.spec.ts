import { UpesiLipaService } from './upesilipa.service';

describe('UpesiLipaService', () => {
  it('exposes UpesiLipa hardware lifecycle without claiming catalogue-only adapters are native', () => {
    const service = new UpesiLipaService({} as never, {} as never);
    const result = service.capabilities();

    expect(result.provider).toBe('upesilipa');
    expect(result.paymentMethods).toContain('M-Pesa');
    expect(result.hardware.find((item) => item.vendor === 'MikroTik')?.mode).toBe('NATIVE');
    expect(result.hardware.find((item) => item.vendor === 'TP-Link Omada')?.mode).toBe('CATALOG_ONLY');
    expect(result.catalogOnlyHardware).toContain('Cambium');
  });
});
