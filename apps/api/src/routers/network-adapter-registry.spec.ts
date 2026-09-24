import { NetworkAdapterRegistry } from './network-adapter-registry';

describe('NetworkAdapterRegistry', () => {
  it('reports executable hybrid adapters as implemented', () => {
    const registry = new NetworkAdapterRegistry();

    expect(registry.isImplemented('MIKROTIK_REST')).toBe(true);
    expect(registry.isImplemented('MERAKI_DASHBOARD_API')).toBe(true);
    expect(registry.isImplemented('UNIFI_NETWORK_API')).toBe(true);
    expect(registry.isImplemented('OPENWRT_UBUS')).toBe(true);
    expect(registry.isImplemented('OMADA_CONTROLLER_API')).toBe(false);
  });

  it('normalizes protocol lookup and exposes capability truth', () => {
    const registry = new NetworkAdapterRegistry();

    expect(registry.get('mikrotik_rest')?.lifecycle).toBe('IMPLEMENTED');
    expect(registry.supports('MERAKI_DASHBOARD_API', 'bandwidth_enforcement')).toBe(true);
    expect(registry.supports('MERAKI_DASHBOARD_API', 'disconnect_client')).toBe(false);
    expect(registry.supports('OMADA_CONTROLLER_API', 'client_sessions')).toBe(false);
  });
});
