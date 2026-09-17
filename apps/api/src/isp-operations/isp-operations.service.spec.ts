import { IspOperationsService } from './isp-operations.service';

describe('IspOperationsService', () => {
  const audit = { record: jest.fn().mockResolvedValue({ id: 'audit-1', createdAt: new Date() }) };

  beforeEach(() => {
    audit.record.mockReset();
    audit.record.mockResolvedValue({ id: 'audit-1', createdAt: new Date() });
  });

  it('scopes access bindings to the authenticated tenant', async () => {
    const query = jest.fn().mockResolvedValueOnce({ rows: [{ id: 'a1' }] }).mockResolvedValueOnce({ rows: [{ count: 1 }] });
    const service = new IspOperationsService({ query } as any, {} as any, audit as any);
    const result = await service.listAccessBindings('tenant-a', { page: 1, limit: 25 });
    expect(result.data).toEqual([{ id: 'a1' }]);
    expect(query.mock.calls[0][1]).toEqual(['tenant-a', null, 25, 0]);
    expect(query.mock.calls[1][1]).toEqual(['tenant-a', null]);
  });

  it('records an access state transition, reconciles live network access, and audits the operator action', async () => {
    const txQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'a1', customer_id: 'c1', router_id: 'r1', state: 'PENDING', activated_at: null, suspended_at: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 'a1', customer_id: 'c1', router_id: 'r1', state: 'ACTIVE', activated_at: new Date(), suspended_at: null }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const release = jest.fn();
    const connect = jest.fn().mockResolvedValue({ query: txQuery, release });
    const reconcileAccessState = jest.fn().mockResolvedValue({ expiredGrants: 0, sessions: [] });
    const service = new IspOperationsService({ connect } as any, { reconcileAccessState } as any, audit as any);

    const result = await service.changeAccessState('tenant-a', 'a1', { state: 'ACTIVE', reason: 'Payment verified' }, { userId: 'operator-1', requestId: 'req-1' });

    expect(result.state).toBe('ACTIVE');
    expect(result.reconciliation.state).toBe('COMPLETED');
    expect(result.audit).toMatchObject({ state: 'COMPLETED' });
    expect(reconcileAccessState).toHaveBeenCalledWith('tenant-a', { requestId: 'access-binding:a1' });
    expect(audit.record).toHaveBeenCalledWith('tenant-a', 'ACCESS_STATE_CHANGED', 'customer_access_binding', 'a1', expect.objectContaining({ customerId: 'c1', previousState: 'PENDING', newState: 'ACTIVE' }), { userId: 'operator-1', requestId: 'req-1' });
    expect(txQuery).toHaveBeenCalledWith('BEGIN');
    expect(txQuery).toHaveBeenCalledWith('COMMIT');
    expect(txQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO access_state_events'))).toBe(true);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('keeps the committed access transition when network reconciliation fails', async () => {
    const txQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'a1', customer_id: 'c1', router_id: 'r1', state: 'ACTIVE', activated_at: new Date(), suspended_at: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 'a1', customer_id: 'c1', router_id: 'r1', state: 'SUSPENDED', activated_at: new Date(), suspended_at: new Date() }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const release = jest.fn();
    const connect = jest.fn().mockResolvedValue({ query: txQuery, release });
    const reconcileAccessState = jest.fn().mockRejectedValue(new Error('router timeout'));
    const service = new IspOperationsService({ connect } as any, { reconcileAccessState } as any, audit as any);

    const result = await service.changeAccessState('tenant-a', 'a1', { state: 'SUSPENDED', reason: 'Account suspended' });

    expect(result).toMatchObject({ state: 'SUSPENDED' });
    expect(result.reconciliation).toMatchObject({ state: 'FAILED', error: 'router timeout' });
    expect(audit.record).toHaveBeenCalled();
    expect(txQuery).toHaveBeenCalledWith('COMMIT');
    expect(txQuery).not.toHaveBeenCalledWith('ROLLBACK');
    expect(reconcileAccessState).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('reports audit failure without pretending the committed access state rolled back', async () => {
    audit.record.mockRejectedValue(new Error('audit database unavailable'));
    const txQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'a1', customer_id: 'c1', router_id: 'r1', state: 'PENDING', activated_at: null, suspended_at: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 'a1', customer_id: 'c1', router_id: 'r1', state: 'ACTIVE', activated_at: new Date(), suspended_at: null }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const release = jest.fn(); const connect = jest.fn().mockResolvedValue({ query: txQuery, release });
    const service = new IspOperationsService({ connect } as any, { reconcileAccessState: jest.fn().mockResolvedValue({ expiredGrants: 0, sessions: [] }) } as any, audit as any);

    const result = await service.changeAccessState('tenant-a', 'a1', { state: 'ACTIVE', reason: 'Activation' });

    expect(result).toMatchObject({ state: 'ACTIVE' });
    expect(result.audit).toMatchObject({ state: 'FAILED', error: 'audit database unavailable' });
    expect(txQuery).toHaveBeenCalledWith('COMMIT');
    expect(txQuery).not.toHaveBeenCalledWith('ROLLBACK');
  });

  it('clears a stale suspension timestamp when an active binding is resumed', async () => {
    const suspendedAt = new Date('2026-09-17T18:00:00.000Z');
    const txQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'a1', customer_id: 'c1', router_id: 'r1', state: 'SUSPENDED', activated_at: new Date('2026-09-17T10:00:00.000Z'), suspended_at: suspendedAt }] })
      .mockResolvedValueOnce({ rows: [{ id: 'a1', customer_id: 'c1', router_id: 'r1', state: 'ACTIVE', activated_at: new Date('2026-09-17T10:00:00.000Z'), suspended_at: null }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const release = jest.fn(); const connect = jest.fn().mockResolvedValue({ query: txQuery, release });
    const service = new IspOperationsService({ connect } as any, { reconcileAccessState: jest.fn().mockResolvedValue({ expiredGrants: 0, sessions: [] }) } as any, audit as any);

    const result = await service.changeAccessState('tenant-a', 'a1', { state: 'ACTIVE', reason: 'Service restored' });

    expect(result).toMatchObject({ state: 'ACTIVE', suspendedAt: null });
    const updateCall = txQuery.mock.calls.find(([sql]) => String(sql).includes('UPDATE customer_access_bindings SET'));
    expect(updateCall?.[1]?.[4]).toBeNull();
    expect(txQuery).toHaveBeenCalledWith('COMMIT');
  });

  it('rejects a missing network job before issuing an update', async () => {
    const txQuery = jest.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const release = jest.fn(); const connect = jest.fn().mockResolvedValue({ query: txQuery, release });
    const service = new IspOperationsService({ connect } as any, {} as any, audit as any);
    await expect(service.updateJob('tenant-a', 'missing', { status: 'COMPLETED' }, 'user-a')).rejects.toThrow('Network job not found');
    expect(txQuery).toHaveBeenCalledWith('ROLLBACK'); expect(release).toHaveBeenCalledTimes(1);
  });
});
