import { TrafficCollectorService } from './traffic-collector.service';

describe('TrafficCollectorService', () => {
  it('maps MikroTik hotspot counters to the tenant-scoped active session', async () => {
    const db = { query: jest.fn() } as any;
    db.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'router-1', tenantId: 'tenant-1', apiEndpoint: 'https://router.example/rest' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'session-1', customerId: 'customer-1', username: 'alice', ipAddress: '10.0.0.8' }] })
      .mockResolvedValueOnce({ rowCount: 1 });
    const config = { get: jest.fn().mockReturnValue('30') } as any;
    const adapter = {
      readHotspotActive: jest.fn().mockResolvedValue([{
        user: 'alice', address: '10.0.0.8', 'bytes-in': '9007199254740992000', 'bytes-out': '1234567890123456789',
      }]),
    } as any;
    const samples = { record: jest.fn().mockResolvedValue({ id: 'sample-1' }) } as any;

    const service = new TrafficCollectorService(db, config, adapter, samples);
    const result = await service.collectAll();

    expect(result).toEqual({ routers: 1, samples: 1, errors: 0 });
    expect(samples.record).toHaveBeenCalledWith('tenant-1', expect.objectContaining({
      routerId: 'router-1', customerId: 'customer-1', sessionId: 'session-1',
      bytesIn: '9007199254740992000', bytesOut: '1234567890123456789',
      sampledAt: expect.any(Date),
    }));
  });

  it('skips unmatched hotspot users without creating cross-customer samples', async () => {
    const db = { query: jest.fn() } as any;
    db.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'router-1', tenantId: 'tenant-1', apiEndpoint: 'https://router.example/rest' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'session-1', customerId: 'customer-1', username: 'alice', ipAddress: '10.0.0.8' }] })
      .mockResolvedValueOnce({ rowCount: 1 });
    const adapter = { readHotspotActive: jest.fn().mockResolvedValue([{ user: 'bob', address: '10.0.0.99', 'bytes-in': '100', 'bytes-out': '200' }]) } as any;
    const samples = { record: jest.fn() } as any;
    const service = new TrafficCollectorService(db, { get: jest.fn().mockReturnValue('30') } as any, adapter, samples);

    const result = await service.collectAll();

    expect(result).toEqual({ routers: 1, samples: 0, errors: 0 });
    expect(samples.record).not.toHaveBeenCalled();
  });

  it('prevents overlapping collection runs', async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const db = { query: jest.fn().mockReturnValue(blocked) } as any;
    const service = new TrafficCollectorService(db, { get: jest.fn().mockReturnValue('30') } as any, {} as any, {} as any);

    const first = service.collectAll();
    const second = await service.collectAll();
    release();
    await first;

    expect(second).toEqual({ routers: 0, samples: 0, errors: 0 });
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});
