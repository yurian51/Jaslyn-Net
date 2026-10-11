import { AuditService } from '../audit/audit.service';
import { Pool } from 'pg';
import { OperationsIntelligenceService } from './operations-intelligence.service';

describe('OperationsIntelligenceService', () => {
  it('produces a deterministic bounded capacity estimate from utilization samples', async () => {
    const now = Date.now();
    const db = {
      query: jest.fn().mockResolvedValue({ rows: [
        { resource_type: 'INTERFACE', resource_id: '00000000-0000-4000-8000-000000000001', metric_value: '20', sampled_at: new Date(now - 20 * 86400000) },
        { resource_type: 'INTERFACE', resource_id: '00000000-0000-4000-8000-000000000001', metric_value: '40', sampled_at: new Date(now - 10 * 86400000) },
        { resource_type: 'INTERFACE', resource_id: '00000000-0000-4000-8000-000000000001', metric_value: '60', sampled_at: new Date(now - 86400000) },
      ], rowCount: 3 }),
    };
    const audit = { record: jest.fn() };
    const service = new OperationsIntelligenceService(db as unknown as Pool, audit as unknown as AuditService);
    const result = await service.capacityForecast('tenant-a');
    expect(result.method).toContain('deterministic');
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.trend).toBe('INCREASING');
    expect(result.data[0]?.projected30DayPct).toBe(100);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('network_telemetry_samples'), ['tenant-a']);
  });
});
