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
  const networkCommands = { queue: jest.fn(), markExecuted: jest.fn(), markVerified: jest.fn(), markFailed: jest.fn() } as any;
  let service: SessionsService;

  beforeEach(() => {
    query.mockReset(); clientQuery.mockReset(); client.release.mockClear(); db.connect.mockClear(); audit.record.mockClear();
    mikrotik.disconnectClient.mockReset(); secureCredentials.decrypt.mockReset();
    networkCommands.queue.mockReset(); networkCommands.markExecuted.mockReset(); networkCommands.markVerified.mockReset(); networkCommands.markFailed.mockReset();
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
  });

  it('starts a session only when the customer has an active entitlement', async () => {
    clientQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }).mockResolvedValueOnce({ rows: [{ id: 'customer-a' }], rowCount: 1 }).mockResolvedValueOnce({ rows: [{ id: 'grant-a' }], rowCount: 1 }).mockResolvedValueOnce({ rows: [{ id: 'router-a' }], rowCount: 1 }).mockResolvedValueOnce({ rows: [{ id: 'session-a', customerId: 'customer-a', routerId: 'router-a' }], rowCount: 1 }).mockResolvedValueOnce({ rows: [], rowCount: 1 }).mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const result = await service.start('tenant-a', { customerId: 'customer-a', routerId: 'router-a', username: 'alice' });
    expect(result.id).toBe('session-a');
    expect(clientQuery).toHaveBeenCalledWith('COMMIT');
  });

  it('rejects customer session creation when entitlement is missing', async () => {
    clientQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }).mockResolvedValueOnce({ rows: [{ id: 'customer-a' }], rowCount: 1 }).mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(service.start('tenant-a', { customerId: 'customer-a', routerId: 'router-a', username: 'alice' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(clientQuery).toHaveBeenCalledWith('ROLLBACK');
  });

  it('starts a non-customer session without requiring a customer entitlement', async () => {
    clientQuery.mockResolvedValueOnce({ rows: [{ id: 'router-a' }], rowCount: 1 }).mockResolvedValueOnce({ rows: [{ id: 'session-a', customerId: null, routerId: 'router-a' }], rowCount: 1 }).mockResolvedValueOnce({ rows: [], rowCount: 1 }).mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const result = await service.start('tenant-a', { routerId: 'router-a', username: 'guest' });
    expect(result.id).toBe('session-a');
  });

  it('ends an active or stale session transactionally and refreshes the router count', async () => {
    clientQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }).mockResolvedValueOnce({ rows: [{ status: 'STALE' }], rowCount: 1 }).mockResolvedValueOnce({ rows: [{ id: 'session-a', routerId: 'router-a', endedAt: '2026-09-13T00:00:00Z', bytesIn: '10', bytesOut: '20', bytesTotal: '30', status: 'ENDED' }], rowCount: 1 }).mockResolvedValueOnce({ rows: [], rowCount: 1 }).mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const result = await service.end('tenant-a', 'session-a');
    expect(result.status).toBe('ENDED');
    expect(clientQuery).toHaveBeenCalledWith('COMMIT');
  });

  it('marks active sessions stale only when network evidence is missing', async () => {
    clientQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }).mockResolvedValueOnce({ rows: [{ id: 'session-stale', routerId: 'router-a' }], rowCount: 1 }).mockResolvedValueOnce({ rows: [], rowCount: 1 }).mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const result = await service.reconcileStale('tenant-a', 30);
    expect(result.updated).toBe(1);
  });

  it('expires grants and disconnects active sessions through the durable command path', async () => {
    clientQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }).mockResolvedValueOnce({ rows: [{ id: 'grant-expired', customerId: 'customer-a', routerId: 'router-a' }], rowCount: 1 }).mockResolvedValueOnce({ rows: [], rowCount: 1 }).mockResolvedValueOnce({ rows: [], rowCount: 0 });
    query.mockResolvedValueOnce({ rows: [{ id: 'session-a', customerId: 'customer-a', routerId: 'router-a', username: 'alice', ipAddress: '10.0.0.10', macAddress: 'AA:BB:CC:DD:EE:FF', apiEndpoint: 'https://10.0.0.1', managementProtocol: 'MIKROTIK_REST', managementEnabled: true, credentialsEncrypted: 'enc' }], rowCount: 1 }).mockResolvedValueOnce({ rows: [{ hasValidAccess: false }], rowCount: 1 });
    networkCommands.queue.mockResolvedValueOnce({ id: 'command-a' });
    mikrotik.disconnectClient.mockResolvedValueOnce({ ok: true, disconnected: true });
    secureCredentials.decrypt.mockReturnValueOnce({ username: 'admin' });
    clientQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }).mockResolvedValueOnce({ rows: [{ status: 'ACTIVE' }], rowCount: 1 }).mockResolvedValueOnce({ rows: [{ id: 'session-a', routerId: 'router-a', endedAt: '2026-09-15T00:00:00Z', status: 'ENDED' }], rowCount: 1 }).mockResolvedValueOnce({ rows: [], rowCount: 1 }).mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const result = await service.reconcileAccessState('tenant-a');
    expect(result.sessions[0]).toMatchObject({ sessionId: 'session-a', commandId: 'command-a', state: 'ENDED' });
    expect(networkCommands.queue).toHaveBeenCalled();
  });

  it('retains a session when a renewal creates valid access during reconciliation', async () => {
    clientQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }).mockResolvedValueOnce({ rows: [{ id: 'grant-expired', customerId: 'customer-a', routerId: 'router-a' }], rowCount: 1 }).mockResolvedValueOnce({ rows: [], rowCount: 1 }).mockResolvedValueOnce({ rows: [], rowCount: 0 });
    query.mockResolvedValueOnce({ rows: [{ id: 'session-a', customerId: 'customer-a', routerId: 'router-a', username: 'alice', ipAddress: '10.0.0.10', macAddress: null, apiEndpoint: 'https://10.0.0.1', managementProtocol: 'MIKROTIK_REST', managementEnabled: true, credentialsEncrypted: 'enc' }], rowCount: 1 }).mockResolvedValueOnce({ rows: [{ hasValidAccess: true }], rowCount: 1 });
    networkCommands.queue.mockResolvedValueOnce({ id: 'command-a' });
    mikrotik.disconnectClient.mockResolvedValueOnce({ ok: true, disconnected: true });
    secureCredentials.decrypt.mockReturnValueOnce({ username: 'admin' });
    const result = await service.reconcileAccessState('tenant-a');
    expect(result.sessions[0]).toMatchObject({ state: 'RETAINED' });
  });

  it('disconnects an active session when customer service state is suspended', async () => {
    clientQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }).mockResolvedValueOnce({ rows: [], rowCount: 0 }).mockResolvedValueOnce({ rows: [], rowCount: 0 });
    query.mockResolvedValueOnce({ rows: [{ id: 'session-suspended', customerId: 'customer-a', routerId: 'router-a', username: 'alice', ipAddress: '10.0.0.20', macAddress: 'AA:BB:CC:DD:EE:20', apiEndpoint: 'https://10.0.0.1', managementProtocol: 'MIKROTIK_REST', managementEnabled: true, credentialsEncrypted: 'enc' }], rowCount: 1 }).mockResolvedValueOnce({ rows: [{ hasValidAccess: false }], rowCount: 1 });
    networkCommands.queue.mockResolvedValueOnce({ id: 'command-suspended' });
    mikrotik.disconnectClient.mockResolvedValueOnce({ ok: true, disconnected: true });
    secureCredentials.decrypt.mockReturnValueOnce({ username: 'admin' });
    clientQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }).mockResolvedValueOnce({ rows: [{ status: 'ACTIVE' }], rowCount: 1 }).mockResolvedValueOnce({ rows: [{ id: 'session-suspended', routerId: 'router-a', endedAt: '2026-09-17T00:00:00Z', status: 'ENDED' }], rowCount: 1 }).mockResolvedValueOnce({ rows: [], rowCount: 1 }).mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const result = await service.reconcileAccessState('tenant-a');
    expect(result.sessions[0]).toMatchObject({ sessionId: 'session-suspended', state: 'ENDED' });
  });

  it('does not enqueue a disconnect when there are no sessions requiring reconciliation', async () => {
    clientQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }).mockResolvedValueOnce({ rows: [], rowCount: 0 }).mockResolvedValueOnce({ rows: [], rowCount: 0 });
    query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const result = await service.reconcileAccessState('tenant-a');
    expect(result.sessions).toHaveLength(0);
    expect(networkCommands.queue).not.toHaveBeenCalled();
  });
});
