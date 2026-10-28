import { BadRequestException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { Pool } from 'pg';
import { AutomationService } from './automation.service';

describe('AutomationService rule validation', () => {
  const db = { query: jest.fn() };
  const audit = { record: jest.fn() };
  const service = new AutomationService(db as unknown as Pool, audit as unknown as AuditService);

  beforeEach(() => jest.clearAllMocks());

  it('rejects prototype traversal in condition paths before persistence', async () => {
    await expect(service.createRule('tenant-a', 'user-a', {
      name: 'unsafe path',
      eventType: '*',
      conditions: [{ path: '__proto__.polluted', op: 'eq', value: true }],
      actions: [{ type: 'CREATE_ALERT', severity: 'HIGH', title: 'Test alert' }],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects arbitrary actions rather than executing commands', async () => {
    await expect(service.createRule('tenant-a', 'user-a', {
      name: 'unsafe action',
      eventType: '*',
      conditions: [],
      actions: [{ type: 'RUN_SHELL', command: 'whoami' }],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('AutomationService event condition evaluation', () => {
  const db = { query: jest.fn() };
  const audit = { record: jest.fn() };
  const service = new AutomationService(db as unknown as Pool, audit as unknown as AuditService);

  beforeEach(() => jest.clearAllMocks());

  it('matches nested values without evaluating inherited properties', () => {
    const payload = { payment: { status: 'PAID', amount: 2500 }, tenant: 'tenant-a' };
    const result = (service as any).matches(payload, [
      { path: 'payment.status', op: 'eq', value: 'PAID' },
      { path: 'payment.amount', op: 'gte', value: 2000 },
      { path: 'tenant', op: 'eq', value: 'tenant-a' },
    ]);
    expect(result.matched).toBe(true);
    expect(result.results).toHaveLength(3);
    expect((service as any).valueAt(payload, 'toString')).toEqual({ exists: false, value: undefined });
  });

  it('does not match numeric comparisons against non-numeric event values', () => {
    const result = (service as any).matches({ payment: { amount: 'not-a-number' } }, [
      { path: 'payment.amount', op: 'gt', value: 0 },
    ]);
    expect(result.matched).toBe(false);
  });

  it('treats absent paths as absent for exists and equality conditions', () => {
    const payload = { payment: { status: 'PENDING' } };
    expect((service as any).matches(payload, [{ path: 'payment.reference', op: 'exists', value: true }]).matched).toBe(false);
    expect((service as any).matches(payload, [{ path: 'payment.reference', op: 'eq', value: null }]).matched).toBe(false);
    expect((service as any).matches(payload, [{ path: 'payment.reference', op: 'neq', value: null }]).matched).toBe(true);
  });
});
