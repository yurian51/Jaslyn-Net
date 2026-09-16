import { compileNetworkPolicy, toRadiusPolicyAttributes } from './network-policy.compiler';

describe('network policy compiler', () => {
  it('creates a vendor-neutral snapshot from a commercial plan', () => {
    const policy = compileNetworkPolicy({
      packageId: 'pkg-1',
      name: '10 Mbps / 20 GB / 7 days',
      durationSeconds: 604800,
      dataLimitBytes: 20_000_000_000,
      downloadBps: 10_000_000,
      uploadBps: 5_000_000,
    });

    expect(policy.version).toBe(1);
    expect(policy.validity.durationSeconds).toBe(604800);
    expect(policy.quota.dataLimitBytes).toBe(20_000_000_000);
    expect(policy.bandwidth.downloadBps).toBe(10_000_000);
    expect(policy.bandwidth.uploadBps).toBe(5_000_000);
    expect(policy.capabilities.quotaEnforcement).toBe(true);
    expect(policy.capabilities.bandwidthEnforcement).toBe(true);
    expect(policy.capabilities.coaCompatible).toBe(true);
  });

  it('maps normalized policy to deterministic RADIUS attributes', () => {
    const policy = compileNetworkPolicy({
      packageId: 'pkg-1',
      durationSeconds: 3600,
      downloadBps: 10_000_000,
      uploadBps: 2_000_000,
    });
    expect(toRadiusPolicyAttributes(policy)).toEqual({
      'Session-Timeout': 3600,
      'Acct-Interim-Interval': 180,
      'Mikrotik-Rate-Limit': '2000k/10000k',
    });
  });

  it('never emits a RADIUS interim interval below the protocol minimum', () => {
    const policy = compileNetworkPolicy({
      packageId: 'pkg-short',
      durationSeconds: 30,
    });
    expect(policy.session.interimUpdateSeconds).toBe(60);
    expect(toRadiusPolicyAttributes(policy)['Acct-Interim-Interval']).toBe(60);
  });

  it('rejects invalid commercial validity instead of emitting an unsafe policy', () => {
    expect(() => compileNetworkPolicy({ packageId: 'pkg-1', durationSeconds: 0 })).toThrow();
    expect(() => compileNetworkPolicy({ packageId: '', durationSeconds: 3600 })).toThrow();
  });
});
