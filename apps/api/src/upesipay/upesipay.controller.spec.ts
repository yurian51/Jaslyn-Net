import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UpesiPayController } from './upesipay.controller';

describe('UpesiPayController security', () => {
  function context(role: string): ExecutionContext {
    const handler = UpesiPayController.prototype.topUp;
    return {
      getHandler: () => handler,
      getClass: () => UpesiPayController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: 'u', tenantId: 'tenant-a', role, email: 'user@example.com' } }),
      }),
    } as unknown as ExecutionContext;
  }

  it('requires a billing-capable role for service-wallet top-up', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(
        Reflect.getMetadata(ROLES_KEY, UpesiPayController.prototype.topUp),
      ),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(context('AGENT'))).toBe(false);
    expect(guard.canActivate(context('CASHIER'))).toBe(false);
    expect(guard.canActivate(context('BILLING_ADMIN'))).toBe(true);
    expect(guard.canActivate(context('ADMIN'))).toBe(true);
  });
});
