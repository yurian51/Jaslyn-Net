import { ExecutionContext } from '@nestjs/common';
import { SignJWT } from 'jose';
import { AuthGuard } from './auth.guard';

describe('AuthGuard adversarial expiry', () => {
  const secret = 'x'.repeat(64);
  const config = { get: jest.fn((key:string) => key === 'JWT_SECRET' ? secret : undefined) } as any;
  const guard = new AuthGuard(config);
  const request:any = { headers:{ authorization:'' } };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  it('rejects an expired access token before an AI/network tool can run', async () => {
    const token = await new SignJWT({ tenantId:'tenant-a',role:'NOC_ENGINEER',email:'noc@example.test' })
      .setProtectedHeader({ alg:'HS256' })
      .setIssuer('jaslyn-net')
      .setAudience('jaslyn-net-api')
      .setSubject('u1')
      .setExpirationTime('1s')
      .setIssuedAt(Math.floor(Date.now()/1000)-10)
      .sign(new TextEncoder().encode(secret));

    request.headers.authorization = `Bearer ${token}`;
    await expect(guard.canActivate(context)).rejects.toThrow('Invalid or expired access token');
  });

  it('rejects a malformed bearer token', async () => {
    request.headers.authorization = 'Bearer not-a-jwt';
    await expect(guard.canActivate(context)).rejects.toThrow('Invalid or expired access token');
  });
});
