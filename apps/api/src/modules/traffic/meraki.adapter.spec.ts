import { ConfigService } from '@nestjs/config';
import { MerakiTrafficEnforcementAdapter } from './meraki.adapter';

const fetchMock = jest.fn();

describe('MerakiTrafficEnforcementAdapter', () => {
  const config = {
    get: jest.fn((key: string, fallback?: string) => {
      const values: Record<string, string> = {
        JASLYN_NETWORK_API_TIMEOUT_MS: '5000',
        JASLYN_NETWORK_ALLOW_HTTP: 'false',
      };
      return values[key] ?? fallback;
    }),
  } as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('assigns the configured Meraki group policy to a client by MAC', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const adapter = new MerakiTrafficEnforcementAdapter(config);

    await adapter.apply([{
      routerId: 'r1', customerId: 'c1', sessionId: 's1', targetMacAddress: 'AA:BB:CC:DD:EE:FF',
      apiEndpoint: 'https://api.meraki.com/api/v1/networks/N_123', protocol: 'MERAKI_DASHBOARD_API',
      merakiGroupPolicyId: '101', maxDownloadMbps: 20, maxUploadMbps: 10, priority: 1,
    }]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.meraki.com/api/v1/networks/N_123/clients/AA%3ABB%3ACC%3ADD%3AEE%3AFF/policy');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({ devicePolicy: 'Group policy', groupPolicyId: '101' });
  });

  it('clears only clients currently assigned to the configured managed group policy', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { clientId: 'client-1', assigned: [{ type: 'group', groupPolicyId: '101' }] },
        { clientId: 'client-2', assigned: [{ type: 'group', groupPolicyId: '202' }] },
      ]), { status: 200, headers: { link: '' } }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const adapter = new MerakiTrafficEnforcementAdapter(config);
    await adapter.clearManaged('https://api.meraki.com/api/v1/networks/N_123?networkId=N_123', {
      apiKey: 'test-key',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain('/clients/client-1/policy');
    expect(JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))).toEqual({ devicePolicy: 'Normal' });
  });

  it('refuses HTTP unless explicitly enabled', async () => {
    const adapter = new MerakiTrafficEnforcementAdapter(config);
    await expect(adapter.apply([{
      routerId: 'r1', customerId: 'c1', targetMacAddress: 'AA:BB:CC:DD:EE:FF',
      apiEndpoint: 'http://api.meraki.test/api/v1/networks/N_123', protocol: 'MERAKI_DASHBOARD_API',
      merakiGroupPolicyId: '101', maxDownloadMbps: 20, maxUploadMbps: 10, priority: 1,
    }])).rejects.toThrow('must use HTTPS');
  });
});
