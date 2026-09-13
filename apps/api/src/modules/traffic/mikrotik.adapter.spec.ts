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
      .mockResolvedValueOnce(response([{ '.id': '*7', name: 'JASLYN-session-1', comment: 'JASLYN NET traffic fairness' }]))
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

  it('does not patch an unrelated queue with the same name', async () => {
    fetchMock
      .mockResolvedValueOnce(response([{ '.id': '*9', name: 'JASLYN-session-1', comment: 'operator-managed' }]))
      .mockResolvedValueOnce(response({}));

    const adapter = new MikroTikTrafficEnforcementAdapter(config);
    await adapter.apply([{
      routerId: 'router-1', customerId: 'customer-1', sessionId: 'session-1',
      targetAddress: '192.168.1.20', apiEndpoint: 'https://192.168.1.1/rest',
      maxDownloadMbps: 8, maxUploadMbps: 4, priority: 1,
    }]);

    expect(fetchMock.mock.calls[1][0]).toBe('https://192.168.1.1/rest/queue/simple');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).comment).toBe('JASLYN NET traffic fairness');
  });

  it('clears only JASLYN-managed queues', async () => {
    fetchMock
      .mockResolvedValueOnce(response([
        { '.id': '*1', name: 'JASLYN-session-1', comment: 'JASLYN NET traffic fairness' },
        { '.id': '*2', name: 'operator-queue', comment: 'JASLYN NET traffic fairness' },
        { '.id': '*3', name: 'JASLYN-session-2', comment: 'operator-managed' },
      ]))
      .mockResolvedValueOnce(response({}));

    const adapter = new MikroTikTrafficEnforcementAdapter(config);
    await expect(adapter.clearManaged('https://192.168.1.1/rest')).resolves.toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe('https://192.168.1.1/rest/queue/simple/%2A1');
  });

  it('reconciles stale managed queues without touching kept or operator queues', async () => {
    fetchMock
      .mockResolvedValueOnce(response([
        { '.id': '*1', name: 'JASLYN-session-keep', comment: 'JASLYN NET traffic fairness' },
        { '.id': '*2', name: 'JASLYN-session-stale', comment: 'JASLYN NET traffic fairness' },
        { '.id': '*3', name: 'JASLYN-session-operator', comment: 'operator-managed' },
        { '.id': '*4', name: 'operator-queue', comment: 'JASLYN NET traffic fairness' },
      ]))
      .mockResolvedValueOnce(response({}));

    const adapter = new MikroTikTrafficEnforcementAdapter(config);
    await expect(adapter.reconcileManaged('https://192.168.1.1/rest', ['JASLYN-session-keep'])).resolves.toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe('https://192.168.1.1/rest/queue/simple/%2A2');
  });

  it('reads hotspot active counters through the RouterOS REST API', async () => {
    fetchMock.mockResolvedValueOnce(response([{
      user: 'alice', address: '192.168.1.20', 'mac-address': 'AA:BB:CC:DD:EE:FF',
      'bytes-in': '9007199254740992000', 'bytes-out': '1234567890123456789',
    }]));

    const adapter = new MikroTikTrafficEnforcementAdapter(config);
    await expect(adapter.readHotspotActive('https://192.168.1.1')).resolves.toEqual([expect.objectContaining({ user: 'alice', 'bytes-in': '9007199254740992000' })]);
    expect(fetchMock.mock.calls[0][0]).toBe('https://192.168.1.1/rest/ip/hotspot/active/print');
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
