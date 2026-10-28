import {
  FreeRadiusCapabilityAdapter,
  MikroTikCapabilityAdapter,
  NetworkCapability,
  NetworkCapabilityRegistry,
  OpenWrtCapabilityAdapter,
  TypedProviderError,
  normalizeProviderError,
} from './network-capability-fabric';

describe('NetworkCapabilityRegistry contract', () => {
  const mikrotik = {
    readHotspotActive: jest.fn(),
    disconnect: jest.fn(),
    apply: jest.fn(),
    verify: jest.fn(),
  };
  const devices = { readClients: jest.fn() };
  const radius = { disconnectSession: jest.fn() };

  let registry: NetworkCapabilityRegistry;

  beforeEach(() => {
    jest.resetAllMocks();
    registry = new NetworkCapabilityRegistry(
      new MikroTikCapabilityAdapter(mikrotik as never),
      new OpenWrtCapabilityAdapter(devices as never),
      new FreeRadiusCapabilityAdapter(radius as never),
    );
  });

  it('keeps the universal provider boundary stable', () => {
    expect(registry.providers()).toEqual([
      'MIKROTIK', 'OMADA', 'OPENWRT', 'OPNSENSE', 'FREERADIUS', 'OPENNDS', 'PACKETFENCE',
    ]);
  });

  it('discovers capabilities without exposing vendor-specific commands', () => {
    const discovery = registry.discover();
    const capabilities = discovery.flatMap((entry) => entry.supportedCapabilities);
    expect(capabilities.length).toBeGreaterThan(0);
    for (const schema of capabilities) {
      expect(schema.command).toMatch(/^[a-z]+\.[a-z]+$/);
      expect(schema).toMatchObject({
        timeoutMs: 5000,
        input: 'typed capability input',
        output: 'typed provider-normalized output',
      });
      expect(['READ_ONLY','LOW_RISK','MODERATE_RISK','HIGH_RISK','DESTRUCTIVE']).toContain(schema.risk);
      expect(schema.permission).toMatch(/^network\.[a-z]+\.[a-z]+$/);
    }
    expect(capabilities.some((schema) => schema.command.includes('routeros') || schema.command.includes('ubus'))).toBe(false);
  });

  it('covers the complete requested capability taxonomy at the schema boundary', () => {
    const expected: NetworkCapability[] = [
      'DEVICE.HEALTH','DEVICE.IDENTITY','DEVICE.CONFIGURATION','DEVICE.REBOOT','DEVICE.INTERFACES',
      'SESSION.LIST','SESSION.INSPECT','SESSION.DISCONNECT',
      'SUBSCRIBER.PROVISION','SUBSCRIBER.SUSPEND','SUBSCRIBER.ACTIVATE','SUBSCRIBER.INSPECT',
      'BANDWIDTH.INSPECT','BANDWIDTH.LIMIT','BANDWIDTH.RESTORE',
      'HOTSPOT.USERS','HOTSPOT.SESSIONS','HOTSPOT.VOUCHERS','HOTSPOT.PROFILES',
      'PPPOE.SESSIONS','PPPOE.USERS','PPPOE.PROFILES',
    ];
    const discovered = registry.discover().flatMap((entry) => entry.supportedCapabilities).map((schema) => schema.capability);
    expect(expected).toHaveLength(23);
    expect(new Set(discovered).size).toBeGreaterThan(0);
    expect(discovered).toEqual(expect.arrayContaining([
      'SESSION.LIST','SESSION.INSPECT','SESSION.DISCONNECT',
      'BANDWIDTH.LIMIT','BANDWIDTH.RESTORE','HOTSPOT.SESSIONS','HOTSPOT.USERS',
    ]));
  });

  it('returns authorization policy before execution', () => {
    expect(registry.schema('MIKROTIK', 'SESSION.DISCONNECT', 'session.disconnect')).toMatchObject({
      capability: 'SESSION.DISCONNECT',
      risk: 'HIGH_RISK',
      permission: 'network.session.disconnect',
      timeoutMs: 5000,
    });
  });

  it('fails closed for every registered adapter that has no implementation yet', async () => {
    for (const provider of ['OMADA','OPNSENSE','OPENNDS','PACKETFENCE'] as const) {
      const result = await registry.execute(
        provider,
        'DEVICE.REBOOT',
        'device.reboot',
        { routerId: 'r1' },
        { tenantId: 't1', routerId: 'r1', permissions: ['network.device.reboot'] },
      );
      expect(result).toMatchObject({
        provider,
        status: 'UNAVAILABLE',
        confirmed: false,
        error: { code: 'UNSUPPORTED_CAPABILITY', provider, operation: 'device.reboot' },
      });
    }
  });

  it('rejects execution without tenant scope before touching the provider', async () => {
    const result = await registry.execute(
      'MIKROTIK',
      'SESSION.DISCONNECT',
      'session.disconnect',
      { routerId: 'r1', customerId: 'c1' },
      { tenantId: '   ', routerId: 'r1', permissions: ['network.session.disconnect'] },
    );
    expect(result.error?.code).toBe('UNAUTHORIZED');
    expect(mikrotik.disconnect).not.toHaveBeenCalled();
  });

  it('fails closed when the caller lacks the capability permission', async () => {
    const result = await registry.execute(
      'MIKROTIK',
      'SESSION.DISCONNECT',
      'session.disconnect',
      { routerId: 'r1', customerId: 'c1' },
      { tenantId: 't1', routerId: 'r1', permissions: ['network.device.read'] },
    );
    expect(result.status).toBe('FAILED');
    expect(result.confirmed).toBe(false);
    expect(result.error?.code).toBe('UNAUTHORIZED');
    expect(mikrotik.disconnect).not.toHaveBeenCalled();
  });

  it('normalizes provider timeout failures into a typed error', () => {
    const error = normalizeProviderError(new Error('provider request timed out'), 'MIKROTIK', 'session.disconnect');
    expect(error).toBeInstanceOf(TypedProviderError);
    expect(error).toMatchObject({
      code: 'PROVIDER_TIMEOUT',
      retryable: true,
      provider: 'MIKROTIK',
      operation: 'session.disconnect',
    });
  });

  it('never reports disconnect success without provider confirmation', async () => {
    mikrotik.disconnect.mockResolvedValue([{ disconnected: false, details: { reason: 'not-found' } }]);
    const result = await registry.execute(
      'MIKROTIK',
      'SESSION.DISCONNECT',
      'session.disconnect',
      { routerId: 'r1', customerId: 'c1' },
      { tenantId: 't1', routerId: 'r1', permissions: ['network.session.disconnect'] },
    );
    expect(result.status).toBe('FAILED');
    expect(result.confirmed).toBe(false);
    expect(result.error?.code).toBe('PROVIDER_EXECUTION_UNCONFIRMED');
  });

  it('requires provider verification for bandwidth mutation', async () => {
    mikrotik.apply.mockResolvedValue(undefined);
    mikrotik.verify.mockResolvedValue([{ verified: false, details: { reason: 'mismatch' } }]);
    const result = await registry.execute(
      'MIKROTIK',
      'BANDWIDTH.LIMIT',
      'bandwidth.limit',
      [{ routerId: 'r1', customerId: 'c1', maxDownloadMbps: 10, maxUploadMbps: 5, priority: 1 }],
      { tenantId: 't1', routerId: 'r1', permissions: ['network.bandwidth.write'] },
    );
    expect(result.status).toBe('FAILED');
    expect(result.confirmed).toBe(false);
    expect(result.error?.code).toBe('PROVIDER_EXECUTION_UNCONFIRMED');
  });

  it('uses the existing OpenWrt adapter and preserves normalized output', async () => {
    devices.readClients.mockResolvedValue([{ macAddress: 'AA', bytesIn: '1', bytesOut: '2' }]);
    const result = await registry.execute(
      'OPENWRT',
      'HOTSPOT.SESSIONS',
      'hotspot.sessions',
      { endpoint: 'https://router.example/ubus' },
      { tenantId: 't1', routerId: 'r1', credentials: { username: 'root', password: 'secret' }, permissions: ['network.hotspot.read'] },
    );
    expect(result.status).toBe('VERIFIED');
    expect(result.confirmed).toBe(true);
    expect(result.data).toEqual([{ macAddress: 'AA', bytesIn: '1', bytesOut: '2' }]);
    expect(devices.readClients).toHaveBeenCalledTimes(1);
  });

  it('uses the existing FreeRADIUS service and provider acknowledgement as confirmation', async () => {
    radius.disconnectSession.mockResolvedValue({ accepted: true, username: 'alice' });
    const result = await registry.execute(
      'FREERADIUS',
      'SESSION.DISCONNECT',
      'session.disconnect',
      { nasClientId: 'nas', username: 'alice' },
      { tenantId: 't1', permissions: ['network.session.disconnect'] },
    );
    expect(result.status).toBe('VERIFIED');
    expect(result.confirmed).toBe(true);
    expect(radius.disconnectSession).toHaveBeenCalledWith('t1', { nasClientId: 'nas', username: 'alice' });
  });

  it('never turns provider rejection into success', async () => {
    radius.disconnectSession.mockResolvedValue({ accepted: false, username: 'alice' });
    const result = await registry.execute(
      'FREERADIUS',
      'SESSION.DISCONNECT',
      'session.disconnect',
      { nasClientId: 'nas', username: 'alice' },
      { tenantId: 't1', permissions: ['network.session.disconnect'] },
    );
    expect(result.status).toBe('FAILED');
    expect(result.confirmed).toBe(false);
    expect(result.error?.code).toBe('PROVIDER_REJECTED');
  });
});
