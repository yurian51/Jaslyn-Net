import { IspExpiryService } from './isp-expiry.service';

describe('IspExpiryService', () => {
  it('expires active bindings and suspends expired customer services atomically', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'binding-1', state: 'EXPIRED' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ tenant_id: 'tenant-1', customer_id: 'customer-1', state: 'ACTIVE' }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const release = jest.fn();
    const db = { connect: jest.fn().mockResolvedValue({ query, release }) } as any;
    const service = new IspExpiryService(db);

    await expect(service.reconcile()).resolves.toEqual({ expiredBindings: 1, suspendedCustomers: 1 });
    expect(query).toHaveBeenCalledWith('BEGIN');
    expect(query).toHaveBeenCalledWith('COMMIT');
    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO access_state_events'))).toBe(true);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO customer_service_state_events'))).toBe(true);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('rolls back and releases the connection when reconciliation fails', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockRejectedValueOnce(new Error('database failure'))
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const release = jest.fn();
    const db = { connect: jest.fn().mockResolvedValue({ query, release }) } as any;
    const service = new IspExpiryService(db);

    await expect(service.reconcile()).rejects.toThrow('database failure');
    expect(query).toHaveBeenCalledWith('ROLLBACK');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('does not overlap concurrent reconciliation calls', async () => {
    let releaseTransaction!: () => void;
    const query = jest.fn().mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN') return { rowCount: 0, rows: [] };
      if (sql.includes('UPDATE customer_access_bindings')) await new Promise<void>(resolve => { releaseTransaction = resolve; });
      return { rowCount: 0, rows: [] };
    });
    const release = jest.fn();
    const db = { connect: jest.fn().mockResolvedValue({ query, release }) } as any;
    const service = new IspExpiryService(db);

    const first = service.reconcile();
    await Promise.resolve();
    await expect(service.reconcile()).resolves.toEqual({ expiredBindings: 0, suspendedCustomers: 0 });
    releaseTransaction();
    await expect(first).resolves.toEqual({ expiredBindings: 0, suspendedCustomers: 0 });
  });
});
