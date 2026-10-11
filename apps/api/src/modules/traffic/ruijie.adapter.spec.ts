import { ConfigService } from '@nestjs/config';
import { RuijieReyeeNetworkAdapter } from './ruijie.adapter';

jest.mock('node:dns/promises', () => ({ lookup: jest.fn().mockResolvedValue([{ address: '8.8.8.8' }]) }));
const fetchMock = jest.fn();

describe('RuijieReyeeNetworkAdapter', () => {
  const config = { get: jest.fn((_key: string, fallback?: string) => fallback) } as unknown as ConfigService;
  beforeEach(() => { jest.clearAllMocks(); global.fetch = fetchMock as unknown as typeof fetch; });

  it('reads current client sessions with the configured group ID and API token', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: [{ userName: 'phone', ip: '192.0.2.20', mac: '11:22:33:44:55:66', flowUp: '1000', flowDown: 2000 }] }), { status: 200 }));
    const clients = await new RuijieReyeeNetworkAdapter(config).readClients({
      routerId: 'r-ruijie', protocol: 'RUIJIE_REYEE_CLOUD_API', controllerEndpoint: 'https://cloud.example.com',
      credentials: { accessToken: 'token-1', groupId: 'group-9' },
    });
    expect(clients).toEqual([{ username: 'phone', address: '192.0.2.20', macAddress: '11:22:33:44:55:66', bytesIn: '1000', bytesOut: '2000' }]);
    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestUrl.pathname).toBe('/service/api/open/v1/dev/user/current-user');
    expect(requestUrl.searchParams.get('group_id')).toBe('group-9');
    expect(requestUrl.searchParams.get('access_token')).toBe('token-1');
  });

  it('rejects application-level API errors', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ code: 401, msg: 'unauthorized' }), { status: 200 }));
    await expect(new RuijieReyeeNetworkAdapter(config).readClients({
      routerId: 'r-ruijie', protocol: 'RUIJIE_REYEE_CLOUD_API', controllerEndpoint: 'https://cloud.example.com',
      credentials: { accessToken: 'token-1', groupId: 'group-9' },
    })).rejects.toThrow('rejected the request');
  });
});
