import { NetworkCapabilitiesController } from './network-capabilities.controller';

describe('NetworkCapabilitiesController', () => {
  it('returns executable lifecycle truth instead of collapsing generic transport into native support', () => {
    const adapters = {
      list: () => [
        { protocol: 'MIKROTIK_REST', lifecycle: 'NATIVE', capabilities: ['disconnect_client'] },
        { protocol: 'GENERIC_HTTP', lifecycle: 'GENERIC', capabilities: ['client_sessions'] },
      ],
      get: (protocol: string) => protocol === 'MIKROTIK_REST'
        ? { protocol, lifecycle: 'NATIVE', capabilities: ['disconnect_client'] }
        : protocol === 'GENERIC_HTTP'
          ? { protocol, lifecycle: 'GENERIC', capabilities: ['client_sessions'] }
          : undefined,
      isImplemented: (protocol: string) => ['MIKROTIK_REST', 'GENERIC_HTTP'].includes(protocol),
    } as any;

    const controller = new NetworkCapabilitiesController(adapters);
    const result = controller.list();

    expect(result.version).toBe(4);
    expect(result.adapters[0].lifecycle).toBe('NATIVE');
    expect(result.adapters[1].lifecycle).toBe('GENERIC');
    expect(result.adapters[1].supportScope).toBe('GENERIC_TELEMETRY');
    expect(result.adapters[1].liveDeviceValidationRequired).toBe(true);
    expect(result.vendors.find((v: any) => v.protocols.some((p: any) => p.protocol === 'GENERIC_HTTP'))?.protocols.find((p: any) => p.protocol === 'GENERIC_HTTP')?.lifecycle).toBe('GENERIC');
  });
});
