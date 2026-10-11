import { ForbiddenException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

describe('NotificationsService SMS queue', () => {
  it('normalizes Tanzanian mobile numbers and writes tenant-scoped idempotent SMS', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'sms-1', status: 'PENDING', dedupeKey: 'purchase-1' }], rowCount: 1 }) };
    const service = new NotificationsService(db as any);
    await service.enqueueSms('tenant-a', {
      recipient: '+255 712 345 678',
      message: 'Payment received',
      category: 'PAYMENT',
      idempotencyKey: 'purchase-1',
    });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (tenant_id,dedupe_key)'),
      expect.arrayContaining(['tenant-a', '255712345678', 'PAYMENT', JSON.stringify({ message: 'Payment received' }), 'purchase-1', 'PAYMENT']),
    );
  });

  it('rejects marketing SMS without recorded tenant-specific opt-in', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) };
    const service = new NotificationsService(db as any);
    await expect(service.enqueueSms('tenant-a', {
      recipient: '0712345678',
      message: 'Offer',
      category: 'MARKETING',
      idempotencyKey: 'campaign-1',
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][1]).toEqual(['tenant-a', '255712345678']);
  });

  it('rejects invalid phone numbers and missing idempotency keys before enqueue', async () => {
    const db = { query: jest.fn() };
    const service = new NotificationsService(db as any);
    await expect(service.enqueueSms('tenant-a', {
      recipient: '1234',
      message: 'Hello',
      category: 'TRANSACTIONAL',
      idempotencyKey: 'key-1',
    })).rejects.toThrow('Tanzanian mobile number');
    await expect(service.enqueueSms('tenant-a', {
      recipient: '0712345678',
      message: 'Hello',
      category: 'TRANSACTIONAL',
      idempotencyKey: '',
    })).rejects.toThrow('idempotency key');
    expect(db.query).not.toHaveBeenCalled();
  });
});


describe('NotificationsService bulk SMS campaigns', () => {
  it('normalizes and deduplicates recipients before queueing tenant-scoped rows', async () => {
    const client = { query: jest.fn(async (sql: string, args?: unknown[]) => {
      void args;
      if (sql.includes('INSERT INTO sms_campaigns')) return { rows: [{ id: 'campaign-1', tenantId: 'tenant-a', status: 'QUEUED', queuedCount: 0, name: 'Expiry', category: 'EXPIRY', recipientCount: 2 }] };
      if (sql.includes('SELECT count(*)::int AS queued_count')) return { rows: [{ queued_count: 2 }] };
      if (sql.includes('UPDATE sms_campaigns')) return { rows: [{ id: 'campaign-1', tenantId: 'tenant-a', status: 'QUEUED', queuedCount: 2, name: 'Expiry', category: 'EXPIRY', recipientCount: 2 }] };
      return { rows: [], rowCount: 1 };
    }), release: jest.fn() };
    const db = { connect: jest.fn().mockResolvedValue(client) };
    const service = new NotificationsService(db as any);
    const result = await service.enqueueBulkSms('tenant-a', {
      recipients: ['0712345678', '+255 712 345 678', '0755123456'],
      message: 'Your bundle expires soon',
      category: 'EXPIRY',
      idempotencyKey: 'expiry-october-1',
      name: 'Expiry',
    });
    expect(result.queuedCount).toBe(2);
    const inserts = client.query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO notification_outbox'));
    expect(inserts).toHaveLength(2);
    expect(inserts.map(([, args]) => (args as unknown[] | undefined)?.[1]).sort()).toEqual(['255712345678', '255755123456']);
    expect(inserts.every(([, args]) => (args as unknown[] | undefined)?.[0] === 'tenant-a')).toBe(true);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('rejects bulk marketing campaigns if any recipient lacks tenant-specific opt-in', async () => {
    const client = { query: jest.fn(async (sql: string) => {
      if (sql.includes('SELECT DISTINCT')) return { rows: [{ phone: '255712345678' }] };
      return { rows: [] };
    }), release: jest.fn() };
    const service = new NotificationsService({ connect: jest.fn().mockResolvedValue(client) } as any);
    await expect(service.enqueueBulkSms('tenant-a', {
      recipients: ['0712345678', '0755123456'],
      message: 'Special offer',
      category: 'MARKETING',
      idempotencyKey: 'campaign-opt-in',
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO sms_campaigns'))).toBe(false);
    expect(client.release).toHaveBeenCalled();
  });

  it('rejects empty campaigns and missing idempotency keys', async () => {
    const service = new NotificationsService({ connect: jest.fn() } as any);
    await expect(service.enqueueBulkSms('tenant-a', {
      recipients: [], message: 'Hello', category: 'EXPIRY', idempotencyKey: 'key',
    })).rejects.toThrow('between 1 and 1000');
    await expect(service.enqueueBulkSms('tenant-a', {
      recipients: ['0712345678'], message: 'Hello', category: 'EXPIRY', idempotencyKey: '',
    })).rejects.toThrow('idempotency key');
  });
});
