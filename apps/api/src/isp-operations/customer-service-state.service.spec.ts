import { BadRequestException } from '@nestjs/common';
import { CustomerServiceStateService } from './customer-service-state.service';

describe('CustomerServiceStateService', () => {
  const sessions = { reconcileAccessState: jest.fn().mockResolvedValue({ expiredGrants: 0, sessions: [] }) };

  beforeEach(() => sessions.reconcileAccessState.mockClear());

  it('writes a state transition and history entry in one transaction', async () => {
    const txQuery = jest.fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{}] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ state: 'PENDING' }] })
      .mockResolvedValueOnce({ rows: [{ id: 's1', state: 'ACTIVE' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const release = jest.fn();
    const connect = jest.fn().mockResolvedValue({ query: txQuery, release });
    const service = new CustomerServiceStateService({ connect } as any, sessions as any);

    const result = await service.set('tenant-a', 'customer-a', { state: 'ACTIVE', reason: 'Payment verified' });

    expect(result).toMatchObject({ id: 's1', state: 'ACTIVE' });
    expect(txQuery.mock.calls.some(([sql]) => String(sql).includes('customer_service_state_events'))).toBe(true);
    expect(txQuery).toHaveBeenCalledWith('COMMIT');
    expect(sessions.reconcileAccessState).toHaveBeenCalledWith('tenant-a', { requestId: 'service-state:customer-a' });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('rejects an expiry at or before the effective time before opening a transaction', async () => {
    const connect = jest.fn();
    const service = new CustomerServiceStateService({ connect } as any, sessions as any);

    await expect(service.set('tenant-a', 'customer-a', {
      state: 'ACTIVE', reason: 'Payment verified', effectiveAt: '2026-09-17T10:00:00Z', expiresAt: '2026-09-17T10:00:00Z',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(connect).not.toHaveBeenCalled();
  });

  it('does not create a duplicate history event for a no-op state update', async () => {
    const txQuery = jest.fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{}] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ state: 'ACTIVE' }] })
      .mockResolvedValueOnce({ rows: [{ id: 's1', state: 'ACTIVE' }] })
      .mockResolvedValueOnce({ rows: [] });
    const release = jest.fn();
    const connect = jest.fn().mockResolvedValue({ query: txQuery, release });
    const service = new CustomerServiceStateService({ connect } as any, sessions as any);

    await service.set('tenant-a', 'customer-a', { state: 'ACTIVE', reason: 'Refresh' });

    expect(txQuery.mock.calls.some(([sql]) => String(sql).includes('customer_service_state_events'))).toBe(false);
    expect(txQuery).toHaveBeenCalledWith('COMMIT');
    expect(sessions.reconcileAccessState).toHaveBeenCalledWith('tenant-a', { requestId: 'service-state:customer-a' });
  });
});
