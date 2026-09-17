import { IspExpiryService } from './isp-expiry.service';

describe('IspExpiryService', () => {
  it('expires active bindings, suspends expired customer services, and reconciles affected tenants', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'binding-1', tenantId: 'tenant-1' }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ tenantId: 'tenant-1', customerId: 'customer-1' }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const release = jest.fn();
    const db = { connect: jest.fn().mockResolvedValue({ query, release }) } as any;
    const reconcileAccessState = jest.fn().mockResolvedValue({ expiredGrants: 1, sessions: [] });
    const service = new IspExpiryService(db, { reconcileAccessState } as any);

    await expect(service.reconcile()).resolves.toEqual({ expiredBindings: 1, suspendedCustomers: 1 });
    expect(query).toHaveBeenCalledWith('BEGIN');
    expect(query).toHaveBeenCalledWith('COMMIT');
    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO access_state_events'))).toBe(true);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO customer_service_state_events'))).toBe(true);
    expect(reconcileAccessState).toHaveBeenCalledWith('tenant-1', { requestId: 'system-expiry:tenant-1' });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('does not suspend a customer while another active access binding remains', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'binding-1', tenantId: 'tenant-1' }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const release = jest.fn();
    const db = { connect: jest.fn().mockResolvedValue({ query, release }) } as any;
    const reconcileAccessState = jest.fn().mockResolvedValue({ expiredGrants: 1, sessions: [] });
    const service = new IspExpiryService(db, { reconcileAccessState } as any);

    await expect(service.reconcile()).resolves.toEqual({ expiredBindings: 1, suspendedCustomers: 0 });
    expect(reconcileAccessState).toHaveBeenCalledWith('tenant-1', expect.any(Object));
  });

  it('does not fail the database reconciliation when network enforcement fails', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'binding-1', tenantId: 'tenant-1' }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const release = jest.fn();
    const db = { connect: jest.fn().mockResolvedValue({ query, release }) } as any;
    const reconcileAccessState = jest.fn().mockRejectedValue(new Error('router unavailable'));
    const service = new IspExpiryService(db, { reconcileAccessState } as any);

    await expect(service.reconcile()).resolves.toEqual({ expiredBindings: 1, suspendedCustomers: 0 });
    expect(query).toHaveBeenCalledWith('COMMIT');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('rolls back and releases the connection when reconciliation fails', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockRejectedValueOnce(new Error('database failure'))
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const release = jest.fn();
    const db = { connect: jest.fn().mockResolvedValue({ query, release }) } as any;
    const service = new IspExpiryService(db, { reconcileAccessState: jest.fn() } as any);

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
    const service = new IspExpiryService(db, { reconcileAccessState: jest.fn() } as any);

    const first = service.reconcile();
    await Promise.resolve();
    await expect(service.reconcile()).resolves.toEqual({ expiredBindings: 0, suspendedCustomers: 0 });
    releaseTransaction();
    await expect(first).resolves.toEqual({ expiredBindings: 0, suspendedCustomers: 0 });
  });
});
