import { SignJWT } from 'jose';
 fix/internal-pages-brand-consistency
import type { IncomingMessage } from 'node:http';

 main
import { CommunicationWebSocket } from './communication.websocket';

describe('CommunicationWebSocket session authorization', () => {
  const secret = 'x'.repeat(64);

fix/internal-pages-brand-consistency
  async function accessToken() {
    return new SignJWT({
      sub: 'user-1',
      sid: 'session-1',
      tenantId: 'tenant-1',
      role: 'OWNER',
    })

  async function token(includeSessionId = true) {
    const claims: Record<string, string> = {
      sub: 'user-1',
      tenantId: 'tenant-1',
      role: 'OWNER',
    };
    if (includeSessionId) claims.sid = '11111111-1111-4111-8111-111111111111';

    return new SignJWT(claims)
 main
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer('jaslyn-net')
      .setAudience('jaslyn-net-api')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(secret));
  }

  function service(db: { query: jest.Mock }) {
    return new CommunicationWebSocket({ subscribe: jest.fn() } as any, db as any);
  }

  it('accepts a valid JWT only when its server-side session is active', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'session-1' }], rowCount: 1 }) };
    const subject = service(db);
    const token = await accessToken();
    const request = { url: `/api/v1/communication/socket?access_token=${encodeURIComponent(token)}` } as IncomingMessage;

    await expect((subject as any).authenticate(request, secret)).resolves.toEqual({
      userId: 'user-1',
      tenantId: 'tenant-1',
      role: 'OWNER',
    });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('revoked_at IS NULL AND expires_at>now()'),
      ['session-1', 'tenant-1', 'user-1'],
    );
  });

  it('rejects a valid JWT after its server-side session is revoked or expired', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) };
    const subject = service(db);
    const token = await accessToken();
    const request = { url: `/api/v1/communication/socket?access_token=${encodeURIComponent(token)}` } as IncomingMessage;

    await expect((subject as any).authenticate(request, secret)).rejects.toThrow('session is revoked or expired');
  });
});
