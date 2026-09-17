import { MikrotikRestAdapter } from './mikrotik-rest.adapter';

describe('MikrotikRestAdapter', () => {
  const credentials = { username: 'admin', password: 'secret' };

  afterEach(() => jest.restoreAllMocks());

  it('creates a simple queue and verifies the remote policy', async () => {
    let queue: Record<string, unknown> | null = null;
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/rest/queue/simple?name=jaslyn-10.0.0.8')) return new Response(queue ? JSON.stringify([queue]) : '[]', { status: 200 });
      expect(url).toBe('https://router.example/rest/queue/simple');
      expect(init?.method).toBe('PUT');
      expect(init?.headers).toEqual(expect.objectContaining({ accept: 'application/json', 'content-type': 'application/json' }));
      expect(String(init?.body)).toContain('"max-limit":"512k/2048k"');
      queue = { '.id': '*9', name: 'jaslyn-10.0.0.8', target: '10.0.0.8/32', 'max-limit': '512k/2048k' };
      return new Response('{".id":"*9"}', { status: 200 });
    });
    const result = await new MikrotikRestAdapter().enforcePolicy('https://router.example', credentials, { ipAddress: '10.0.0.8' }, { planId: 'plan-1', bandwidth: { uploadKbps: 512, downloadKbps: 2048 } });
    expect(result).toMatchObject({ ok: true, verified: true, action: 'created', remotePolicyId: '*9', verification: { verified: true } });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('updates an existing queue and verifies the new policy', async () => {
    let queue: Record<string, unknown> = { '.id': '*7', name: 'jaslyn-2001-db8-8', target: '2001:db8::8/128', 'max-limit': '256k/1024k' };
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/rest/queue/simple?name=')) return new Response(JSON.stringify([queue]), { status: 200 });
      expect(url).toBe('https://router.example/rest/queue/simple/*7');
      expect(init?.method).toBe('PATCH');
      queue = { ...queue, 'max-limit': '256k/1024k' };
      return new Response('', { status: 200 });
    });
    await expect(new MikrotikRestAdapter().enforcePolicy('https://router.example', credentials, { ipAddress: '2001:db8::8' }, { planId: 'plan-2', bandwidth: { uploadKbps: 256, downloadKbps: 1024 } })).resolves.toMatchObject({ ok: true, verified: true, action: 'updated', remotePolicyId: '*7', verification: { verified: true } });
  });

  it('fails closed when bandwidth policy is empty', async () => {
    await expect(new MikrotikRestAdapter().enforcePolicy('https://router.example', credentials, { ipAddress: '10.0.0.8' }, { planId: 'plan-3', bandwidth: { uploadKbps: null, downloadKbps: null } })).rejects.toMatchObject({ code: 'BANDWIDTH_POLICY_EMPTY' });
  });

  it('fails when the router accepts a policy write but read-back does not match', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/rest/queue/simple?name=jaslyn-10.0.0.8')) return new Response(init?.method === 'PUT' ? '[{".id":"*9","target":"10.0.0.8/32","max-limit":"1k/1k"}]' : '[]', { status: 200 });
      return new Response('{".id":"*9"}', { status: 200 });
    });
    await expect(new MikrotikRestAdapter().enforcePolicy('https://router.example', credentials, { ipAddress: '10.0.0.8' }, { planId: 'plan-4', bandwidth: { uploadKbps: 512, downloadKbps: 2048 } })).rejects.toMatchObject({ code: 'POLICY_VERIFICATION_FAILED' });
  });

  it('disconnects matching hotspot and PPP sessions and verifies absence', async () => {
    let hotspotActive = true;
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/rest/ip/hotspot/active')) return new Response(hotspotActive ? '[{".id":"*hs1","user":"alice","address":"10.0.0.8"}]' : '[]', { status: 200 });
      if (url.endsWith('/rest/ip/hotspot/active/*hs1')) { expect(init?.method).toBe('DELETE'); hotspotActive = false; return new Response('', { status: 200 }); }
      if (url.endsWith('/rest/ppp/active')) return new Response('[]', { status: 200 });
      throw new Error(`unexpected URL ${url}`);
    });
    const result = await new MikrotikRestAdapter().disconnectClient('https://router.example', credentials, { ipAddress: '10.0.0.8', username: 'alice' });
    expect(result).toMatchObject({ ok: true, disconnected: true, verified: true, removed: [{ service: 'hotspot', id: '*hs1' }], verification: { verified: true, remainingMatches: 0 } });
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it('matches PPP sessions by username when IP is unavailable', async () => {
    let pppActive = true;
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/rest/ip/hotspot/active')) return new Response('[]', { status: 200 });
      if (url.endsWith('/rest/ppp/active')) {
        if (init?.method === 'DELETE') { pppActive = false; return new Response('', { status: 200 }); }
        return new Response(pppActive ? '[{".id":"*ppp1","name":"alice","address":"10.0.0.9"}]' : '[]', { status: 200 });
      }
      throw new Error(`unexpected URL ${url}`);
    });
    await expect(new MikrotikRestAdapter().disconnectClient('https://router.example', credentials, { username: ' alice ' })).resolves.toMatchObject({ disconnected: true, removed: [{ service: 'ppp', id: '*ppp1' }] });
  });

  it('matches MAC addresses across common separator formats', async () => {
    let hotspotActive = true;
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/rest/ip/hotspot/active')) {
        if (init?.method === 'DELETE') { hotspotActive = false; return new Response('', { status: 200 }); }
        return new Response(hotspotActive ? '[{".id":"*hs2","user":"bob","mac-address":"AA-BB-CC-DD-EE-FF"}]' : '[]', { status: 200 });
      }
      if (url.endsWith('/rest/ppp/active')) return new Response('[]', { status: 200 });
      throw new Error(`unexpected URL ${url}`);
    });
    await expect(new MikrotikRestAdapter().disconnectClient('https://router.example', credentials, { macAddress: 'aa:bb:cc:dd:ee:ff' })).resolves.toMatchObject({ disconnected: true, removed: [{ service: 'hotspot', id: '*hs2' }] });
  });

  it('fails when a session remains after disconnect', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/rest/ip/hotspot/active')) return new Response('[{".id":"*hs1","user":"alice","address":"10.0.0.8"}]', { status: 200 });
      if (url.endsWith('/rest/ip/hotspot/active/*hs1')) return new Response('', { status: 200 });
      if (url.endsWith('/rest/ppp/active')) return new Response('[]', { status: 200 });
      throw new Error(`unexpected URL ${url}`);
    });
    await expect(new MikrotikRestAdapter().disconnectClient('https://router.example', credentials, { ipAddress: '10.0.0.8' })).rejects.toMatchObject({ code: 'DISCONNECT_VERIFICATION_FAILED' });
  });

  it('returns verified absence when no matching remote session exists', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/rest/ip/hotspot/active')) return new Response('[]', { status: 200 });
      if (url.endsWith('/rest/ppp/active')) return new Response('[]', { status: 200 });
      throw new Error(`unexpected URL ${url}`);
    });
    await expect(new MikrotikRestAdapter().disconnectClient('https://router.example', credentials, { ipAddress: '10.0.0.8' })).resolves.toMatchObject({ ok: true, disconnected: false, verified: true, removed: [], verification: { verified: true, remainingMatches: 0 } });
  });

  it('fails closed when disconnect has no client identity', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    await expect(new MikrotikRestAdapter().disconnectClient('https://router.example', credentials, {})).rejects.toMatchObject({ code: 'CLIENT_IDENTITY_REQUIRED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports timeout as a stable error code', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));
    await expect(new MikrotikRestAdapter().health('https://router.example', credentials, 5)).resolves.toMatchObject({ ok: false, status: 'offline', code: 'TIMEOUT' });
  });
});
