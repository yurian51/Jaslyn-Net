import { ReconciliationWorker } from './reconciliation.worker';

describe('ReconciliationWorker', () => {
  it('runs one tenant at a time under the database advisory lock', async () => {
    const queries: string[] = [];
    const client = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
        if (sql.includes('pg_try_advisory_lock')) return { rows: [{ locked: true }] };
        if (sql.includes('SELECT id FROM tenants')) return { rows: [{ id: 'tenant-1' }, { id: 'tenant-2' }] };
        if (sql.includes('pg_advisory_unlock')) return { rows: [{ pg_advisory_unlock: true }] };
        return { rows: [] };
      }),
      release: jest.fn(),
    };
    const db = { connect: jest.fn(async () => client) } as any;
    const config = { get: jest.fn((_key: string, fallback: string) => fallback) } as any;
    const sessions = {
      reconcileAccessState: jest.fn().mockResolvedValue({}),
      reconcileStale: jest.fn().mockResolvedValue({}),
    } as any;
    const worker = new ReconciliationWorker(db, config, sessions);

    await (worker as any).run();

    expect(sessions.reconcileAccessState).toHaveBeenCalledTimes(2);
    expect(sessions.reconcileStale).toHaveBeenCalledTimes(2);
    expect(sessions.reconcileAccessState).toHaveBeenNthCalledWith(1, 'tenant-1');
    expect(sessions.reconcileAccessState).toHaveBeenNthCalledWith(2, 'tenant-2');
    expect(queries.some((sql) => sql.includes('pg_try_advisory_lock'))).toBe(true);
    expect(queries.some((sql) => sql.includes('pg_advisory_unlock'))).toBe(true);
    expect(client.release).toHaveBeenCalled();
  });

  it('does not run reconciliation when another instance owns the lock', async () => {
    const client = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('pg_try_advisory_lock')) return { rows: [{ locked: false }] };
        return { rows: [] };
      }),
      release: jest.fn(),
    };
    const db = { connect: jest.fn(async () => client) } as any;
    const config = { get: jest.fn((_key: string, fallback: string) => fallback) } as any;
    const sessions = {
      reconcileAccessState: jest.fn(),
      reconcileStale: jest.fn(),
    } as any;
    const worker = new ReconciliationWorker(db, config, sessions);

    await (worker as any).run();

    expect(sessions.reconcileAccessState).not.toHaveBeenCalled();
    expect(sessions.reconcileStale).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalled();
  });
});
