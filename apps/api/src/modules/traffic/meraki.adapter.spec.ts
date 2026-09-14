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

  it('creates a deterministic bandwidth policy and assigns it to a client by MAC', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ groupPolicyId: '101' }), { status: 201 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const adapter = new MerakiTrafficEnforcementAdapter(config);

    await adapter.apply([{
      routerId: 'r1', customerId: 'c1', sessionId: 's1', targetMacAddress: 'AA:BB:CC:DD:EE:FF',
      apiEndpoint: 'https://api.meraki.com/api/v1/networks/N_123', protocol: 'MERAKI_DASHBOARD_API',
      maxDownloadMbps: 20, maxUploadMbps: 10, priority: 1,
    }]);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [createUrl, createInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(createUrl).toBe('https://api.meraki.com/api/v1/networks/N_123/groupPolicies');
    expect(JSON.parse(String(createInit.body))).toEqual({
      name: 'JASLYN-NET-20000D-10000U',
      bandwidth: { settings: 'custom', bandwidthLimits: { limitUp: 10000, limitDown: 20000 } },
    });
    const [assignUrl, assignInit] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(assignUrl).toBe('https://api.meraki.com/api/v1/networks/N_123/clients/AA%3ABB%3ACC%3ADD%3AEE%3AFF/policy');
    expect(JSON.parse(String(assignInit.body))).toEqual({ devicePolicy: 'Group policy', groupPolicyId: '101' });
  });

  it('preserves an actively managed client when reconciliation only has its IP address', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify([{ groupPolicyId: '101', name: 'JASLYN-NET-20000D-10000U' }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { clientId: 'client-active', mac: 'AA:BB:CC:DD:EE:FF', ip: '192.168.10.20', assigned: [{ groupPolicyId: '101' }] },
        { clientId: 'client-stale', mac: '11:22:33:44:55:66', ip: '192.168.10.21', assigned: [{ groupPolicyId: '101' }] },
      ]), { status: 200, headers: { link: '' } }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const adapter = new MerakiTrafficEnforcementAdapter(config);
    const cleared = await adapter.reconcileManaged(
      'https://api.meraki.com/api/v1/networks/N_123',
      ['192.168.10.20'],
      { apiKey: 'test-key' },
    );

    expect(cleared).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[2][0])).toContain('/clients/client-stale/policy');
  });

  it('clears only clients assigned to JASLYN-managed group policies', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { groupPolicyId: '101', name: 'JASLYN-NET-20000D-10000U' },
        { groupPolicyId: '202', name: 'Customer-owned-policy' },
      ]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { clientId: 'client-1', mac: 'AA:BB:CC:DD:EE:FF', assigned: [{ groupPolicyId: '101' }] },
        { clientId: 'client-2', mac: '11:22:33:44:55:66', assigned: [{ groupPolicyId: '202' }] },
      ]), { status: 200, headers: { link: '' } }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const adapter = new MerakiTrafficEnforcementAdapter(config);
    const cleared = await adapter.clearManaged('https://api.meraki.com/api/v1/networks/N_123', { apiKey: 'test-key' });

    expect(cleared).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[2][0])).toContain('/clients/client-1/policy');
    expect(JSON.parse(String((fetchMock.mock.calls[2][1] as RequestInit).body))).toEqual({ devicePolicy: 'Normal' });
  });

  it('refuses HTTP unless explicitly enabled', async () => {
    const adapter = new MerakiTrafficEnforcementAdapter(config);
    await expect(adapter.apply([{
      routerId: 'r1', customerId: 'c1', targetMacAddress: 'AA:BB:CC:DD:EE:FF',
      apiEndpoint: 'http://api.meraki.test/api/v1/networks/N_123', protocol: 'MERAKI_DASHBOARD_API',
      maxDownloadMbps: 20, maxUploadMbps: 10, priority: 1,
    }])).rejects.toThrow('must use HTTPS');
  });
});
