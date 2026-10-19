import { SignJWT } from 'jose';
import { CommunicationWebSocket } from './communication.websocket';

describe('CommunicationWebSocket session authorization', () => {
  const secret = 'x'.repeat(64);

  async function token(includeSessionId = true) {
    const claims: Record<string, string> = {
      sub: 'user-1',
      tenantId: 'tenant-1',
      role: 'OWNER',
    };
    if (includeSessionId) claims.sid = 'session-1';

    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer('jaslyn-net')
      .setAudience('jaslyn-net-api')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(secret));
  }

  function request(accessToken: string) {
    return { url: `/api/v1/communication/socket?access_token=${encodeURIComponent(accessToken)}` } as any;
  }

  function service(db: { query: jest.Mock }) {
    return new CommunicationWebSocket({ subscribe: jest.fn(), publish: jest.fn() } as any, db as any);
  }

  it('accepts a valid token only when the corresponding server-side session is active', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'session-1' }], rowCount: 1 }) };
    const socket = service(db);

    await expect((socket as any).authenticate(request(await token()), secret))
      .resolves.toEqual({ userId: 'user-1', tenantId: 'tenant-1', role: 'OWNER', sessionId: 'session-1' });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('revoked_at IS NULL AND expires_at>now()'),
      ['session-1', 'tenant-1', 'user-1'],
    );
  });

  it('rejects a revoked, expired, or missing server-side session', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) };
    const socket = service(db);

    await expect((socket as any).authenticate(request(await token()), secret))
      .rejects.toThrow('session has been revoked or expired');
  });

  it('rejects tokens without a session identifier', async () => {
    const db = { query: jest.fn() };
    const socket = service(db);

    await expect((socket as any).authenticate(request(await token(false)), secret))
      .rejects.toThrow('invalid authentication claims');
    expect(db.query).not.toHaveBeenCalled();
  });


  it('closes established sockets when their sessions are no longer active', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) };
    const socket = service(db);
    const client = { close: jest.fn() };
    (socket as any).sockets.set(client, {
      userId: 'user-1',
      tenantId: 'tenant-1',
      role: 'OWNER',
      sessionId: 'session-1',
    });

    await (socket as any).closeInactiveSessions();

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('id = ANY($1::uuid[])'),
      [['session-1']],
    );
    expect(client.close).toHaveBeenCalledWith(1008, 'Session expired or revoked');
  });

  it('closes established sockets if session validation becomes unavailable', async () => {
    const db = { query: jest.fn().mockRejectedValue(new Error('database unavailable')) };
    const socket = service(db);
    const client = { close: jest.fn() };
    (socket as any).sockets.set(client, {
      userId: 'user-1',
      tenantId: 'tenant-1',
      role: 'OWNER',
      sessionId: 'session-1',
    });

    await (socket as any).closeInactiveSessions();

    expect(client.close).toHaveBeenCalledWith(1011, 'Session validation unavailable');
  });

  it('fails closed when the session store is unavailable', async () => {
    const db = { query: jest.fn().mockRejectedValue(new Error('database unavailable')) };
    const socket = service(db);

    await expect((socket as any).authenticate(request(await token()), secret))
      .rejects.toThrow('database unavailable');
  });
});
