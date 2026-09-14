import { TrafficCollectorService } from './traffic-collector.service';

describe('TrafficCollectorService', () => {
  const config = { get: jest.fn().mockReturnValue('30') } as any;

  function poolWithSequence(sequence: unknown[]) {
    const query = jest.fn();
    for (const value of sequence) query.mockResolvedValueOnce(value);
    const client = { query, release: jest.fn() };
    return { query: jest.fn(), connect: jest.fn().mockResolvedValue(client), client } as any;
  }

  it('maps vendor-neutral client counters to the tenant-scoped active session', async () => {
    const db = poolWithSequence([
      { rowCount: 1, rows: [{ locked: true }] },
      { rowCount: 1, rows: [{ id: 'router-1', tenantId: 'tenant-1', apiEndpoint: 'https://router.example/rest', managementProtocol: 'MIKROTIK_REST' }] },
      { rowCount: 1 },
    ]);
    db.query.mockResolvedValue({ rowCount: 1, rows: [{ id: 'session-1', customerId: 'customer-1', username: 'alice', ipAddress: '10.0.0.8', macAddress: null }] });
    const devices = { readClients: jest.fn().mockResolvedValue([{ username: 'alice', address: '10.0.0.8', bytesIn: '9007199254740992000', bytesOut: '1234567890123456789' }]) } as any;
    const samples = { record: jest.fn().mockResolvedValue({ id: 'sample-1' }) } as any;
    const service = new TrafficCollectorService(db, config, {} as any, devices, samples);

    const result = await service.collectAll();

    expect(result).toEqual({ routers: 1, samples: 1, errors: 0 });
    expect(devices.readClients).toHaveBeenCalledWith(expect.objectContaining({ routerId: 'router-1', protocol: 'MIKROTIK_REST' }));
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE routers SET active_users=$3'),
      ['tenant-1', 'router-1', 1],
    );
    expect(samples.record).toHaveBeenCalledWith('tenant-1', expect.objectContaining({
      routerId: 'router-1', customerId: 'customer-1', sessionId: 'session-1',
      bytesIn: '9007199254740992000', bytesOut: '1234567890123456789', sampledAt: expect.any(Date),
    }));
    expect(db.client.release).toHaveBeenCalledTimes(1);
  });

  it('matches Wi-Fi telemetry by normalized MAC before IP or username', async () => {
    const db = poolWithSequence([
      { rowCount: 1, rows: [{ locked: true }] },
      { rowCount: 1, rows: [{ id: 'router-3', tenantId: 'tenant-3', controllerEndpoint: 'https://controller.example', managementProtocol: 'MERAKI_DASHBOARD_API' }] },
      { rowCount: 1 },
    ]);
    db.query.mockResolvedValue({ rowCount: 1, rows: [{ id: 'session-3', customerId: 'customer-3', username: 'same', ipAddress: '10.0.0.20', macAddress: 'AA:BB:CC:DD:EE:FF' }] });
    const devices = { readClients: jest.fn().mockResolvedValue([{ username: 'same', address: '10.0.0.99', macAddress: 'aa-bb-cc-dd-ee-ff', bytesIn: '1000', bytesOut: '2000' }]) } as any;
    const samples = { record: jest.fn().mockResolvedValue({ id: 'sample-3' }) } as any;
    const service = new TrafficCollectorService(db, config, {} as any, devices, samples);

    const result = await service.collectAll();

    expect(result).toEqual({ routers: 1, samples: 1, errors: 0 });
    expect(samples.record).toHaveBeenCalledWith('tenant-3', expect.objectContaining({ sessionId: 'session-3', customerId: 'customer-3' }));
  });

  it('collects normalized clients from a non-MikroTik management protocol', async () => {
    const db = poolWithSequence([
      { rowCount: 1, rows: [{ locked: true }] },
      { rowCount: 1, rows: [{ id: 'router-2', tenantId: 'tenant-2', controllerEndpoint: 'https://controller.example/api/clients', managementProtocol: 'UNIFI_NETWORK_API' }] },
      { rowCount: 1 },
    ]);
    db.query.mockResolvedValue({ rowCount: 1, rows: [{ id: 'session-2', customerId: 'customer-2', username: 'bob', ipAddress: '10.0.0.9', macAddress: null }] });
    const devices = { readClients: jest.fn().mockResolvedValue([{ username: 'bob', address: '10.0.0.9', bytesIn: '1000', bytesOut: '2000' }]) } as any;
    const samples = { record: jest.fn().mockResolvedValue({ id: 'sample-2' }) } as any;
    const service = new TrafficCollectorService(db, config, {} as any, devices, samples);

    const result = await service.collectAll();

    expect(result).toEqual({ routers: 1, samples: 1, errors: 0 });
    expect(devices.readClients).toHaveBeenCalledWith(expect.objectContaining({ protocol: 'UNIFI_NETWORK_API', controllerEndpoint: 'https://controller.example/api/clients' }));
  });

  it('skips unmatched clients without creating cross-customer samples', async () => {
    const db = poolWithSequence([
      { rowCount: 1, rows: [{ locked: true }] },
      { rowCount: 1, rows: [{ id: 'router-1', tenantId: 'tenant-1', apiEndpoint: 'https://router.example/rest', managementProtocol: 'MIKROTIK_REST' }] },
      { rowCount: 1 },
    ]);
    db.query.mockResolvedValue({ rowCount: 1, rows: [{ id: 'session-1', customerId: 'customer-1', username: 'alice', ipAddress: '10.0.0.8', macAddress: 'AA:BB:CC:DD:EE:01' }] });
    const devices = { readClients: jest.fn().mockResolvedValue([{ username: 'bob', address: '10.0.0.99', bytesIn: '100', bytesOut: '200' }]) } as any;
    const samples = { record: jest.fn() } as any;
    const service = new TrafficCollectorService(db, config, {} as any, devices, samples);

    const result = await service.collectAll();

    expect(result).toEqual({ routers: 1, samples: 0, errors: 0 });
    expect(samples.record).not.toHaveBeenCalled();
  });

  it('skips a collection run when another API instance holds the PostgreSQL advisory lock', async () => {
    const db = poolWithSequence([{ rowCount: 1, rows: [{ locked: false }] }]);
    const service = new TrafficCollectorService(db, config, {} as any, {} as any, {} as any);

    const result = await service.collectAll();

    expect(result).toEqual({ routers: 0, samples: 0, errors: 0 });
    expect(db.client.release).toHaveBeenCalledTimes(1);
  });

  it('prevents overlapping collection runs in the same API process', async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const db = { query: jest.fn(), connect: jest.fn().mockReturnValue(blocked) } as any;
    const service = new TrafficCollectorService(db, config, {} as any, {} as any, {} as any);
    const first = service.collectAll();
    const second = await service.collectAll();
    release();
    await first;
    expect(second).toEqual({ routers: 0, samples: 0, errors: 0 });
    expect(db.connect).toHaveBeenCalledTimes(1);
  });
});
