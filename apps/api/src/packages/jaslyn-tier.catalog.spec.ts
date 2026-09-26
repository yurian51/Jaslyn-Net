import { getJaslynTier, JASLYN_TIER_CATALOG } from './jaslyn-tier.catalog';

describe('Jaslyn tier catalog', () => {
  it('contains the eight ordered branded tiers', () => {
    expect(JASLYN_TIER_CATALOG.map((tier) => tier.code)).toEqual([
      'SPARK', 'PULSE', 'FLOW', 'NEXUS', 'ORBIT', 'APEX', 'TITAN', 'INFINITY',
    ]);
    expect(JASLYN_TIER_CATALOG.map((tier) => tier.rank)).toEqual([1,2,3,4,5,6,7,8]);
  });

  it('resolves tiers case-insensitively', () => {
    expect(getJaslynTier('nexus')?.name).toBe('Jaslyn Nexus');
    expect(getJaslynTier('INFINITY')?.code).toBe('INFINITY');
    expect(getJaslynTier('unknown')).toBeUndefined();
  });

  it('keeps Infinity unlimited while bounded tiers have data limits', () => {
    expect(getJaslynTier('INFINITY')?.dataLimitBytes).toBeNull();
    expect(getJaslynTier('SPARK')?.dataLimitBytes).toBeGreaterThan(0);
  });

  it('keeps tier capability progression monotonic for the core control features', () => {
    const core = ['hotspot','captivePortal','vouchers','usageTracking'] as const;
    for (const tier of JASLYN_TIER_CATALOG) {
      for (const feature of core) expect(tier.featureFlags[feature]).toBe(true);
    }
    expect(getJaslynTier('NEXUS')?.featureFlags.radius).toBe(true);
    expect(getJaslynTier('ORBIT')?.featureFlags.automation).toBe(true);
    expect(getJaslynTier('APEX')?.featureFlags.loadBalancing).toBe(true);
    expect(getJaslynTier('TITAN')?.featureFlags.multiLocation).toBe(true);
    expect(getJaslynTier('INFINITY')?.featureFlags.advancedNetworkControl).toBe(true);
  });
});
