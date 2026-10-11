import { ConfigService } from '@nestjs/config';
import { OmadaNetworkAdapter } from './omada.adapter';

jest.mock('node:dns/promises', () => ({ lookup: jest.fn().mockResolvedValue([{ address: '8.8.8.8' }]) }));
const fetchMock = jest.fn();

describe('OmadaNetworkAdapter', () => {
  const config = { get: jest.fn((_key: string, fallback?: string) => fallback) } as unknown as ConfigService;
  beforeEach(() => { jest.clearAllMocks(); global.fetch = fetchMock as unknown as typeof fetch; });

  it('obtains an OAuth token and reads normalized client telemetry', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ errorCode: 0, result: { accessToken: 'token-1' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ errorCode: 0, result: { data: [{ name: 'laptop', ip: '192.0.2.10', mac: 'AA:BB:CC:DD:EE:FF', uploadBytes: 123, downloadBytes: '456' }], totalPages: 1 } }), { status: 200 }));
    const adapter = new OmadaNetworkAdapter(config);
    const clients = await adapter.readClients({
      routerId: 'r-omada', protocol: 'OMADA_CONTROLLER_API', controllerEndpoint: 'https://omada.example.com',
      credentials: { clientId: 'client', clientSecret: 'secret', omadacId: 'controller-1', siteId: 'site-1' },
    });
    expect(clients).toEqual([{ username: 'laptop', address: '192.0.2.10', macAddress: 'AA:BB:CC:DD:EE:FF', bytesIn: '123', bytesOut: '456' }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain('/openapi/v1/controller-1/sites/site-1/clients?page=1&pageSize=100');
    expect((fetchMock.mock.calls[1][1] as RequestInit).headers).toMatchObject({ Authorization: 'AccessToken=token-1' });
  });

  it('fails closed when the controller returns an application-level error', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ errorCode: 0, result: { accessToken: 'token-1' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ errorCode: -1, msg: 'General error' }), { status: 200 }));
    await expect(new OmadaNetworkAdapter(config).readClients({
      routerId: 'r-omada', protocol: 'OMADA_CONTROLLER_API', controllerEndpoint: 'https://omada.example.com',
      credentials: { clientId: 'client', clientSecret: 'secret', omadacId: 'controller-1', siteId: 'site-1' },
    })).rejects.toThrow('application error');
  });

  it('rejects an insecure controller URL before network access', async () => {
    await expect(new OmadaNetworkAdapter(config).readClients({
      routerId: 'r-omada', protocol: 'OMADA_CONTROLLER_API', controllerEndpoint: 'http://omada.example.com',
      credentials: { clientId: 'client', clientSecret: 'secret', omadacId: 'controller-1', siteId: 'site-1' },
    })).rejects.toThrow('must be HTTPS');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
