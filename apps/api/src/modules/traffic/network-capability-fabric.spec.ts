import { ConfigService } from '@nestjs/config';
import {
  FreeRadiusCapabilityAdapter,
  MikroTikCapabilityAdapter,
  NetworkCapabilityRegistry,
  OpenWrtCapabilityAdapter,
  TypedProviderError,
  normalizeProviderError,
} from './network-capability-fabric';

describe('NetworkCapabilityRegistry', () => {
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

  it('exposes the exact provider discovery boundary without leaking vendor commands', () => {
    const discovery = registry.discover();
    expect(discovery.map((entry) => entry.provider)).toEqual([
      'MIKROTIK', 'OMADA', 'OPENWRT', 'OPNSENSE', 'FREERADIUS', 'OPENNDS', 'PACKETFENCE',
    ]);
    expect(discovery.find((entry) => entry.provider === 'MIKROTIK')?.supportedCapabilities.map((x) => x.capability))
      .toEqual(expect.arrayContaining(['SESSION.LIST','SESSION.INSPECT','SESSION.DISCONNECT','BANDWIDTH.LIMIT','BANDWIDTH.RESTORE','HOTSPOT.SESSIONS']));
    expect(discovery.find((entry) => entry.provider === 'OMADA')?.supportedCapabilities).toEqual([]);
  });

  it('returns typed schema metadata before execution', () => {
    expect(registry.schema('MIKROTIK', 'SESSION.DISCONNECT', 'session.disconnect')).toMatchObject({
      capability: 'SESSION.DISCONNECT',
      risk: 'HIGH_RISK',
      permission: 'network.session.disconnect',
      timeoutMs: 5000,
    });
  });

  it('normalizes provider timeout failures', () => {
    const error = normalizeProviderError(new Error('provider request timed out'), 'MIKROTIK', 'session.disconnect');
    expect(error).toBeInstanceOf(TypedProviderError);
    expect(error.code).toBe('PROVIDER_TIMEOUT');
    expect(error.retryable).toBe(true);
  });

  it('never treats a provider disconnect without confirmation as success', async () => {
    mikrotik.disconnect.mockResolvedValue([{ disconnected: false, details: { reason: 'not-found' } }]);
    const result = await registry.execute(
      'MIKROTIK',
      'SESSION.DISCONNECT',
      'session.disconnect',
      { routerId: 'r1' },
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
      { tenantId: 't1', routerId: 'r1' },
    );
    expect(result.status).toBe('FAILED');
    expect(result.confirmed).toBe(false);
    expect(result.error?.code).toBe('PROVIDER_EXECUTION_UNCONFIRMED');
  });

  it('returns normalized OpenWrt telemetry only from the existing adapter', async () => {
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
  });

  it('fails closed for named providers without a registered execution adapter', async () => {
    for (const provider of ['OMADA','OPNSENSE','OPENNDS','PACKETFENCE'] as const) {
      const result = await registry.execute(provider, 'DEVICE.REBOOT', 'device.reboot', {}, { tenantId: 't1', permissions: ['network.session.disconnect'] });
      expect(result.status).toBe('UNAVAILABLE');
      expect(result.confirmed).toBe(false);
      expect(result.error?.code).toBe('UNSUPPORTED_CAPABILITY');
    }
  });
});
