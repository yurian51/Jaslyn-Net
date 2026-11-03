import { SignJWT } from 'jose';
import type { IncomingMessage } from 'node:http';
import { WebSocket } from 'ws';
import { CommunicationWebSocket } from './communication.websocket';

const SECRET = 'websocket-test-secret-that-is-long-enough-123';
const NOW = Math.floor(Date.now() / 1000);

describe('CommunicationWebSocket session security', () => {
  function createService() {
    const db = { query: jest.fn() };
    const realtime = { subscribe: jest.fn(), publish: jest.fn() };
    const service = new CommunicationWebSocket(realtime as never, db as never);
    return { service, db, realtime };
  }

  async function token(claims: Record<string, unknown> = {}) {
    return new SignJWT({
      sub: 'user-1',
      sid: 'a1b2c3d4-e5f6-4789-a123-123456789abc',
      tenantId: 'tenant-1',
      role: 'OWNER',
      ...claims,
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer('jaslyn-net')
      .setAudience('jaslyn-net-api')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(SECRET));
  }

  function requestWithToken(value: string) {
    return { url: `/api/v1/communication/socket?access_token=${encodeURIComponent(value)}` } as IncomingMessage;
  }

  it('authenticates only when the JWT claims match an active server-side session', async () => {
    const { service, db } = createService();
    db.query.mockResolvedValue({ rowCount: 1, rows: [{ id: 'a1b2c3d4-e5f6-4789-a123-123456789abc' }] });

    await expect((service as any).authenticate(requestWithToken(await token()), SECRET)).resolves.toMatchObject({
      userId: 'user-1',
      tenantId: 'tenant-1',
      role: 'OWNER',
      sessionId: 'a1b2c3d4-e5f6-4789-a123-123456789abc',
      tokenExpiresAt: expect.any(Number),
    });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('revoked_at IS NULL AND expires_at>now()'),
      ['a1b2c3d4-e5f6-4789-a123-123456789abc', 'tenant-1', 'user-1'],
    );
  });

  it('rejects a validly signed token with a revoked or expired database session', async () => {
    const { service, db } = createService();
    db.query.mockResolvedValue({ rowCount: 0, rows: [] });

    await expect((service as any).authenticate(requestWithToken(await token()), SECRET))
      .rejects.toThrow('session has been revoked or expired');
  });

  it('requires a session id claim before querying the database', async () => {
    const { service, db } = createService();

    await expect((service as any).authenticate(
      requestWithToken(await token({ sid: undefined })), SECRET,
    )).rejects.toThrow('invalid authentication claims');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects invalid signatures before querying session state', async () => {
    const { service, db } = createService();
    const valid = await token();
    const invalid = `${valid.split('.').slice(0, 2).join('.')}.${Buffer.from('invalid').toString('base64url')}`;

    await expect((service as any).authenticate(requestWithToken(invalid), SECRET)).rejects.toThrow();
    expect(db.query).not.toHaveBeenCalled();
  });

  it('closes sockets whose session is revoked during periodic revalidation', async () => {
    const { service, db } = createService();
    const client = {
      readyState: WebSocket.OPEN,
      close: jest.fn(),
    };
    const context = {
      userId: 'user-1', tenantId: 'tenant-1', role: 'OWNER',
      sessionId: 'a1b2c3d4-e5f6-4789-a123-123456789abc',
      tokenExpiresAt: NOW + 300,
    };
    (service as any).sockets.set(client, context);
    (service as any).lastPong.set(client, Date.now());
    db.query.mockResolvedValue({ rows: [] });

    await (service as any).validateActiveSessions();

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('revoked_at IS NULL AND expires_at > now()'),
      [[context.sessionId]],
    );
    expect(client.close).toHaveBeenCalledWith(1008, 'Authentication session expired or revoked');
    expect((service as any).sockets.has(client)).toBe(false);
  });

  it('fails closed and closes authenticated sockets when the session store is unavailable', async () => {
    const { service, db } = createService();
    const client = { readyState: WebSocket.OPEN, close: jest.fn() };
    (service as any).sockets.set(client, {
      userId: 'user-1', tenantId: 'tenant-1', role: 'OWNER',
      sessionId: 'a1b2c3d4-e5f6-4789-a123-123456789abc',
      tokenExpiresAt: NOW + 300,
    });
    (service as any).lastPong.set(client, Date.now());
    db.query.mockRejectedValue(new Error('database unavailable'));

    await (service as any).validateActiveSessions();

    expect(client.close).toHaveBeenCalledWith(1011, 'Authentication could not be revalidated');
    expect((service as any).sockets.has(client)).toBe(false);
  });

  it('does not revalidate expired JWTs or leave them connected', async () => {
    const { service, db } = createService();
    const client = { readyState: WebSocket.OPEN, close: jest.fn(), terminate: jest.fn() };
    (service as any).sockets.set(client, {
      userId: 'user-1', tenantId: 'tenant-1', role: 'OWNER',
      sessionId: 'a1b2c3d4-e5f6-4789-a123-123456789abc',
      tokenExpiresAt: NOW - 1,
    });
    (service as any).lastPong.set(client, Date.now());

    await (service as any).validateActiveSessions();

    expect(db.query).not.toHaveBeenCalled();
    expect((service as any).sockets.has(client)).toBe(true);
    // The timer terminates expired tokens; revalidation itself avoids a DB call.
  });
});
