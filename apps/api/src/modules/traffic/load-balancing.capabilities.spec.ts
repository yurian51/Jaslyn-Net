import { hasWanRoutingCapability } from './load-balancing.capabilities';

describe('WAN routing capability gating', () => {
  it('allows route writes only for explicitly declared adapters', () => {
    expect(hasWanRoutingCapability('MIKROTIK_REST', 'route_write')).toBe(true);
    expect(hasWanRoutingCapability('OPENWRT_UBUS', 'route_write')).toBe(true);
    expect(hasWanRoutingCapability('GENERIC_HTTP', 'route_write')).toBe(false);
    expect(hasWanRoutingCapability('RADIUS_NAS', 'route_write')).toBe(false);
  });
});
