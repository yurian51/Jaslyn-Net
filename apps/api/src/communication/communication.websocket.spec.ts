import * as jwt from 'jsonwebtoken';
import type { IncomingMessage } from 'node:http';
import { CommunicationWebSocket } from './communication.websocket';

const SECRET = 's'.repeat(64);

describe('CommunicationWebSocket JWT authentication', () => {
  const db = { query: jest.fn() };
  const realtime = { subscribe: jest.fn(), publish: jest.fn() };
  const socket = new CommunicationWebSocket(realtime as any, db as any);
  const authenticate = (request: IncomingMessage) => (socket as any).authenticate(request, SECRET);

  function token(options: {
    issuer?: string;
    audience?: string;
    algorithm?: jwt.Algorithm;
    sessionId?: string;
    tokenId?: string;
    expires?: boolean;
  } = {}) {
    const sessionId = options.sessionId ?? 'session-1';
    const claims = {
      sub: 'user-1',
      sid: sessionId,
      tenantId: 'tenant-1',
      role: 'OWNER',
    };
    const signOptions: jwt.SignOptions = {
      algorithm: options.algorithm ?? 'HS256',
      issuer: options.issuer ?? 'jaslyn-net',
      audience: options.audience ?? 'jaslyn-net-api',
      jwtid: options.tokenId ?? sessionId,
    };
    if (options.expires !== false) signOptions.expiresIn = '5m';
    return jwt.sign(claims, SECRET, signOptions);
  }

  function request(accessToken: string) {
    return { url: `/api/v1/communication/socket?access_token=${encodeURIComponent(accessToken)}` } as IncomingMessage;
  }

  beforeEach(() => {
    db.query.mockReset();
    db.query.mockResolvedValue({ rows: [{ id: 'session-1' }], rowCount: 1 });
  });

  it('accepts a correctly scoped HS256 token only for an active session', async () => {
    await expect(authenticate(request(token()))).resolves.toEqual({
      userId: 'user-1',
      tenantId: 'tenant-1',
      role: 'OWNER',
    });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('revoked_at IS NULL AND expires_at>now()'),
      ['session-1', 'tenant-1', 'user-1'],
    );
  });

  it.each([
    ['wrong issuer', { issuer: 'not-jaslyn' }],
    ['wrong audience', { audience: 'not-the-api' }],
    ['wrong algorithm', { algorithm: 'HS384' as const }],
    ['mismatched session binding', { tokenId: 'different-session' }],
    ['missing expiration', { expires: false }],
  ])('rejects a token with %s', async (_label, options) => {
    await expect(authenticate(request(token(options)))).rejects.toThrow();
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects a revoked or expired database session', async () => {
    db.query.mockResolvedValue({ rows: [], rowCount: 0 });

    await expect(authenticate(request(token()))).rejects.toThrow('session is revoked or expired');
  });

  it('rejects a missing access token without querying the database', async () => {
    await expect(authenticate({ url: '/api/v1/communication/socket' } as IncomingMessage))
      .rejects.toThrow('access_token is required');
    expect(db.query).not.toHaveBeenCalled();
  });
});
