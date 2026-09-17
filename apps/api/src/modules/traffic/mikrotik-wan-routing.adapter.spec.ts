import { MikrotikWanRoutingAdapter } from './mikrotik-wan-routing.adapter';
import { LoadBalanceDecision } from './load-balancing.types';

describe('MikrotikWanRoutingAdapter', () => {
  const credentials = { username: 'jaslyn', password: 'secret' };

  afterEach(() => jest.restoreAllMocks());

  it('refuses to synthesize weighted balancing from equal-cost routes', async () => {
    const adapter = new MikrotikWanRoutingAdapter('https://router.example', credentials);
    const decision = baseDecision('WEIGHTED');
    const result = await adapter.applyLoadBalanceDecision('router-1', decision, [target('wan-a', '10.0.0.1', 1)]);
    expect(result.applied).toBe(false);
    expect(result.verified).toBe(false);
    expect(result.reason).toContain('PRIMARY_SECONDARY');
  });

  it('creates and verifies Jaslyn-owned primary/secondary routes', async () => {
    const adapter = new MikrotikWanRoutingAdapter('https://router.example', credentials);
    const decision = baseDecision('PRIMARY_SECONDARY');
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ '.id': '*10' }))
      .mockResolvedValueOnce(jsonResponse({ '.id': '*11' }))
      .mockResolvedValueOnce(jsonResponse([
        { '.id': '*10', comment: `jaslyn-net:lb:${decision.policyId}:wan-a`, gateway: '10.0.0.1', distance: '1', disabled: false },
        { '.id': '*11', comment: `jaslyn-net:lb:${decision.policyId}:wan-b`, gateway: '10.0.1.1', distance: '2', disabled: true },
      ]));

    const result = await adapter.applyLoadBalanceDecision('router-1', decision, [
      target('wan-a', '10.0.0.1', 1),
      target('wan-b', '10.0.1.1', 2),
    ]);

    expect(result.applied).toBe(true);
    expect(result.verified).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(String(fetchMock.mock.calls[1][0])).toContain('/rest/ip/route');
    expect((fetchMock.mock.calls[1][1] as RequestInit).method).toBe('PUT');
    expect(JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))).toMatchObject({
      'dst-address': '0.0.0.0/0', gateway: '10.0.0.1', distance: 1, disabled: false,
    });
    expect(JSON.parse(String((fetchMock.mock.calls[2][1] as RequestInit).body))).toMatchObject({
      'dst-address': '0.0.0.0/0', gateway: '10.0.1.1', distance: 2, disabled: true,
    });
  });
});

function baseDecision(strategy: LoadBalanceDecision['strategy']): LoadBalanceDecision {
  return {
    policyId: 'policy-1',
    strategy,
    eligibleMembers: [{
      wanConnectionId: 'wan-a', configuredWeight: 1, effectiveWeight: 1, priority: 1,
      healthState: 'HEALTHY', capacityMbps: 100, utilizationPercent: 10,
    }],
    failoverActive: strategy === 'PRIMARY_SECONDARY',
  };
}

function target(wanConnectionId: string, gateway: string, priority: number) {
  return { wanConnectionId, gateway, priority, weight: 1 };
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
