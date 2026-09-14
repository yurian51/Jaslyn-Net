import { MikrotikRestAdapter } from './mikrotik-rest.adapter';

describe('MikrotikRestAdapter', () => {
  const credentials = { username: 'admin', password: 'secret' };

  afterEach(() => jest.restoreAllMocks());

  it('creates a simple queue for a new client policy', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/rest/queue/simple?name=jaslyn-10.0.0.8')) {
        return new Response('[]', { status: 200 });
      }
      expect(url).toBe('https://router.example/rest/queue/simple');
      expect(init?.method).toBe('PUT');
      expect(init?.headers).toEqual(expect.objectContaining({ accept: 'application/json', 'content-type': 'application/json' }));
      expect(String(init?.body)).toContain('"max-limit":"512k/2048k"');
      return new Response('{".id":"*9"}', { status: 200 });
    });

    const result = await new MikrotikRestAdapter().enforcePolicy(
      'https://router.example', credentials, { ipAddress: '10.0.0.8' },
      { planId: 'plan-1', bandwidth: { uploadKbps: 512, downloadKbps: 2048 } },
    );

    expect(result).toEqual({ ok: true, action: 'created', remotePolicyId: '*9' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('updates an existing queue instead of creating a duplicate', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/rest/queue/simple?name=')) return new Response('[{".id":"*7"}]', { status: 200 });
      expect(url).toBe('https://router.example/rest/queue/simple/%2A7');
      expect(init?.method).toBe('PATCH');
      return new Response('', { status: 200 });
    });

    await expect(new MikrotikRestAdapter().enforcePolicy(
      'https://router.example', credentials, { ipAddress: '2001:db8::8' },
      { planId: 'plan-2', bandwidth: { uploadKbps: 256, downloadKbps: 1024 } },
    )).resolves.toEqual({ ok: true, action: 'updated', remotePolicyId: '*7' });
  });

  it('fails closed when bandwidth policy is empty', async () => {
    await expect(new MikrotikRestAdapter().enforcePolicy(
      'https://router.example', credentials, { ipAddress: '10.0.0.8' },
      { planId: 'plan-3', bandwidth: { uploadKbps: null, downloadKbps: null } },
    )).rejects.toMatchObject({ code: 'BANDWIDTH_POLICY_EMPTY' });
  });

  it('reports timeout as a stable error code', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));

    await expect(new MikrotikRestAdapter().health('https://router.example', credentials, 5))
      .resolves.toMatchObject({ ok: false, status: 'offline', code: 'TIMEOUT' });
  });
});
