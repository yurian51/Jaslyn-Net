import { TrafficOrchestratorService } from './traffic-orchestrator.service';

describe('TrafficOrchestratorService', () => {
  const db = { query: jest.fn() } as any;
  const fairness = { evaluate: jest.fn((policy: any, users: any[]) => ({
    mode: 'FAIRNESS_ACTIVE', utilizationPercent: 90, capacityMbps: policy.capacityMbps,
    allocations: users.map((u) => ({ ...u, allocatedMbps: u.requestedMbps })), evaluatedAt: new Date(),
  })) } as any;
  const enforcement = { evaluateAndApply: jest.fn().mockResolvedValue({ mode: 'FAIRNESS_ACTIVE', applied: true, commandCount: 1, commands: [] }), reconcileManaged: jest.fn().mockResolvedValue(0), clearManaged: jest.fn().mockResolvedValue(0) } as any;
  const config = { get: jest.fn().mockReturnValue('120') } as any;

  beforeEach(() => jest.clearAllMocks());

  it('passes 64-bit counters through the BigInt-safe measurement path', async () => {
    db.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'r1', apiEnabled: false, apiEndpoint: null, capacityMbps: '100', activateThresholdPercent: '80', aggressiveThresholdPercent: '90', recoveryThresholdPercent: '60', enabled: true }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: 1 }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ sessionId: 's1', customerId: 'c1', ipAddress: '10.0.0.2', newestBytesIn: '9007199254740992000', newestBytesOut: '1800000000000000000', newestSampledAt: '2026-09-13T10:00:10.000Z', previousBytesIn: '9007199254740990000', previousBytesOut: '1800000000000000000', previousSampledAt: '2026-09-13T10:00:00.000Z' }] });

    const service = new TrafficOrchestratorService(db, fairness, enforcement, config);
    const result = await service.evaluateRouter('tenant-1', 'r1', false);

    expect(result.users).toBe(1);
    expect(result.allocations[0].requestedMbps).toBeCloseTo(0.0016, 10);
    expect(result.reason).toBe('DRY_RUN');
    expect(enforcement.evaluateAndApply).not.toHaveBeenCalled();
  });

  it('refuses live enforcement when active sessions have no recent measurements', async () => {
    db.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'r1', apiEnabled: true, apiEndpoint: 'https://router.example/rest', capacityMbps: '100', activateThresholdPercent: '80', aggressiveThresholdPercent: '90', recoveryThresholdPercent: '60', enabled: true }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: 2 }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const service = new TrafficOrchestratorService(db, fairness, enforcement, config);
    const result = await service.evaluateRouter('tenant-1', 'r1', true);

    expect(result.applied).toBe(false);
    expect(result.reason).toBe('NO_RECENT_TRAFFIC_MEASUREMENTS');
    expect(enforcement.evaluateAndApply).not.toHaveBeenCalled();
  });
});
