import { CustomerServiceStateService } from './customer-service-state.service';

describe('CustomerServiceStateService', () => {
  it('writes a state transition and history entry in one transaction', async () => {
    const txQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{}] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ state: 'PENDING' }] })
      .mockResolvedValueOnce({ rows: [{ id: 's1', state: 'ACTIVE' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const release=jest.fn(); const connect=jest.fn().mockResolvedValue({query:txQuery,release});
    const service=new CustomerServiceStateService({connect} as any);
    const result=await service.set('tenant-a','customer-a',{state:'ACTIVE',reason:'Payment verified'});
    expect(result).toEqual({id:'s1',state:'ACTIVE'});
    expect(txQuery.mock.calls.some(([sql])=>String(sql).includes('customer_service_state_events'))).toBe(true);
    expect(txQuery).toHaveBeenCalledWith('COMMIT'); expect(release).toHaveBeenCalledTimes(1);
  });
});
