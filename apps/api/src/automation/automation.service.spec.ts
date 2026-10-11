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
