import { ConflictException } from '@nestjs/common';
import { Pool } from 'pg';
import { VouchersService } from './vouchers.service';

describe('VouchersService expiry handling', () => {
  it('commits EXPIRED status before returning an expired-voucher conflict', async () => {
    const calls: string[] = [];
    const client = {
      query: jest.fn(async (sql: string) => {
        calls.push(sql);
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rowCount: 0, rows: [] };
        if (sql.includes('SELECT v.id,v.package_id,v.status,v.expires_at')) {
          return { rowCount: 1, rows: [{
            id: 'voucher-1', package_id: 'package-1', status: 'UNUSED',
            expires_at: new Date(Date.now() - 60_000), device_limit: 1,
          }] };
        }
        return { rowCount: 1, rows: [] };
      }),
      release: jest.fn(),
    };
    const db = { connect: jest.fn().mockResolvedValue(client) } as unknown as Pool;
    const audit = { record: jest.fn() };
    const events = { enqueue: jest.fn() };
    const service = new VouchersService(db, audit as never, events as never);

    await expect(service.redeem('tenant-1', 'EXPIRED123', { customerId: 'customer-1' } as never))
      .rejects.toBeInstanceOf(ConflictException);

    const expiryUpdate = calls.findIndex(sql => sql.includes("UPDATE vouchers SET status='EXPIRED'"));
    expect(expiryUpdate).toBeGreaterThan(-1);
    expect(calls.indexOf('COMMIT')).toBeGreaterThan(expiryUpdate);
    expect(client.release).toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(events.enqueue).not.toHaveBeenCalled();
  });
});
