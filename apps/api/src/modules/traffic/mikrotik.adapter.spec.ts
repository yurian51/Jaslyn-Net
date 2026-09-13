import { MikroTikTrafficEnforcementAdapter } from './mikrotik.adapter';

function response(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('MikroTikTrafficEnforcementAdapter', () => {
  const fetchMock = jest.fn();
  const config = {
    get: jest.fn((key: string, fallback?: unknown) => ({
      JASLYN_ROUTER_API_USERNAME: 'jaslyn',
      JASLYN_ROUTER_API_PASSWORD: 'secret',
      JASLYN_ROUTER_API_TIMEOUT_MS: '5000',
      JASLYN_ROUTER_API_ALLOW_HTTP: 'false',
    } as Record<string, unknown>)[key] ?? fallback),
  } as any;

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as any;
  });

  it('creates a RouterOS simple queue when no managed queue exists', async () => {
    fetchMock
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response({}));

    const adapter = new MikroTikTrafficEnforcementAdapter(config);
    await adapter.apply([{
      routerId: 'router-1', customerId: 'customer-1', sessionId: 'session-1',
      targetAddress: '192.168.1.20', apiEndpoint: 'https://192.168.1.1/rest',
      maxDownloadMbps: 8, maxUploadMbps: 4, priority: 2,
    }]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('https://192.168.1.1/rest/queue/simple/print');
    expect(fetchMock.mock.calls[1][0]).toBe('https://192.168.1.1/rest/queue/simple');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      name: 'JASLYN-session-1',
      target: '192.168.1.20/32',
      'max-limit': '4M/8M',
      priority: '2',
    });
  });

  it('patches an existing managed queue', async () => {
    fetchMock
      .mockResolvedValueOnce(response([{ '.id': '*7', name: 'JASLYN-session-1' }]))
      .mockResolvedValueOnce(response({}));

    const adapter = new MikroTikTrafficEnforcementAdapter(config);
    await adapter.apply([{
      routerId: 'router-1', customerId: 'customer-1', sessionId: 'session-1',
      targetAddress: '2001:db8::20', apiEndpoint: 'https://192.168.1.1/rest',
      maxDownloadMbps: 12, maxUploadMbps: 6, priority: 1,
    }]);

    expect(fetchMock.mock.calls[1][0]).toBe('https://192.168.1.1/rest/queue/simple/%2A7');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).target).toBe('2001:db8::20/128');
  });

  it('rejects insecure router endpoints unless explicitly enabled', async () => {
    const adapter = new MikroTikTrafficEnforcementAdapter(config);
    await expect(adapter.apply([{
      routerId: 'router-1', customerId: 'customer-1', sessionId: 'session-1',
      targetAddress: '192.168.1.20', apiEndpoint: 'http://192.168.1.1',
      maxDownloadMbps: 8, maxUploadMbps: 4, priority: 1,
    }])).rejects.toThrow('Router API must use HTTPS in production');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
