import { NetworkDeviceAdapterRegistry } from './network-device.adapter';

describe('NetworkDeviceAdapterRegistry', () => {
  const config = { get: jest.fn((key: string, fallback?: string) => ({
    JASLYN_NETWORK_API_TOKEN: 'token',
    JASLYN_UNIFI_API_KEY: 'unifi-key',
    JASLYN_MERAKI_API_KEY: 'meraki-key',
    JASLYN_NETWORK_API_TIMEOUT_MS: '5000',
    JASLYN_NETWORK_ALLOW_HTTP: 'false',
  } as Record<string, string>)[key] ?? fallback) } as any;
  const mikrotik = { readHotspotActive: jest.fn() } as any;

  beforeEach(() => {
    mikrotik.readHotspotActive.mockReset();
    global.fetch = jest.fn() as any;
  });

  it('normalizes MikroTik clients through the common interface', async () => {
    mikrotik.readHotspotActive.mockResolvedValue([{ user: 'alice', address: '10.0.0.2', 'mac-address': 'AA', 'bytes-in': '100', 'bytes-out': '200' }]);
    const registry = new NetworkDeviceAdapterRegistry(config, mikrotik);
    await expect(registry.readClients({ routerId: 'r1', protocol: 'MIKROTIK_REST', endpoint: 'https://router/rest' })).resolves.toEqual([
      { username: 'alice', address: '10.0.0.2', macAddress: 'AA', bytesIn: '100', bytesOut: '200' },
    ]);
  });

  it('reads connected UniFi clients through the official site/client API shape', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: [{ id: 'site-1', name: 'Main' }] }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: [{ name: 'bob', ipAddress: '10.0.0.3', macAddress: 'BB', rxBytes: '9007199254740992', txBytes: '42' }] }) });
    const registry = new NetworkDeviceAdapterRegistry(config, mikrotik);
    await expect(registry.readClients({ routerId: 'r2', protocol: 'UNIFI_NETWORK_API', controllerEndpoint: 'https://api.ui.com/v1' })).resolves.toEqual([
      { username: 'bob', address: '10.0.0.3', macAddress: 'BB', bytesIn: '9007199254740992', bytesOut: '42' },
    ]);
    expect((global.fetch as jest.Mock).mock.calls[0][1].headers['X-API-Key']).toBe('unifi-key');
    expect((global.fetch as jest.Mock).mock.calls[1][0].toString()).toContain('/sites/site-1/clients');
  });

  it('reads Meraki clients using networkId and the official dashboard API authentication', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ description: 'phone', ip: '10.0.0.4', mac: 'CC', usage: { recv: 1000, sent: 2000 } }],
    });
    const registry = new NetworkDeviceAdapterRegistry(config, mikrotik);
    await expect(registry.readClients({
      routerId: 'r3',
      protocol: 'MERAKI_DASHBOARD_API',
      capabilities: { networkId: 'N_123' },
    })).resolves.toEqual([
      { username: 'phone', address: '10.0.0.4', macAddress: 'CC', bytesIn: '0', bytesOut: '0' },
    ]);
    expect((global.fetch as jest.Mock).mock.calls[0][1].headers['X-Cisco-Meraki-API-Key']).toBe('meraki-key');
  });

  it('normalizes generic controller JSON for supported non-native adapters', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200, json: async () => ({ clients: [{ username: 'dave', ip: '10.0.0.5', mac: 'DD', rxBytes: '9007199254740992', txBytes: '42' }] }) });
    const registry = new NetworkDeviceAdapterRegistry(config, mikrotik);
    await expect(registry.readClients({ routerId: 'r4', protocol: 'GENERIC_HTTP', controllerEndpoint: 'https://controller.example/clients' })).resolves.toEqual([
      { username: 'dave', address: '10.0.0.5', macAddress: 'DD', bytesIn: '9007199254740992', bytesOut: '42' },
    ]);
  });

  it('rejects insecure generic controller endpoints by default', async () => {
    const registry = new NetworkDeviceAdapterRegistry(config, mikrotik);
    await expect(registry.readClients({ routerId: 'r5', protocol: 'OPENWRT_UBUS', controllerEndpoint: 'http://router.local/ubus' })).rejects.toThrow('must use HTTPS');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('fails closed for protocols without an implemented native telemetry transport', async () => {
    const registry = new NetworkDeviceAdapterRegistry(config, mikrotik);
    await expect(registry.readClients({ routerId: 'r6', protocol: 'SNMP', endpoint: 'https://router.local' })).rejects.toThrow('SNMP telemetry requires');
  });
});
