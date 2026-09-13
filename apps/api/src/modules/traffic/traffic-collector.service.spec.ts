import { TrafficCollectorService } from './traffic-collector.service';

describe('TrafficCollectorService', () => {
  const config = { get: jest.fn().mockReturnValue('30') } as any;

  it('maps vendor-neutral client counters to the tenant-scoped active session', async () => {
    const db = { query: jest.fn() } as any;
    db.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'router-1', tenantId: 'tenant-1', apiEndpoint: 'https://router.example/rest', managementProtocol: 'MIKROTIK_REST' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'session-1', customerId: 'customer-1', username: 'alice', ipAddress: '10.0.0.8' }] })
      .mockResolvedValueOnce({ rowCount: 1 });
    const devices = { readClients: jest.fn().mockResolvedValue([{ username: 'alice', address: '10.0.0.8', bytesIn: '9007199254740992000', bytesOut: '1234567890123456789' }]) } as any;
    const samples = { record: jest.fn().mockResolvedValue({ id: 'sample-1' }) } as any;
    const service = new TrafficCollectorService(db, config, devices, samples);

    const result = await service.collectAll();

    expect(result).toEqual({ routers: 1, samples: 1, errors: 0 });
    expect(devices.readClients).toHaveBeenCalledWith(expect.objectContaining({ routerId: 'router-1', protocol: 'MIKROTIK_REST' }));
    expect(samples.record).toHaveBeenCalledWith('tenant-1', expect.objectContaining({
      routerId: 'router-1', customerId: 'customer-1', sessionId: 'session-1',
      bytesIn: '9007199254740992000', bytesOut: '1234567890123456789', sampledAt: expect.any(Date),
    }));
  });

  it('collects normalized clients from a non-MikroTik management protocol', async () => {
    const db = { query: jest.fn() } as any;
    db.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'router-2', tenantId: 'tenant-2', controllerEndpoint: 'https://controller.example/api/clients', managementProtocol: 'UNIFI_NETWORK_API' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'session-2', customerId: 'customer-2', username: 'bob', ipAddress: '10.0.0.9' }] })
      .mockResolvedValueOnce({ rowCount: 1 });
    const devices = { readClients: jest.fn().mockResolvedValue([{ username: 'bob', address: '10.0.0.9', bytesIn: '1000', bytesOut: '2000' }]) } as any;
    const samples = { record: jest.fn().mockResolvedValue({ id: 'sample-2' }) } as any;
    const service = new TrafficCollectorService(db, config, devices, samples);

    const result = await service.collectAll();

    expect(result).toEqual({ routers: 1, samples: 1, errors: 0 });
    expect(devices.readClients).toHaveBeenCalledWith(expect.objectContaining({ protocol: 'UNIFI_NETWORK_API', controllerEndpoint: 'https://controller.example/api/clients' }));
  });

  it('skips unmatched clients without creating cross-customer samples', async () => {
    const db = { query: jest.fn() } as any;
    db.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'router-1', tenantId: 'tenant-1', apiEndpoint: 'https://router.example/rest', managementProtocol: 'MIKROTIK_REST' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'session-1', customerId: 'customer-1', username: 'alice', ipAddress: '10.0.0.8' }] })
      .mockResolvedValueOnce({ rowCount: 1 });
    const devices = { readClients: jest.fn().mockResolvedValue([{ username: 'bob', address: '10.0.0.99', bytesIn: '100', bytesOut: '200' }]) } as any;
    const samples = { record: jest.fn() } as any;
    const service = new TrafficCollectorService(db, config, devices, samples);

    const result = await service.collectAll();

    expect(result).toEqual({ routers: 1, samples: 0, errors: 0 });
    expect(samples.record).not.toHaveBeenCalled();
  });

  it('prevents overlapping collection runs', async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const db = { query: jest.fn().mockReturnValue(blocked) } as any;
    const service = new TrafficCollectorService(db, config, {} as any, {} as any);
    const first = service.collectAll();
    const second = await service.collectAll();
    release();
    await first;
    expect(second).toEqual({ routers: 0, samples: 0, errors: 0 });
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});
