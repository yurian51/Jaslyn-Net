import 'reflect-metadata';
import { PaymentsController } from './payments.controller';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';

describe('PaymentsController access control', () => {
  it.each(['list', 'methods', 'createIntent'] as const)(
    'restricts %s to authenticated tenant owners and admins',
    (method) => {
      const handler = PaymentsController.prototype[method];
      expect(Reflect.getMetadata('roles', handler)).toEqual(['OWNER', 'ADMIN']);
      expect(Reflect.getMetadata('__guards__', handler)).toEqual([AuthGuard, RolesGuard]);
    },
  );

  it('leaves the signed webhook route public to provider callbacks', () => {
    const handler = PaymentsController.prototype.webhook;
    expect(Reflect.getMetadata('roles', handler)).toBeUndefined();
    expect(Reflect.getMetadata('__guards__', handler)).toBeUndefined();
  });
});
