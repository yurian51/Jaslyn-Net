import { SignJWT } from 'jose';
import { AuthGuard } from './auth.guard';

describe('AuthGuard server-side session revocation', () => {
  const secret = 'x'.repeat(64);

  async function token() {
    return new SignJWT({ sub: 'user-1', sid: 'session-1', tenantId: 'tenant-1', role: 'OWNER', email: 'owner@example.com' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer('jaslyn-net')
      .setAudience('jaslyn-net-api')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(secret));
  }

  function context(authorization: string) {
    const request: any = { headers: { authorization } };
    return { switchToHttp: () => ({ getRequest: () => request }), request };
  }

  it('accepts a valid token only when its server-side session is active', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'session-1' }], rowCount: 1 }) } as any;
    const guard = new AuthGuard({ get: jest.fn().mockReturnValue(secret) } as any, db);
    const ctx = context(`Bearer ${await token()}`);

    await expect(guard.canActivate(ctx as any)).resolves.toBe(true);
    expect(ctx.request.user).toMatchObject({ id: 'user-1', tenantId: 'tenant-1', sessionId: 'session-1' });
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('revoked_at IS NULL AND expires_at>now()'), ['session-1', 'tenant-1', 'user-1']);
  });

  it('rejects a revoked or missing server-side session', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) } as any;
    const guard = new AuthGuard({ get: jest.fn().mockReturnValue(secret) } as any, db);

    await expect(guard.canActivate(context(`Bearer ${await token()}`) as any)).rejects.toThrow('Session has been revoked or expired');
  });
});
