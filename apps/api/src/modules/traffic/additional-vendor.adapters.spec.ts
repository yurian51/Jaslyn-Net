import { ConfigService } from '@nestjs/config';
import type { NetworkDeviceConnection } from './network-device.adapter';
import type { NetworkCredentials } from '../../common/secure-network-credentials';
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
  const connection = (protocol: NetworkDeviceConnection['protocol'], credentials: NetworkCredentials): NetworkDeviceConnection => ({
    routerId: 'router-1', protocol, controllerEndpoint: 'https://api.vendor.example/documented/client-session-resource', credentials,
  });

  const adapterCases: Array<[string, new (config: ConfigService) => { readClients(connection: NetworkDeviceConnection): Promise<unknown> }, NetworkDeviceConnection['protocol'], NetworkCredentials, Record<string, string>]> = [
    ['Aruba Central', ArubaCentralNetworkAdapter, 'ARUBA_CENTRAL_API', { accessToken: 'token' }, { Authorization: 'Bearer token' }],
    ['Grandstream GWN', GrandstreamGwnNetworkAdapter, 'GRANDSTREAM_GWN_API', { accessToken: 'token' }, { Authorization: 'Bearer token' }],
    ['Ruckus SmartZone', RuckusSmartZoneNetworkAdapter, 'RUCKUS_SMARTZONE_API', { accessToken: 'token' }, { Authorization: 'Bearer token' }],
    ['Teltonika RMS', TeltonikaRmsNetworkAdapter, 'TELTONIKA_RMS_API', { accessToken: 'token' }, { Authorization: 'Bearer token' }],
    ['Peplink InControl', PeplinkInControlNetworkAdapter, 'PEPLINK_INCONTROL_API', { accessToken: 'token' }, { Authorization: 'Bearer token' }],
    ['pfSense/OPNsense', PfSenseOpnSenseNetworkAdapter, 'PFSENSE_API', { apiKey: 'api-key', clientSecret: 'api-secret' }, { Authorization: `Basic ${Buffer.from('api-key:api-secret').toString('base64')}` }],
  ];

  it.each(adapterCases)('%s sends its expected auth and normalizes client counters', async (_name, Adapter, protocol, credentials, expectedHeaders) => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(response), { status: 200, headers: { 'content-type': 'application/json' } }));
    const adapter = new Adapter(config);
    await expect(adapter.readClients(connection(protocol, credentials))).resolves.toEqual([{
      username: 'client-1', address: '192.0.2.10', macAddress: 'AA:BB:CC:DD:EE:FF', bytesIn: '1234', bytesOut: '5678',
    }]);
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject(expectedHeaders);
  });


  it('obtains a cnMaestro OAuth client-credentials token before reading sessions', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'short-lived-token', token_type: 'bearer', expires_in: 3600 }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(response), { status: 200, headers: { 'content-type': 'application/json' } }));
    const cambiumConnection: NetworkDeviceConnection = {
      ...connection('CAMBIUM_CNMAESTRO', { clientId: 'cnm-client', clientSecret: 'cnm-secret' }),
      capabilities: { tokenEndpoint: 'https://api.vendor.example/api/v2/access/token' },
    };
    await expect(new CambiumCnMaestroNetworkAdapter(config).readClients(cambiumConnection)).resolves.toEqual([{
      username: 'client-1', address: '192.0.2.10', macAddress: 'AA:BB:CC:DD:EE:FF', bytesIn: '1234', bytesOut: '5678',
    }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from('cnm-client:cnm-secret').toString('base64')}`,
      },
      body: 'grant_type=client_credentials',
    });
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({ Authorization: 'Bearer short-lived-token' });
    expect(String(fetchMock.mock.calls[0][1]?.body)).not.toContain('cnm-secret');
  });

  it('fails closed when cnMaestro OAuth configuration is incomplete', async () => {
    await expect(new CambiumCnMaestroNetworkAdapter(config).readClients(
      connection('CAMBIUM_CNMAESTRO', { accessToken: 'manually-configured-token' }),
    )).rejects.toThrow('requires encrypted clientId/clientSecret');
    expect(fetchMock).not.toHaveBeenCalled();
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
