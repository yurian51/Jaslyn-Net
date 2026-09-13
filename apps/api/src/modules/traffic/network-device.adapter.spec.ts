import { NetworkDeviceAdapterRegistry } from './network-device.adapter';
import { MikroTikTrafficEnforcementAdapter } from './mikrotik.adapter';
import { ConfigService } from '@nestjs/config';

describe('NetworkDeviceAdapterRegistry', () => {
  const configValues: Record<string, string> = {
    JASLYN_NETWORK_API_TOKEN: 'token', JASLYN_UNIFI_API_KEY: 'unifi-key', JASLYN_MERAKI_API_KEY: 'meraki-key',
    JASLYN_NETWORK_API_TIMEOUT_MS: '5000', JASLYN_NETWORK_ALLOW_HTTP: 'false',
  };
  const config = { get: jest.fn((key: string, fallback?: string) => configValues[key] ?? fallback) } as unknown as ConfigService;
  const mikrotik = { readHotspotActive: jest.fn() } as unknown as jest.Mocked<Pick<MikroTikTrafficEnforcementAdapter, 'readHotspotActive'>>;

  beforeEach(() => { mikrotik.readHotspotActive.mockReset(); global.fetch = jest.fn() as unknown as typeof fetch; });

  it('normalizes MikroTik clients through the common interface', async () => {
    mikrotik.readHotspotActive.mockResolvedValue([{ user: 'alice', address: '10.0.0.2', 'mac-address': 'AA', 'bytes-in': '100', 'bytes-out': '200' }]);
    const registry = new NetworkDeviceAdapterRegistry(config, mikrotik as unknown as MikroTikTrafficEnforcementAdapter);
    await expect(registry.readClients({ routerId: 'r1', protocol: 'MIKROTIK_REST', endpoint: 'https://router/rest' })).resolves.toEqual([{ username: 'alice', address: '10.0.0.2', macAddress: 'AA', bytesIn: '100', bytesOut: '200' }]);
  });

  it('reads connected UniFi clients through the official site/client API shape', async () => {
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'site-1', name: 'Main' }] }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ name: 'bob', ipAddress: '10.0.0.3', macAddress: 'BB', rxBytes: '9007199254740992', txBytes: '42' }] }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const registry = new NetworkDeviceAdapterRegistry(config, mikrotik as unknown as MikroTikTrafficEnforcementAdapter);
    await expect(registry.readClients({ routerId: 'r2', protocol: 'UNIFI_NETWORK_API', controllerEndpoint: 'https://1.1.1.1/v1' })).resolves.toEqual([{ username: 'bob', address: '10.0.0.3', macAddress: 'BB', bytesIn: '9007199254740992', bytesOut: '42' }]);
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ 'X-API-Key': 'unifi-key' });
  });

  it('reads Meraki clients and nested usage counters', async () => {
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    fetchMock.mockResolvedValue(new Response(JSON.stringify([{ description: 'phone', ip: '10.0.0.4', mac: 'CC', usage: { recv: 1000, sent: 2000 } }]), { status: 200, headers: { 'content-type': 'application/json' } }));
    const registry = new NetworkDeviceAdapterRegistry(config, mikrotik as unknown as MikroTikTrafficEnforcementAdapter);
    await expect(registry.readClients({ routerId: 'r3', protocol: 'MERAKI_DASHBOARD_API', capabilities: { networkId: 'N_123' } })).resolves.toEqual([{ username: 'phone', address: '10.0.0.4', macAddress: 'CC', bytesIn: '1000', bytesOut: '2000' }]);
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ 'X-Cisco-Meraki-API-Key': 'meraki-key' });
  });

  it('reads OpenWrt clients through ubus session login, iwinfo devices and assoclist', async () => {
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ result: [0, { ubus_rpc_session: 'sid-123' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: [0, { devices: ['wlan0'] }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: [0, { results: [{ mac: 'AA:BB:CC:DD:EE:FF', rx_bytes: '9007199254740992', tx_bytes: '42' }] }] }), { status: 200 }));
    const registry = new NetworkDeviceAdapterRegistry(config, mikrotik as unknown as MikroTikTrafficEnforcementAdapter);
    await expect(registry.readClients({ routerId: 'r4', protocol: 'OPENWRT_UBUS', endpoint: 'https://1.1.1.1', credentials: { username: 'root', password: 'secret' } })).resolves.toEqual([{ macAddress: 'AA:BB:CC:DD:EE:FF', bytesIn: '9007199254740992', bytesOut: '42' }]);
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain('root');
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({ Accept: 'application/json' });
  });

  it('normalizes generic controller JSON for supported non-native adapters', async () => {
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ clients: [{ username: 'dave', ip: '10.0.0.5', mac: 'DD', rxBytes: '9007199254740992', txBytes: '42' }] }), { status: 200 }));
    const registry = new NetworkDeviceAdapterRegistry(config, mikrotik as unknown as MikroTikTrafficEnforcementAdapter);
    await expect(registry.readClients({ routerId: 'r5', protocol: 'GENERIC_HTTP', controllerEndpoint: 'https://1.1.1.1/clients' })).resolves.toEqual([{ username: 'dave', address: '10.0.0.5', macAddress: 'DD', bytesIn: '9007199254740992', bytesOut: '42' }]);
  });

  it('rejects insecure controller endpoints by default', async () => {
    const registry = new NetworkDeviceAdapterRegistry(config, mikrotik as unknown as MikroTikTrafficEnforcementAdapter);
    await expect(registry.readClients({ routerId: 'r6', protocol: 'OPENWRT_UBUS', controllerEndpoint: 'http://router.local/ubus', credentials: { username: 'root', password: 'secret' } })).rejects.toThrow('must use HTTPS');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('blocks loopback, link-local and credential-bearing endpoints', async () => {
    const registry = new NetworkDeviceAdapterRegistry(config, mikrotik as unknown as MikroTikTrafficEnforcementAdapter);
    await expect(registry.readClients({ routerId: 'r8', protocol: 'GENERIC_HTTP', endpoint: 'https://127.0.0.1/internal' })).rejects.toThrow('restricted address');
    await expect(registry.readClients({ routerId: 'r9', protocol: 'GENERIC_HTTP', endpoint: 'https://169.254.169.254/latest' })).rejects.toThrow('restricted address');
    await expect(registry.readClients({ routerId: 'r10', protocol: 'GENERIC_HTTP', endpoint: 'https://user:password@1.1.1.1/api' })).rejects.toThrow('embedded credentials');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('fails closed for protocols without an implemented native telemetry transport', async () => {
    const registry = new NetworkDeviceAdapterRegistry(config, mikrotik as unknown as MikroTikTrafficEnforcementAdapter);
    await expect(registry.readClients({ routerId: 'r7', protocol: 'SNMP', endpoint: 'https://1.1.1.1' })).rejects.toThrow('SNMP telemetry requires');
  });
});
