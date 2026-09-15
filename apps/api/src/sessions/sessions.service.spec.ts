import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SessionsService } from './sessions.service';

describe('SessionsService', () => {
  const query = jest.fn();
  const clientQuery = jest.fn();
  const client = { query: clientQuery, release: jest.fn() } as any;
  const db = { query, connect: jest.fn().mockResolvedValue(client) } as any;
  const audit = { record: jest.fn().mockResolvedValue({ id: 'audit-1' }) } as any;
  const mikrotik = { disconnectClient: jest.fn() } as any;
  const secureCredentials = { decrypt: jest.fn() } as any;
  const networkCommands = {
    queue: jest.fn(),
    markExecuted: jest.fn(),
    markVerified: jest.fn(),
    markFailed: jest.fn(),
  } as any;
  let service: SessionsService;

  beforeEach(() => {
    query.mockReset();
    clientQuery.mockReset();
    client.release.mockClear();
    db.connect.mockClear();
    audit.record.mockClear();
    mikrotik.disconnectClient.mockReset();
    secureCredentials.decrypt.mockReset();
    networkCommands.queue.mockReset();
    networkCommands.markExecuted.mockReset();
    networkCommands.markVerified.mockReset();
    networkCommands.markFailed.mockReset();
    service = new SessionsService(db, audit, mikrotik, secureCredentials, networkCommands);
  });

  it('lists only sessions belonging to the tenant', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 's1', status: 'ACTIVE' }], rowCount: 1 });

    const result = await service.list('tenant-a', 'ACTIVE', 50);

    expect(result.data).toHaveLength(1);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE tenant_id=$1'), ['tenant-a', 'ACTIVE', 50]);
  });

  it('rejects a session update when the session is not active in the tenant', async () => {
    query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(service.updateUsage('tenant-a', 'session-b', { bytesIn: 100 })).rejects.toBeInstanceOf(NotFoundException);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("status='ACTIVE'"), ['tenant-a', 'session-b', 100, null]);
  });

  it('starts a session only when the customer has an active entitlement', async () => {
    clientQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: 'customer-a' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'grant-a' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'router-a' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'session-a', customerId: 'customer-a', routerId: 'router-a' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await service.start('tenant-a', { customerId: 'customer-a', routerId: 'router-a', username: 'alice' });

    expect(result.id).toBe('session-a');
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining("status='ACTIVE'"), ['tenant-a', 'customer-a', 'router-a']);
    expect(clientQuery).toHaveBeenCalledWith('COMMIT');
    expect(audit.record).toHaveBeenCalledWith('tenant-a', 'SESSION_STARTED', 'session', 'session-a', expect.any(Object), {});
  });

  it('rejects customer session creation when entitlement is missing', async () => {
    clientQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: 'customer-a' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(service.start('tenant-a', { customerId: 'customer-a', routerId: 'router-a', username: 'alice' }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(clientQuery).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO sessions'), expect.any(Array));
    expect(clientQuery).toHaveBeenCalledWith('ROLLBACK');
  });

  it('starts a non-customer session without requiring a customer entitlement', async () => {
    clientQuery
      .mockResolvedValueOnce({ rows: [{ id: 'router-a' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'session-a', customerId: null, routerId: 'router-a' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await service.start('tenant-a', { routerId: 'router-a', username: 'guest' });

    expect(result.id).toBe('session-a');
    expect(clientQuery).toHaveBeenCalledWith('COMMIT');
  });

  it('ends an active or stale session transactionally and refreshes the router count', async () => {
    clientQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ status: 'STALE' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'session-a', routerId: 'router-a', endedAt: '2026-09-13T00:00:00Z', bytesIn: '10', bytesOut: '20', bytesTotal: '30', status: 'ENDED' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await service.end('tenant-a', 'session-a');

    expect(result.status).toBe('ENDED');
    expect(clientQuery).toHaveBeenCalledWith('COMMIT');
    expect(audit.record).toHaveBeenCalledWith('tenant-a', 'SESSION_ENDED', 'session', 'session-a', expect.objectContaining({ previousState: 'STALE' }), {});
  });

  it('marks active sessions stale only when network evidence is missing', async () => {
    clientQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: 'session-stale', routerId: 'router-a', startedAt: '2026-09-13T00:00:00Z' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await service.reconcileStale('tenant-a', 30);

    expect(result.updated).toBe(1);
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining("status='STALE'"), ['tenant-a', 30]);
    expect(clientQuery).toHaveBeenCalledWith('COMMIT');
  });

  it('expires grants and disconnects active sessions through the durable command path', async () => {
    clientQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: 'grant-expired', customerId: 'customer-a', routerId: 'router-a' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    query
      .mockResolvedValueOnce({
        rows: [{
          id: 'session-a', customerId: 'customer-a', routerId: 'router-a', username: 'alice', ipAddress: '10.0.0.10', macAddress: 'AA:BB:CC:DD:EE:FF',
          apiEndpoint: 'https://10.0.0.1', managementProtocol: 'MIKROTIK_REST', managementEnabled: true, credentialsEncrypted: 'enc',
        }], rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ hasActiveGrant: false }], rowCount: 1 });

    networkCommands.queue.mockResolvedValueOnce({ id: 'command-a' });
    mikrotik.disconnectClient.mockResolvedValueOnce({ ok: true, disconnected: true, removed: [{ service: 'hotspot', id: '*1' }] });
    secureCredentials.decrypt.mockReturnValueOnce({ username: 'admin', password: 'secret' });

    clientQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ status: 'ACTIVE' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'session-a', routerId: 'router-a', endedAt: '2026-09-15T00:00:00Z', bytesIn: '1', bytesOut: '2', bytesTotal: '3', status: 'ENDED' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await service.reconcileAccessState('tenant-a');

    expect(result.expiredGrants).toBe(1);
    expect(result.sessions[0]).toMatchObject({ sessionId: 'session-a', commandId: 'command-a', state: 'ENDED' });
    expect(networkCommands.queue).toHaveBeenCalledWith('tenant-a', expect.objectContaining({ commandType: 'DISCONNECT_SESSION', routerId: 'router-a' }));
    expect(mikrotik.disconnectClient).toHaveBeenCalledWith('https://10.0.0.1', { username: 'admin', password: 'secret' }, expect.objectContaining({ ipAddress: '10.0.0.10', username: 'alice' }));
    expect(networkCommands.markVerified).toHaveBeenCalledWith('tenant-a', 'command-a', expect.objectContaining({ entitlementVerified: true }));
  });

  it('does not terminate a session when a renewal creates a new active grant during reconciliation', async () => {
    clientQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: 'grant-expired', customerId: 'customer-a', routerId: 'router-a' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    query
      .mockResolvedValueOnce({ rows: [{ id: 'session-a', customerId: 'customer-a', routerId: 'router-a', username: 'alice', ipAddress: '10.0.0.10', macAddress: null, apiEndpoint: 'https://10.0.0.1', managementProtocol: 'MIKROTIK_REST', managementEnabled: true, credentialsEncrypted: 'enc' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ hasActiveGrant: true }], rowCount: 1 });
    networkCommands.queue.mockResolvedValueOnce({ id: 'command-a' });
    mikrotik.disconnectClient.mockResolvedValueOnce({ ok: true, disconnected: true, removed: [] });
    secureCredentials.decrypt.mockReturnValueOnce({ username: 'admin', password: 'secret' });

    const result = await service.reconcileAccessState('tenant-a');

    expect(result.sessions[0]).toMatchObject({ state: 'RETAINED', reason: 'ACCESS_RENEWED_DURING_RECONCILIATION' });
    expect(networkCommands.markVerified).toHaveBeenCalledWith('tenant-a', 'command-a', expect.objectContaining({ entitlementVerified: false }));
    expect(audit.record).toHaveBeenCalled();
  });
});
