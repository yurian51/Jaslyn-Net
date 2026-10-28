import { ForbiddenException } from '@nestjs/common';
import { CommandAuthorizationService, OPERATOR_ROLES } from './command-authorization.service';
import { CommandFabricService } from './command-fabric.service';

const auth = new CommandAuthorizationService();
const ROLES = ['OWNER', 'ADMIN', 'NETWORK_ADMIN', 'NOC_ENGINEER', 'CASHIER', 'AGENT', 'READ_ONLY', 'SUPPORT_AGENT', ''];
const COMMANDS = ['terminate session s1', 'restart router r1', 'refund payment p1', '  TERMINATE   SESSION s1 ', 'delete user u1', '/status', 'status', 'show offline routers', 'terminatesession s1'];

describe('CommandAuthorizationService', () => {
  it('allows non-destructive commands for anyone', () => {
    expect(auth.authorize({ role: 'READ_ONLY' }, '/status', { confirmed: false })).toEqual({ decision: 'ALLOW', destructive: false });
  });
  it('denies destructive commands to non-operators even when confirmed', () => {
    for (const role of ['CASHIER', 'AGENT', 'READ_ONLY', 'SUPPORT_AGENT', '']) {
      expect(auth.authorize({ role }, 'terminate session s1', { confirmed: true }).decision).toBe('DENY');
    }
  });
  it('requires confirmation for operators, then allows', () => {
    expect(auth.authorize({ role: 'OWNER' }, 'terminate session s1', { confirmed: false }).decision).toBe('REQUIRE_CONFIRMATION');
    expect(auth.authorize({ role: 'OWNER' }, 'terminate session s1', { confirmed: true }).decision).toBe('ALLOW');
  });
  it('is origin-independent: manual and automation principals get identical decisions for every role/command/confirmation', () => {
    for (const role of ROLES) for (const command of COMMANDS) for (const confirmed of [true, false]) {
      const manual = auth.authorize({ role, origin: 'MANUAL' } as never, command, { confirmed });
      const automated = auth.authorize({ role, origin: 'AUTOMATION' } as never, command, { confirmed });
      expect(automated).toEqual(manual);
    }
  });
  it('operator role set is the one source of truth', () => expect([...OPERATOR_ROLES].sort()).toEqual(['ADMIN', 'NETWORK_ADMIN', 'NOC_ENGINEER', 'OWNER']));
});

describe('CommandFabricService.executeDestructive', () => {
  const make = () => {
    const db = { query: jest.fn().mockResolvedValue({ rowCount: 0, rows: [] }) };
    const queue = jest.fn().mockResolvedValue({ id: 'cmd-1' });
    return { db, queue, fabric: new CommandFabricService(db as never, { record: jest.fn() } as never, { queue } as never) };
  };
  it('cannot be used to skip authorization: unconfirmed or non-operator calls never touch the database or network', async () => {
    const { db, queue, fabric } = make();
    const p = { userId: 'u', tenantId: 't', role: 'OWNER', origin: 'AUTOMATION' as const };
    await expect(fabric.executeDestructive(p, 'terminate session s1', { confirmed: false, requestId: 'r' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(fabric.executeDestructive({ ...p, role: 'AGENT' }, 'terminate session s1', { confirmed: true, requestId: 'r' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.query).not.toHaveBeenCalled();
    expect(queue).not.toHaveBeenCalled();
  });
  it('refuses destructive verbs that have no verified execution path', async () => {
    const { fabric } = make();
    await expect(fabric.executeDestructive({ userId: 'u', tenantId: 't', role: 'OWNER' }, 'restart router r1', { confirmed: true, requestId: 'r' })).rejects.toThrow(/not connected/);
  });
});
