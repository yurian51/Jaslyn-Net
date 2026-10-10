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
