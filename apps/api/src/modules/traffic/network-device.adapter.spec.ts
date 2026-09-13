import { NetworkDeviceAdapterRegistry } from './network-device.adapter';

describe('NetworkDeviceAdapterRegistry', () => {
  const config = { get: jest.fn((key: string, fallback?: string) => ({
    JASLYN_NETWORK_API_TOKEN: 'token',
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

  it('normalizes generic controller JSON for non-MikroTik Wi-Fi equipment', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200, json: async () => ({ clients: [{ username: 'bob', ip: '10.0.0.3', mac: 'BB', rxBytes: '9007199254740992', txBytes: '42' }] }) });
    const registry = new NetworkDeviceAdapterRegistry(config, mikrotik);
    await expect(registry.readClients({ routerId: 'r2', protocol: 'UNIFI_NETWORK_API', controllerEndpoint: 'https://controller.example/clients' })).resolves.toEqual([
      { username: 'bob', address: '10.0.0.3', macAddress: 'BB', bytesIn: '9007199254740992', bytesOut: '42' },
    ]);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBeInstanceOf(URL);
  });

  it('rejects insecure generic controller endpoints by default', async () => {
    const registry = new NetworkDeviceAdapterRegistry(config, mikrotik);
    await expect(registry.readClients({ routerId: 'r3', protocol: 'OPENWRT_UBUS', controllerEndpoint: 'http://router.local/ubus' })).rejects.toThrow('must use HTTPS');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('fails closed for protocols without an implemented telemetry transport', async () => {
    const registry = new NetworkDeviceAdapterRegistry(config, mikrotik);
    await expect(registry.readClients({ routerId: 'r4', protocol: 'SNMP', endpoint: 'https://router.local' })).rejects.toThrow('SNMP telemetry is not enabled');
  });
});
