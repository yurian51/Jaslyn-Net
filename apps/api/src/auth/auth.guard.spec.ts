import { SignJWT } from 'jose';
import { AuthGuard } from './auth.guard';

describe('AuthGuard server-side session revocation', () => {
  const secret = 'x'.repeat(64);

  async function token(options: {
    issuer?: string;
    audience?: string;
    expiresIn?: string;
    claims?: Record<string, unknown>;
  } = {}) {
    return new SignJWT(options.claims ?? {
      sub: 'user-1',
      sid: 'session-1',
      tenantId: 'tenant-1',
      role: 'OWNER',
      email: 'owner@example.com',
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer(options.issuer ?? 'jaslyn-net')
      .setAudience(options.audience ?? 'jaslyn-net-api')
      .setIssuedAt()
      .setExpirationTime(options.expiresIn ?? '5m')
      .sign(new TextEncoder().encode(secret));
  }

  function context(authorization: string) {
    const request: any = { headers: { authorization } };
    return { switchToHttp: () => ({ getRequest: () => request }), request };
  }

  function guard(rowCount = 1) {
    const db = { query: jest.fn().mockResolvedValue({ rows: rowCount ? [{ id: 'session-1' }] : [], rowCount }) } as any;
    return { guard: new AuthGuard({ get: jest.fn().mockReturnValue(secret) } as any, db), db };
  }

  it('accepts a valid token only when its server-side session is active', async () => {
    const { guard, db } = guard();
    const ctx = context(`Bearer ${await token()}`);

    await expect(guard.canActivate(ctx as any)).resolves.toBe(true);
    expect(ctx.request.user).toMatchObject({ id: 'user-1', tenantId: 'tenant-1', sessionId: 'session-1' });
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('revoked_at IS NULL AND expires_at>now()'), ['session-1', 'tenant-1', 'user-1']);
  });

  it('rejects a revoked or missing server-side session', async () => {
    const { guard } = guard(0);

    await expect(guard.canActivate(context(`Bearer ${await token()}`) as any)).rejects.toThrow('Session has been revoked or expired');
  });

  it.each([
    ['wrong issuer', { issuer: 'other-issuer' }],
    ['wrong audience', { audience: 'other-audience' }],
    ['expired token', { expiresIn: '0s' }],
  ])('rejects a token with %s', async (_label, options) => {
    const { guard, db } = guard();

    await expect(guard.canActivate(context(`Bearer ${await token(options)}`) as any)).rejects.toThrow('Invalid or expired access token');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects a token with an invalid signature before checking the session', async () => {
    const { guard, db } = guard();
    const [header, payload] = (await token()).split('.');
    const invalidSignature = Buffer.from('not-the-token-signature').toString('base64url');

    await expect(guard.canActivate(context(`Bearer ${header}.${payload}.${invalidSignature}`) as any))
      .rejects.toThrow('Invalid or expired access token');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects tokens missing required session claims before checking the session', async () => {
    const { guard, db } = guard();
    const invalidClaims = await token({ claims: { sub: 'user-1', sid: 'session-1', tenantId: 'tenant-1' } });

    await expect(guard.canActivate(context(`Bearer ${invalidClaims}`) as any))
      .rejects.toThrow('Access token is missing required session claims');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects an authorization token signed with an algorithm other than HS256', async () => {
    const { guard, db } = guard();
    const tokenWithWrongAlgorithm = new SignJWT({
      sub: 'user-1', sid: 'session-1', tenantId: 'tenant-1', role: 'OWNER',
    })
      .setProtectedHeader({ alg: 'HS384', typ: 'JWT' })
      .setIssuer('jaslyn-net')
      .setAudience('jaslyn-net-api')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(secret));

    await expect(guard.canActivate(context(`Bearer ${await tokenWithWrongAlgorithm}`) as any))
      .rejects.toThrow('Invalid or expired access token');
    expect(db.query).not.toHaveBeenCalled();
  });
});
