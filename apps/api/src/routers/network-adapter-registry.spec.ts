import { NetworkAdapterRegistry } from './network-adapter-registry';

describe('NetworkAdapterRegistry', () => {
  it('reports executable hybrid adapters as implemented', () => {
    const registry = new NetworkAdapterRegistry();

    expect(registry.isImplemented('MIKROTIK_REST')).toBe(true);
    expect(registry.isImplemented('MERAKI_DASHBOARD_API')).toBe(true);
    expect(registry.isImplemented('UNIFI_NETWORK_API')).toBe(true);
    expect(registry.isImplemented('OPENWRT_UBUS')).toBe(true);
    expect(registry.isImplemented('OMADA_CONTROLLER_API')).toBe(true);
    expect(registry.isImplemented('CAMBIUM_CNMAESTRO')).toBe(true);
    expect(registry.isImplemented('ARUBA_CENTRAL_API')).toBe(true);
    expect(registry.isImplemented('GRANDSTREAM_GWN_API')).toBe(true);
    expect(registry.isImplemented('RUCKUS_SMARTZONE_API')).toBe(true);
    expect(registry.isImplemented('TELTONIKA_RMS_API')).toBe(true);
    expect(registry.isImplemented('PEPLINK_INCONTROL_API')).toBe(true);
    expect(registry.isImplemented('PFSENSE_API')).toBe(true);
    expect(registry.isImplemented('CISCO_NETCONF_RESTCONF')).toBe(true);
    expect(registry.isImplemented('HUAWEI_NETCONF_RESTCONF')).toBe(true);
    expect(registry.isImplemented('JUNIPER_JUNOS_NETCONF')).toBe(true);
    expect(registry.isImplemented('ARUBA_AOS_CX_NETCONF')).toBe(true);
    expect(registry.isImplemented('OMADA_LOCAL_CONTROLLER_API')).toBe(true);
  });

  it('declares actual support scope and keeps hardware validation explicit', () => {
    const registry = new NetworkAdapterRegistry();

    expect(registry.get('MIKROTIK_REST')?.supportScope).toBe('ENFORCEMENT_AND_TELEMETRY');
    expect(registry.get('MERAKI_DASHBOARD_API')?.supportScope).toBe('ENFORCEMENT_AND_TELEMETRY');
    expect(registry.get('OMADA_CONTROLLER_API')?.supportScope).toBe('TELEMETRY_ONLY');
    expect(registry.get('GENERIC_HTTP')?.supportScope).toBe('GENERIC_TELEMETRY');
    for (const adapter of registry.list()) {
      expect(adapter.liveDeviceValidationRequired).toBe(true);
    }
  });

  it('normalizes protocol lookup and exposes capability truth', () => {
    const registry = new NetworkAdapterRegistry();

    expect(registry.get('mikrotik_rest')?.lifecycle).toBe('NATIVE');
    expect(registry.get('meraki_dashboard_api')?.lifecycle).toBe('NATIVE');
    expect(registry.get('unifi_network_api')?.lifecycle).toBe('NATIVE');
    expect(registry.get('openwrt_ubus')?.lifecycle).toBe('NATIVE');
    expect(registry.get('generic_http')?.lifecycle).toBe('GENERIC');
    expect(registry.supports('MERAKI_DASHBOARD_API', 'bandwidth_enforcement')).toBe(true);
    expect(registry.supports('MERAKI_DASHBOARD_API', 'disconnect_client')).toBe(false);
    expect(registry.supports('OMADA_CONTROLLER_API', 'client_sessions')).toBe(true);
    expect(registry.supports('CAMBIUM_CNMAESTRO', 'client_sessions')).toBe(true);
    expect(registry.supports('CAMBIUM_CNMAESTRO', 'bandwidth_enforcement')).toBe(false);
    expect(registry.supports('CAMBIUM_CNMAESTRO', 'disconnect_client')).toBe(false);
    expect(registry.supports('MIKROTIK_REST', 'disconnect_client')).toBe(true);
  });

  it('validates vendor endpoints before live connection attempts', () => {
    const registry = new NetworkAdapterRegistry();

    expect(registry.validateEndpoint('JUNIPER_JUNOS_NETCONF', 'https://router.example.test').endpointValid).toBe(true);
    expect(registry.validateEndpoint('JUNIPER_JUNOS_NETCONF', 'http://router.example.test').endpointValid).toBe(false);
    expect(registry.validateEndpoint('UNKNOWN_PROTOCOL', 'https://router.example.test').status).toBe('unsupported');
  });
});
