import * as jwt from 'jsonwebtoken';
import { AuthGuard } from './auth.guard';

describe('AuthGuard server-side session revocation', () => {
  const secret = 'x'.repeat(64);

  function token(options: {
    issuer?: string;
    audience?: string;
    expiresIn?: string;
    claims?: Record<string, unknown>;
    algorithm?: jwt.Algorithm;
    tokenId?: string;
  } = {}) {
    return jwt.sign(
      (options.claims ?? {
        sub: 'user-1',
        sid: 'session-1',
        tenantId: 'tenant-1',
        role: 'OWNER',
        email: 'owner@example.com',
      }) as jwt.JwtPayload,
      secret,
      {
        algorithm: options.algorithm ?? 'HS256',
        issuer: options.issuer ?? 'jaslyn-net',
        audience: options.audience ?? 'jaslyn-net-api',
        jwtid: options.tokenId ?? 'session-1',
        expiresIn: options.expiresIn ?? '5m',
      },
    );
  }

  function context(authorization: string) {
    const request: any = { headers: { authorization } };
    return { switchToHttp: () => ({ getRequest: () => request }), request };
  }

  function guard(rowCount = 1) {
    const db = {
      query: jest.fn().mockResolvedValue({
        rows: rowCount ? [{ id: 'session-1' }] : [],
        rowCount,
      }),
    } as any;
    return {
      guard: new AuthGuard({ get: jest.fn().mockReturnValue(secret) } as any, db),
      db,
    };
  }

  it('accepts a valid token only when its server-side session is active', async () => {
    const { guard, db } = guard();
    const ctx = context(`Bearer ${token()}`);

    await expect(guard.canActivate(ctx as any)).resolves.toBe(true);
    expect(ctx.request.user).toMatchObject({
      id: 'user-1',
      tenantId: 'tenant-1',
      sessionId: 'session-1',
    });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('revoked_at IS NULL AND expires_at>now()'),
      ['session-1', 'tenant-1', 'user-1'],
    );
  });

  it('rejects a revoked or missing server-side session', async () => {
    const { guard } = guard(0);

    await expect(guard.canActivate(context(`Bearer ${token()}`) as any))
      .rejects.toThrow('Session has been revoked or expired');
  });

  it.each([
    ['wrong issuer', { issuer: 'other-issuer' }],
    ['wrong audience', { audience: 'other-audience' }],
    ['expired token', { expiresIn: '0s' }],
  ])('rejects a token with %s', async (_label, options) => {
    const { guard, db } = guard();

    await expect(guard.canActivate(context(`Bearer ${token(options)}`) as any))
      .rejects.toThrow('Invalid or expired access token');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects a token with an invalid signature before checking the session', async () => {
    const { guard, db } = guard();
    const [header, payload] = token().split('.');
    const invalidSignature = Buffer.from('not-the-token-signature').toString('base64url');

    await expect(
      guard.canActivate(context(`Bearer ${header}.${payload}.${invalidSignature}`) as any),
    ).rejects.toThrow('Invalid or expired access token');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects tokens missing required session claims before checking the session', async () => {
    const { guard, db } = guard();
    const invalidClaims = token({
      claims: { sub: 'user-1', sid: 'session-1', tenantId: 'tenant-1' },
    });

    await expect(guard.canActivate(context(`Bearer ${invalidClaims}`) as any))
      .rejects.toThrow('Access token is missing required session claims');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects tokens whose JWT ID is not bound to the session ID', async () => {
    const { guard, db } = guard();
    const mismatchedBinding = token({ tokenId: 'different-session' });

    await expect(guard.canActivate(context(`Bearer ${mismatchedBinding}`) as any))
      .rejects.toThrow('Access token session binding is invalid');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects tokens without an expiration claim', async () => {
    const { guard, db } = guard();
    const noExpiryToken = jwt.sign(
      { sub: 'user-1', sid: 'session-1', tenantId: 'tenant-1', role: 'OWNER' },
      secret,
      { algorithm: 'HS256', issuer: 'jaslyn-net', audience: 'jaslyn-net-api', jwtid: 'session-1' },
    );

    await expect(guard.canActivate(context(`Bearer ${noExpiryToken}`) as any))
      .rejects.toThrow('Access token is missing required session claims');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects an authorization token signed with an algorithm other than HS256', async () => {
    const { guard, db } = guard();
    const tokenWithWrongAlgorithm = token({ algorithm: 'HS384' });

    await expect(
      guard.canActivate(context(`Bearer ${tokenWithWrongAlgorithm}`) as any),
    ).rejects.toThrow('Invalid or expired access token');
    expect(db.query).not.toHaveBeenCalled();
  });
});
