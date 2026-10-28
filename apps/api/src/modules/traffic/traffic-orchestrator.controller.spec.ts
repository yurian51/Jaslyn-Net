import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { TrafficOrchestratorController } from './traffic-orchestrator.controller';

describe('TrafficOrchestratorController security', () => {
  function context(role: string): ExecutionContext {
    const handler = TrafficOrchestratorController.prototype.evaluate;
    return {
      getHandler: () => handler,
      getClass: () => TrafficOrchestratorController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: 'u', tenantId: 'tenant-a', role, email: 'user@example.com' } }),
      }),
    } as unknown as ExecutionContext;
  }

  it('declares role authorization on the router evaluation endpoint', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(
        Reflect.getMetadata(ROLES_KEY, TrafficOrchestratorController.prototype.evaluate),
      ),
    } as unknown as Reflector;

    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(context('AGENT'))).toBe(false);
    expect(guard.canActivate(context('NOC_ENGINEER'))).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalled();
  });

  it('does not grant enforcement capability to ordinary authenticated roles', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(
        Reflect.getMetadata(ROLES_KEY, TrafficOrchestratorController.prototype.evaluate),
      ),
    } as unknown as Reflector;

    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(context('CASHIER'))).toBe(false);
    expect(guard.canActivate(context('SUPPORT_AGENT'))).toBe(false);
  });
});
