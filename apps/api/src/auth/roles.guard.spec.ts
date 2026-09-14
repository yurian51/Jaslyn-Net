import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from './roles.decorator';

describe('RolesGuard', () => {
  function context(user?: { id: string; tenantId: string; role: string; email: string }): ExecutionContext {
    return {
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;
  }

  it('allows requests without role metadata', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) } as unknown as Reflector;
    expect(new RolesGuard(reflector).canActivate(context({ id: 'u', tenantId: 't', role: 'READ_ONLY', email: 'r@example.com' }))).toBe(true);
  });

  it('allows an explicitly permitted role', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['OWNER', 'ADMIN']) } as unknown as Reflector;
    expect(new RolesGuard(reflector).canActivate(context({ id: 'u', tenantId: 't', role: 'ADMIN', email: 'a@example.com' }))).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, expect.any(Array));
  });

  it('rejects an authenticated user with an insufficient role', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['OWNER', 'ADMIN']) } as unknown as Reflector;
    expect(() => new RolesGuard(reflector).canActivate(context({ id: 'u', tenantId: 't', role: 'CASHIER', email: 'c@example.com' }))).toThrow(ForbiddenException);
  });

  it('rejects a request missing an authenticated user when roles are required', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['OWNER']) } as unknown as Reflector;
    expect(() => new RolesGuard(reflector).canActivate(context())).toThrow(ForbiddenException);
  });
});
