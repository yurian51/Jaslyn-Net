import { IspOperationsService } from './isp-operations.service';

describe('IspOperationsService', () => {
  it('scopes access bindings to the authenticated tenant', async () => {
    const query = jest.fn().mockResolvedValueOnce({ rows: [{ id: 'a1' }] }).mockResolvedValueOnce({ rows: [{ count: 1 }] });
    const service = new IspOperationsService({ query } as any);
    const result = await service.listAccessBindings('tenant-a', { page: 1, limit: 25 });
    expect(result.data).toEqual([{ id: 'a1' }]);
    expect(query.mock.calls[0][1]).toEqual(['tenant-a', null, 25, 0]);
    expect(query.mock.calls[1][1]).toEqual(['tenant-a', null]);
  });

  it('records an access state transition atomically', async () => {
    const txQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'a1', state: 'PENDING', activated_at: null, suspended_at: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 'a1', state: 'ACTIVE', activated_at: new Date(), suspended_at: null }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const release = jest.fn(); const connect = jest.fn().mockResolvedValue({ query: txQuery, release });
    const service = new IspOperationsService({ connect } as any);
    const result = await service.changeAccessState('tenant-a', 'a1', { state: 'ACTIVE', reason: 'Payment verified' });
    expect(result.state).toBe('ACTIVE'); expect(txQuery).toHaveBeenCalledWith('BEGIN'); expect(txQuery).toHaveBeenCalledWith('COMMIT');
    expect(txQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO access_state_events'))).toBe(true); expect(release).toHaveBeenCalledTimes(1);
  });

  it('rejects a missing network job before issuing an update', async () => {
    const txQuery = jest.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const release = jest.fn(); const connect = jest.fn().mockResolvedValue({ query: txQuery, release });
    const service = new IspOperationsService({ connect } as any);
    await expect(service.updateJob('tenant-a', 'missing', { status: 'COMPLETED' }, 'user-a')).rejects.toThrow('Network job not found');
    expect(txQuery).toHaveBeenCalledWith('ROLLBACK'); expect(release).toHaveBeenCalledTimes(1);
  });
});
