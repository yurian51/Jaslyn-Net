import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TrafficSamplesService } from './traffic-samples.service';

describe('TrafficSamplesService', () => {
  const query = jest.fn();
  const db = { query } as any;
  let service: TrafficSamplesService;

  beforeEach(() => {
    query.mockReset();
    service = new TrafficSamplesService(db);
  });

  it('rejects a sample without customer or session identity', async () => {
    await expect(service.record('tenant-1', {
      routerId: 'router-1',
      bytesIn: 10,
      bytesOut: 20,
      sampledAt: new Date(),
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects unsafe or negative counters', async () => {
    await expect(service.record('tenant-1', {
      routerId: 'router-1',
      sessionId: 'session-1',
      bytesIn: -1,
      bytesOut: 20,
      sampledAt: new Date(),
    })).rejects.toBeInstanceOf(BadRequestException);

    await expect(service.record('tenant-1', {
      routerId: 'router-1',
      sessionId: 'session-1',
      bytesIn: Number.MAX_SAFE_INTEGER + 1,
      bytesOut: 20,
      sampledAt: new Date(),
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('records a tenant-scoped sample', async () => {
    query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ id: 'sample-1', routerId: 'router-1', sessionId: 'session-1' }],
    });
    const sampledAt = new Date('2026-09-13T12:00:00.000Z');

    const result = await service.record('tenant-1', {
      routerId: 'router-1',
      sessionId: 'session-1',
      bytesIn: 1000,
      bytesOut: 500,
      sampledAt,
    });

    expect(result.id).toBe('sample-1');
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual(['tenant-1', null, 'session-1', 1000, 500, sampledAt, 'router-1']);
  });

  it('returns zero throughput until two samples exist', async () => {
    query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ bytesIn: '1000', bytesOut: '500', sampledAt: '2026-09-13T12:00:00.000Z' }],
    });

    await expect(service.throughput('tenant-1', 'session-1')).resolves.toEqual({
      downloadMbps: 0,
      uploadMbps: 0,
      totalMbps: 0,
      sampledAt: '2026-09-13T12:00:00.000Z',
    });
  });

  it('calculates throughput from the two newest samples', async () => {
    query.mockResolvedValueOnce({
      rowCount: 2,
      rows: [
        { bytesIn: '2001000', bytesOut: '1001000', sampledAt: '2026-09-13T12:00:10.000Z' },
        { bytesIn: '1000000', bytesOut: '1000000', sampledAt: '2026-09-13T12:00:00.000Z' },
      ],
    });

    await expect(service.throughput('tenant-1', 'session-1')).resolves.toMatchObject({
      downloadMbps: 0.801,
      uploadMbps: 0.008,
      totalMbps: 0.809,
      intervalSeconds: 10,
    });
  });

  it('reports a missing session sample explicitly', async () => {
    query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await expect(service.throughput('tenant-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
