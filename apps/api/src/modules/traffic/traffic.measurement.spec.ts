import { calculateThroughput } from './traffic.measurement';

describe('calculateThroughput', () => {
  it('converts byte deltas over time into Mbps', () => {
    const result = calculateThroughput(
      { bytesIn: 0, bytesOut: 0, sampledAt: new Date('2026-09-13T10:00:00.000Z') },
      { bytesIn: 12_500_000, bytesOut: 2_500_000, sampledAt: new Date('2026-09-13T10:00:01.000Z') },
    );

    expect(result.downloadMbps).toBe(100);
    expect(result.uploadMbps).toBe(20);
    expect(result.totalMbps).toBe(120);
    expect(result.intervalSeconds).toBe(1);
  });

  it('never produces negative throughput after a counter reset', () => {
    const result = calculateThroughput(
      { bytesIn: 5_000, bytesOut: 5_000, sampledAt: new Date('2026-09-13T10:00:00.000Z') },
      { bytesIn: 1_000, bytesOut: 2_000, sampledAt: new Date('2026-09-13T10:00:02.000Z') },
    );

    expect(result.downloadMbps).toBe(0);
    expect(result.uploadMbps).toBe(0);
    expect(result.totalMbps).toBe(0);
  });

  it('returns zero when timestamps do not advance', () => {
    const timestamp = new Date('2026-09-13T10:00:00.000Z');
    expect(calculateThroughput(
      { bytesIn: 1, bytesOut: 1, sampledAt: timestamp },
      { bytesIn: 100, bytesOut: 100, sampledAt: timestamp },
    )).toEqual({ downloadMbps: 0, uploadMbps: 0, totalMbps: 0, intervalSeconds: 0 });
  });
});
