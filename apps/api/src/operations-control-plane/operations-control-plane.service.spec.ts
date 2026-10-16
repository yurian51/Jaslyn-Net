import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OperationsControlPlaneService } from './operations-control-plane.service';

describe('OperationsControlPlaneService', () => {
  it('ranks root-cause candidates by their nearest upstream dependency depth', async () => {
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ id: 'node-1', dependencyDepth: 1, evidenceScore: 100 }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 'signal-1', priority: 'HIGH' }], rowCount: 1 }),
    };
    const audit = { record: jest.fn() };
    const service = new OperationsControlPlaneService(db as never, audit as never);

    const result = await service.rootCause('tenant-a');

    expect(db.query).toHaveBeenCalledTimes(2);
    expect(db.query.mock.calls[0][1]).toEqual(['tenant-a']);
    expect(db.query.mock.calls[0][0]).toContain('MIN(u.depth)::int AS "dependencyDepth"');
    expect(result.candidates[0].dependencyDepth).toBe(1);
    expect(result.method).toContain('candidate ranking only, not causal proof');
  });

  it('rejects unsupported record types before querying the database', async () => {
    const db = { query: jest.fn() };
    const service = new OperationsControlPlaneService(db as never, { record: jest.fn() } as never);

    await expect(service.listRecords('tenant-a', 'UNKNOWN_TYPE')).rejects.toBeInstanceOf(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects unsupported record statuses before querying the database', async () => {
    const db = { query: jest.fn() };
    const service = new OperationsControlPlaneService(db as never, { record: jest.fn() } as never);

    await expect(service.listRecords('tenant-a', undefined, 'ANY_STATUS')).rejects.toBeInstanceOf(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('does not create topology edges when either endpoint is outside the tenant', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) };
    const service = new OperationsControlPlaneService(db as never, { record: jest.fn() } as never);

    await expect(service.addEdge('tenant-a', 'actor-1', {
      sourceNodeId: 'node-a',
      targetNodeId: 'node-b',
    })).rejects.toBeInstanceOf(NotFoundException);
    expect(db.query.mock.calls[0][1][0]).toBe('tenant-a');
  });

  it('reports topology observation freshness separately from device status', async () => {
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ neverObserved: 2, staleObservations: 3, latestObservationAt: '2026-10-16T05:00:00Z' }], rowCount: 1 }),
    };
    const service = new OperationsControlPlaneService(db as never, { record: jest.fn() } as never);

    const result = await service.topology('tenant-a');

    expect(db.query).toHaveBeenCalledTimes(3);
    expect(db.query.mock.calls[2][1]).toEqual(['tenant-a', 300]);
    expect(result.data.summary).toMatchObject({
      nodes: 0,
      edges: 0,
      neverObserved: 2,
      staleObservations: 3,
      staleThresholdSeconds: 300,
    });
  });

  it('records signature evidence with tenant and source attribution', async () => {
    const row = { id: 'evidence-1', evidenceType: 'PAYMENT_CONFIRMED', subjectType: 'SUBSCRIBER', subjectId: 'subscriber-1', sourceType: 'PAYMENT_PROVIDER' };
    const db = { query: jest.fn().mockResolvedValue({ rows: [row], rowCount: 1 }) };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new OperationsControlPlaneService(db as never, audit as never);

    await expect(service.createEvidence('tenant-a', 'actor-1', {
      evidenceType: 'PAYMENT_CONFIRMED',
      subjectType: 'SUBSCRIBER',
      subjectId: 'subscriber-1',
      sourceType: 'PAYMENT_PROVIDER',
      observedAt: '2026-10-16T05:00:00Z',
      confidence: 0.95,
      payload: { transactionId: 'txn-1' },
      idempotencyKey: 'payment-evidence-0001',
    })).resolves.toEqual(row);
    expect(db.query.mock.calls[0][1][0]).toBe('tenant-a');
    expect(db.query.mock.calls[0][1][4]).toBe('PAYMENT_PROVIDER');
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it('rejects evidence links whose endpoints are not both in the tenant', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) };
    const service = new OperationsControlPlaneService(db as never, { record: jest.fn() } as never);

    await expect(service.linkEvidence('tenant-a', 'actor-1', {
      fromEvidenceId: '11111111-1111-4111-8111-111111111111',
      toEvidenceId: '22222222-2222-4222-8222-222222222222',
      relation: 'SUPPORTS',
    })).rejects.toBeInstanceOf(NotFoundException);
    expect(db.query.mock.calls[0][1][0]).toBe('tenant-a');
  });

  it('requires subject type and id filters to be supplied together', async () => {
    const db = { query: jest.fn() };
    const service = new OperationsControlPlaneService(db as never, { record: jest.fn() } as never);

    await expect(service.listEvidence('tenant-a', 'SUBSCRIBER')).rejects.toBeInstanceOf(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
  });
});
