import { BadRequestException } from '@nestjs/common';
import { CustomerServiceStateService } from './customer-service-state.service';

describe('CustomerServiceStateService', () => {
  const sessions = { reconcileAccessState: jest.fn().mockResolvedValue({ expiredGrants: 0, sessions: [] }) };
  const audit = { record: jest.fn().mockResolvedValue({ id: 'audit-1', createdAt: new Date() }) };

  beforeEach(() => {
    sessions.reconcileAccessState.mockReset();
    audit.record.mockReset();
    audit.record.mockResolvedValue({ id: 'audit-1', createdAt: new Date() });
  });

  it('writes a state transition and history entry in one transaction', async () => {
    sessions.reconcileAccessState.mockResolvedValue({ expiredGrants: 0, sessions: [] });
    const txQuery = jest.fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{}] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ state: 'PENDING' }] })
      .mockResolvedValueOnce({ rows: [{ id: 's1', state: 'ACTIVE' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const release = jest.fn();
    const connect = jest.fn().mockResolvedValue({ query: txQuery, release });
    const service = new CustomerServiceStateService({ connect } as any, sessions as any, audit as any);

    const result = await service.set('tenant-a', 'customer-a', { state: 'ACTIVE', reason: 'Payment verified' }, { userId: 'operator-1', requestId: 'req-1' });

    expect(result).toMatchObject({ id: 's1', state: 'ACTIVE' });
    expect(txQuery.mock.calls.some(([sql]) => String(sql).includes('customer_service_state_events'))).toBe(true);
    expect(txQuery).toHaveBeenCalledWith('COMMIT');
    expect(sessions.reconcileAccessState).toHaveBeenCalledWith('tenant-a', { requestId: 'service-state:customer-a' });
    expect(audit.record).toHaveBeenCalledWith('tenant-a', 'CUSTOMER_SERVICE_STATE_CHANGED', 'customer_service_state', 's1', expect.objectContaining({ customerId: 'customer-a', previousState: 'PENDING', newState: 'ACTIVE' }), { userId: 'operator-1', requestId: 'req-1' });
    expect(result.audit).toMatchObject({ state: 'COMPLETED' });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('preserves a committed service state when network reconciliation fails', async () => {
    const reconciliationError = new Error('router timeout');
    sessions.reconcileAccessState.mockRejectedValue(reconciliationError);
    const txQuery = jest.fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{}] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ state: 'ACTIVE' }] })
      .mockResolvedValueOnce({ rows: [{ id: 's1', state: 'SUSPENDED' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const release = jest.fn();
    const connect = jest.fn().mockResolvedValue({ query: txQuery, release });
    const service = new CustomerServiceStateService({ connect } as any, sessions as any, audit as any);

    const result = await service.set('tenant-a', 'customer-a', { state: 'SUSPENDED', reason: 'Non-payment' });

    expect(result).toMatchObject({ id: 's1', state: 'SUSPENDED' });
    expect(result.reconciliation).toMatchObject({ state: 'FAILED', error: 'router timeout' });
    expect(txQuery).toHaveBeenCalledWith('COMMIT');
    expect(txQuery).not.toHaveBeenCalledWith('ROLLBACK');
    expect(audit.record).toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('preserves a committed state when audit persistence fails', async () => {
    audit.record.mockRejectedValue(new Error('audit database unavailable'));
    const txQuery = jest.fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{}] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ state: 'PENDING' }] })
      .mockResolvedValueOnce({ rows: [{ id: 's1', state: 'ACTIVE' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const release = jest.fn();
    const connect = jest.fn().mockResolvedValue({ query: txQuery, release });
    const service = new CustomerServiceStateService({ connect } as any, sessions as any, audit as any);

    const result = await service.set('tenant-a', 'customer-a', { state: 'ACTIVE', reason: 'Activation' });

    expect(result).toMatchObject({ id: 's1', state: 'ACTIVE' });
    expect(result.audit).toMatchObject({ state: 'FAILED', error: 'audit database unavailable' });
    expect(txQuery).toHaveBeenCalledWith('COMMIT');
    expect(txQuery).not.toHaveBeenCalledWith('ROLLBACK');
  });

  it('rolls back when the database transaction itself fails', async () => {
    const txQuery = jest.fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{}] })
      .mockRejectedValueOnce(new Error('database unavailable'));
    const release = jest.fn();
    const connect = jest.fn().mockResolvedValue({ query: txQuery, release });
    const service = new CustomerServiceStateService({ connect } as any, sessions as any, audit as any);

    await expect(service.set('tenant-a', 'customer-a', { state: 'ACTIVE', reason: 'Activation' })).rejects.toThrow('database unavailable');
    expect(txQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(sessions.reconcileAccessState).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('rejects an expiry at or before the effective time before opening a transaction', async () => {
    const connect = jest.fn();
    const service = new CustomerServiceStateService({ connect } as any, sessions as any, audit as any);

    await expect(service.set('tenant-a', 'customer-a', {
      state: 'ACTIVE', reason: 'Payment verified', effectiveAt: '2026-09-17T10:00:00Z', expiresAt: '2026-09-17T10:00:00Z',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(connect).not.toHaveBeenCalled();
  });

  it('does not create a duplicate history event for a no-op state update', async () => {
    sessions.reconcileAccessState.mockResolvedValue({ expiredGrants: 0, sessions: [] });
    const txQuery = jest.fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{}] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ state: 'ACTIVE' }] })
      .mockResolvedValueOnce({ rows: [{ id: 's1', state: 'ACTIVE' }] })
      .mockResolvedValueOnce({ rows: [] });
    const release = jest.fn(); const connect = jest.fn().mockResolvedValue({ query: txQuery, release });
    const service = new CustomerServiceStateService({ connect } as any, sessions as any, audit as any);

    await service.set('tenant-a', 'customer-a', { state: 'ACTIVE', reason: 'Refresh' });

    expect(txQuery.mock.calls.some(([sql]) => String(sql).includes('customer_service_state_events'))).toBe(false);
    expect(txQuery).toHaveBeenCalledWith('COMMIT');
    expect(sessions.reconcileAccessState).toHaveBeenCalledWith('tenant-a', { requestId: 'service-state:customer-a' });
    expect(audit.record).toHaveBeenCalled();
  });
});
