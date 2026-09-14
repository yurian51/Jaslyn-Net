import { ConfigService } from '@nestjs/config';
import { MerakiTrafficEnforcementAdapter } from './meraki.adapter';

jest.mock('node:dns/promises', () => ({ lookup: jest.fn().mockResolvedValue([{ address: '1.1.1.1' }]) }));

const fetchMock = jest.fn();

describe('MerakiTrafficEnforcementAdapter', () => {
  const config = {
    get: jest.fn((key: string, fallback?: string) => {
      const values: Record<string, string> = { JASLYN_NETWORK_API_TIMEOUT_MS: '5000', JASLYN_NETWORK_ALLOW_HTTP: 'false' };
      return values[key] ?? fallback;
    }),
  } as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('creates a deterministic bandwidth policy and assigns it to a client by MAC', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ groupPolicyId: '101' }), { status: 201 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    await new MerakiTrafficEnforcementAdapter(config).apply([{
      routerId: 'r1', customerId: 'c1', sessionId: 's1', targetMacAddress: 'AA:BB:CC:DD:EE:FF',
      apiEndpoint: 'https://api.meraki.com/api/v1/networks/N_123', protocol: 'MERAKI_DASHBOARD_API', maxDownloadMbps: 20, maxUploadMbps: 10, priority: 1,
    }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))).toEqual({ name: 'JASLYN-NET-20000D-10000U', bandwidth: { settings: 'custom', bandwidthLimits: { limitUp: 10000, limitDown: 20000 } } });
  });

  it('preserves an actively managed client when reconciliation only has its IP address', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([{ groupPolicyId: '101', name: 'JASLYN-NET-20000D-10000U' }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ clientId: 'client-active', mac: 'AA:BB:CC:DD:EE:FF', ip: '192.168.10.20', assigned: [{ groupPolicyId: '101' }] }, { clientId: 'client-stale', mac: '11:22:33:44:55:66', ip: '192.168.10.21', assigned: [{ groupPolicyId: '101' }] }]), { status: 200, headers: { link: '' } }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const cleared = await new MerakiTrafficEnforcementAdapter(config).reconcileManaged('https://api.meraki.com/api/v1/networks/N_123', ['192.168.10.20'], { apiKey: 'test-key' });
    expect(cleared).toBe(1);
    expect(String(fetchMock.mock.calls[2][0])).toContain('/clients/client-stale/policy');
  });

  it('follows Meraki pagination and fails closed if the safety page cap is reached', async () => {
    const next = '<https://api.meraki.com/api/v1/networks/N_123/policies/byClient?perPage=1000&startingAfter=next>; rel="next"';
    for (let page = 0; page < 100; page += 1) {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200, headers: { link: next } }));
    }
    await expect(new MerakiTrafficEnforcementAdapter(config).reconcileManaged('https://api.meraki.com/api/v1/networks/N_123', [], { apiKey: 'test-key' }))
      .rejects.toThrow('pagination exceeded 100 pages');
    expect(fetchMock).toHaveBeenCalledTimes(101);
  });

  it('clears only clients assigned to JASLYN-managed group policies', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([{ groupPolicyId: '101', name: 'JASLYN-NET-20000D-10000U' }, { groupPolicyId: '202', name: 'Customer-owned-policy' }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ clientId: 'client-1', mac: 'AA:BB:CC:DD:EE:FF', assigned: [{ groupPolicyId: '101' }] }, { clientId: 'client-2', mac: '11:22:33:44:55:66', assigned: [{ groupPolicyId: '202' }] }]), { status: 200, headers: { link: '' } }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const cleared = await new MerakiTrafficEnforcementAdapter(config).clearManaged('https://api.meraki.com/api/v1/networks/N_123', { apiKey: 'test-key' });
    expect(cleared).toBe(1);
  });

  it('refuses HTTP unless explicitly enabled', async () => {
    await expect(new MerakiTrafficEnforcementAdapter(config).apply([{ routerId: 'r1', customerId: 'c1', targetMacAddress: 'AA:BB:CC:DD:EE:FF', apiEndpoint: 'http://api.meraki.test/api/v1/networks/N_123', protocol: 'MERAKI_DASHBOARD_API', maxDownloadMbps: 20, maxUploadMbps: 10, priority: 1 }])).rejects.toThrow('must use HTTPS');
  });

  it('blocks localhost before issuing a network request', async () => {
    await expect(new MerakiTrafficEnforcementAdapter(config).apply([{ routerId: 'r1', customerId: 'c1', targetMacAddress: 'AA:BB:CC:DD:EE:FF', apiEndpoint: 'https://127.0.0.1/api/v1/networks/N_123', protocol: 'MERAKI_DASHBOARD_API', maxDownloadMbps: 20, maxUploadMbps: 10, priority: 1 }])).rejects.toThrow('blocked network address');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
