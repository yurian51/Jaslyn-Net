import { ConfigService } from '@nestjs/config';
import {
  ArubaCentralNetworkAdapter,
  CambiumCnMaestroNetworkAdapter,
  GrandstreamGwnNetworkAdapter,
  PeplinkInControlNetworkAdapter,
  PfSenseOpnSenseNetworkAdapter,
  RuckusSmartZoneNetworkAdapter,
  TeltonikaRmsNetworkAdapter,
} from './additional-vendor.adapters';

jest.mock('node:dns/promises', () => ({ lookup: jest.fn().mockResolvedValue([{ address: '8.8.8.8' }]) }));
const fetchMock = jest.fn();

describe('additional vendor read-only telemetry adapters', () => {
  const config = { get: jest.fn((_key: string, fallback?: string) => fallback) } as unknown as ConfigService;
  beforeEach(() => { jest.clearAllMocks(); global.fetch = fetchMock as unknown as typeof fetch; });

  const response = { data: [{ name: 'client-1', ipAddress: '192.0.2.10', macAddress: 'AA:BB:CC:DD:EE:FF', rxBytes: '1234', txBytes: '5678' }] };
  const connection = (protocol: string, credentials: Record<string, string>) => ({
    routerId: 'router-1', protocol, controllerEndpoint: 'https://api.vendor.example/documented/client-session-resource', credentials,
  });

  it.each([
    ['Aruba Central', ArubaCentralNetworkAdapter, 'ARUBA_CENTRAL_API', { accessToken: 'token' }, { Authorization: 'Bearer token' }],
    ['Cambium cnMaestro', CambiumCnMaestroNetworkAdapter, 'CAMBIUM_CNMAESTRO', { accessToken: 'token' }, { Authorization: 'Bearer token' }],
    ['Grandstream GWN', GrandstreamGwnNetworkAdapter, 'GRANDSTREAM_GWN_API', { accessToken: 'token' }, { Authorization: 'Bearer token' }],
    ['Ruckus SmartZone', RuckusSmartZoneNetworkAdapter, 'RUCKUS_SMARTZONE_API', { accessToken: 'token' }, { Authorization: 'Bearer token' }],
    ['Teltonika RMS', TeltonikaRmsNetworkAdapter, 'TELTONIKA_RMS_API', { accessToken: 'token' }, { Authorization: 'Bearer token' }],
    ['Peplink InControl', PeplinkInControlNetworkAdapter, 'PEPLINK_INCONTROL_API', { accessToken: 'token' }, { Authorization: 'Bearer token' }],
    ['pfSense/OPNsense', PfSenseOpnSenseNetworkAdapter, 'PFSENSE_API', { apiKey: 'api-key', clientSecret: 'api-secret' }, { Authorization: `Basic ${Buffer.from('api-key:api-secret').toString('base64')}` }],
  ])('%s sends its expected auth and normalizes client counters', async (_name, Adapter, protocol, credentials, expectedHeaders) => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(response), { status: 200, headers: { 'content-type': 'application/json' } }));
    const adapter = new Adapter(config);
    await expect(adapter.readClients(connection(protocol, credentials))).resolves.toEqual([{
      username: 'client-1', address: '192.0.2.10', macAddress: 'AA:BB:CC:DD:EE:FF', bytesIn: '1234', bytesOut: '5678',
    }]);
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject(expectedHeaders);
  });

  it('rejects missing credentials before making a request', async () => {
    await expect(new ArubaCentralNetworkAdapter(config).readClients(connection('ARUBA_CENTRAL_API', {}))).rejects.toThrow('requires a per-device encrypted');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects insecure endpoints before making a request', async () => {
    await expect(new TeltonikaRmsNetworkAdapter(config).readClients({
      ...connection('TELTONIKA_RMS_API', { accessToken: 'token' }), controllerEndpoint: 'http://api.vendor.example/clients',
    })).rejects.toThrow('must be HTTPS');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
