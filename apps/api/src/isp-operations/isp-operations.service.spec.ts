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
  it('syncs offline job updates idempotently in a tenant-scoped transaction', async () => {
    const tenantId = '00000000-0000-4000-8000-000000000001';
    const jobId = '00000000-0000-4000-8000-000000000002';
    const operationId = '00000000-0000-4000-8000-000000000003';
    const txQuery = jest.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ operation_id: operationId }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: jobId, status: 'OPEN' }], rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({});
    const release = jest.fn();
    const service = new IspOperationsService({ connect: jest.fn().mockResolvedValue({ query: txQuery, release }) } as any, {} as any, audit as any);

    const result = await service.syncOfflineOperations(tenantId, '00000000-0000-4000-8000-000000000004', {
      operations: [{ operationId, jobId, operationType: 'STATUS_CHANGED' as any, expectedStatus: 'OPEN' as any, status: 'IN_PROGRESS' as any }],
    }, { requestId: 'sync-1' });

    expect(result).toMatchObject({ acceptedCount: 1, replayedCount: 0, results: [{ operationId, jobId, accepted: true, replayed: false }] });
    expect(txQuery).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(txQuery.mock.calls.some(([sql]) => String(sql).includes('WHERE tenant_id=$1 AND id=$2 FOR UPDATE'))).toBe(true);
    expect(txQuery.mock.calls.some(([sql]) => String(sql).includes('UPDATE network_jobs'))).toBe(true);
    expect(txQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO audit_logs'))).toBe(true);
    expect(txQuery).toHaveBeenLastCalledWith('COMMIT');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('returns a prior receipt for a replayed offline operation without reapplying it', async () => {
    const tenantId = '00000000-0000-4000-8000-000000000001';
    const jobId = '00000000-0000-4000-8000-000000000002';
    const operationId = '00000000-0000-4000-8000-000000000003';
    const txQuery = jest.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ jobId, operationType: 'NOTE_ADDED', result: { operationId, jobId, accepted: true } }], rowCount: 1 })
      .mockResolvedValueOnce({});
    const release = jest.fn();
    const service = new IspOperationsService({ connect: jest.fn().mockResolvedValue({ query: txQuery, release }) } as any, {} as any, audit as any);

    const result = await service.syncOfflineOperations(tenantId, '00000000-0000-4000-8000-000000000004', {
      operations: [{ operationId, jobId, operationType: 'NOTE_ADDED' as any, note: 'Photo taken at site' }],
    });

    expect(result).toMatchObject({ acceptedCount: 0, replayedCount: 1, results: [{ operationId, replayed: true }] });
    expect(txQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO network_job_events'))).toBe(false);
    expect(txQuery).toHaveBeenLastCalledWith('COMMIT');
  });

  it('rejects an image whose MIME type does not match its file signature', async () => {
    const connect = jest.fn();
    const service = new IspOperationsService({ connect } as any, {} as any, audit as any);
    await expect(service.uploadJobAttachment('tenant-1', 'job-1', 'user-1', {
      originalname: 'fake.png', mimetype: 'image/png', buffer: Buffer.from('not a png'), size: 9,
    })).rejects.toThrow('Only valid JPEG, PNG or WebP image files are accepted');
    expect(connect).not.toHaveBeenCalled();
  });

});
