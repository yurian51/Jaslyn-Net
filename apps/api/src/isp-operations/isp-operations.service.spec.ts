import { IspOperationsService } from './isp-operations.service';

describe('IspOperationsService', () => {
  it('scopes access bindings to the authenticated tenant', async () => {
    const query = jest.fn().mockResolvedValueOnce({ rows: [{ id: 'a1' }] }).mockResolvedValueOnce({ rows: [{ count: 1 }] });
    const service = new IspOperationsService({ query } as any, {} as any);
    const result = await service.listAccessBindings('tenant-a', { page: 1, limit: 25 });
    expect(result.data).toEqual([{ id: 'a1' }]);
    expect(query.mock.calls[0][1]).toEqual(['tenant-a', null, 25, 0]);
    expect(query.mock.calls[1][1]).toEqual(['tenant-a', null]);
  });

  it('records an access state transition and reconciles live network access', async () => {
    const txQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'a1', state: 'PENDING', activated_at: null, suspended_at: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 'a1', state: 'ACTIVE', activated_at: new Date(), suspended_at: null }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const release = jest.fn();
    const connect = jest.fn().mockResolvedValue({ query: txQuery, release });
    const reconcileAccessState = jest.fn().mockResolvedValue({ expiredGrants: 0, sessions: [] });
    const service = new IspOperationsService({ connect } as any, { reconcileAccessState } as any);

    const result = await service.changeAccessState('tenant-a', 'a1', { state: 'ACTIVE', reason: 'Payment verified' });

    expect(result.state).toBe('ACTIVE');
    expect(reconcileAccessState).toHaveBeenCalledWith('tenant-a', { requestId: 'access-binding:a1' });
    expect(txQuery).toHaveBeenCalledWith('BEGIN');
    expect(txQuery).toHaveBeenCalledWith('COMMIT');
    expect(txQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO access_state_events'))).toBe(true);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('clears a stale suspension timestamp when an active binding is resumed', async () => {
    const suspendedAt = new Date('2026-09-17T18:00:00.000Z');
    const txQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'a1', state: 'SUSPENDED', activated_at: new Date('2026-09-17T10:00:00.000Z'), suspended_at: suspendedAt }] })
      .mockResolvedValueOnce({ rows: [{ id: 'a1', state: 'ACTIVE', activated_at: new Date('2026-09-17T10:00:00.000Z'), suspended_at: null }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const release = jest.fn(); const connect = jest.fn().mockResolvedValue({ query: txQuery, release });
    const service = new IspOperationsService({ connect } as any, { reconcileAccessState: jest.fn().mockResolvedValue({ expiredGrants: 0, sessions: [] }) } as any);

    const result = await service.changeAccessState('tenant-a', 'a1', { state: 'ACTIVE', reason: 'Service restored' });

    expect(result).toMatchObject({ state: 'ACTIVE', suspendedAt: null });
    const updateCall = txQuery.mock.calls.find(([sql]) => String(sql).includes('UPDATE customer_access_bindings SET'));
    expect(updateCall?.[1]?.[4]).toBeNull();
    expect(txQuery).toHaveBeenCalledWith('COMMIT');
  });

  it('rejects a missing network job before issuing an update', async () => {
    const txQuery = jest.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const release = jest.fn(); const connect = jest.fn().mockResolvedValue({ query: txQuery, release });
    const service = new IspOperationsService({ connect } as any, {} as any);
    await expect(service.updateJob('tenant-a', 'missing', { status: 'COMPLETED' }, 'user-a')).rejects.toThrow('Network job not found');
    expect(txQuery).toHaveBeenCalledWith('ROLLBACK'); expect(release).toHaveBeenCalledTimes(1);
  });
});
