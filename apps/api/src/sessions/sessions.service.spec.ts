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
  });

  it('rejects a session update when the session is not active in the tenant', async () => {
    query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(service.updateUsage('tenant-a', 'session-b', { bytesIn: 100 })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('starts a session only when entitlement and service state allow it', async () => {
    clientQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: 'customer-a' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'grant-a' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ state: 'ACTIVE' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'router-a' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'session-a', customerId: 'customer-a', routerId: 'router-a' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const result = await service.start('tenant-a', { customerId: 'customer-a', routerId: 'router-a', username: 'alice' });
    expect(result.id).toBe('session-a');
    expect(clientQuery).toHaveBeenCalledWith('COMMIT');
  });

  it('rejects customer session creation when entitlement is missing', async () => {
    clientQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }).mockResolvedValueOnce({ rows: [{ id: 'customer-a' }], rowCount: 1 }).mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(service.start('tenant-a', { customerId: 'customer-a', routerId: 'router-a', username: 'alice' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(clientQuery).toHaveBeenCalledWith('ROLLBACK');
  });

  it('rejects a new customer session when service state is suspended', async () => {
    clientQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: 'customer-a' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'grant-a' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ state: 'SUSPENDED' }], rowCount: 1 });
    await expect(service.start('tenant-a', { customerId: 'customer-a', routerId: 'router-a', username: 'alice' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(clientQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(clientQuery).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO sessions'), expect.any(Array));
  });

  it('starts a non-customer session without customer service-state checks', async () => {
    clientQuery.mockResolvedValueOnce({ rows: [{ id: 'router-a' }], rowCount: 1 }).mockResolvedValueOnce({ rows: [{ id: 'session-a', customerId: null, routerId: 'router-a' }], rowCount: 1 }).mockResolvedValueOnce({ rows: [], rowCount: 1 }).mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const result = await service.start('tenant-a', { routerId: 'router-a', username: 'guest' });
    expect(result.id).toBe('session-a');
  });

  it('ends an active or stale session transactionally', async () => {
    clientQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }).mockResolvedValueOnce({ rows: [{ status: 'STALE' }], rowCount: 1 }).mockResolvedValueOnce({ rows: [{ id: 'session-a', routerId: 'router-a', status: 'ENDED' }], rowCount: 1 }).mockResolvedValueOnce({ rows: [], rowCount: 1 }).mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const result = await service.end('tenant-a', 'session-a');
    expect(result.status).toBe('ENDED');
  });

  it('marks stale sessions only when network evidence is missing', async () => {
    clientQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }).mockResolvedValueOnce({ rows: [{ id: 'session-stale', routerId: 'router-a' }], rowCount: 1 }).mockResolvedValueOnce({ rows: [], rowCount: 1 }).mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const result = await service.reconcileStale('tenant-a', 30);
    expect(result.updated).toBe(1);
  });

  it('disconnects an active session when access becomes invalid', async () => {
    clientQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }).mockResolvedValueOnce({ rows: [{ id: 'grant-expired', customerId: 'customer-a', routerId: 'router-a' }], rowCount: 1 }).mockResolvedValueOnce({ rows: [], rowCount: 1 }).mockResolvedValueOnce({ rows: [], rowCount: 0 });
    query.mockResolvedValueOnce({ rows: [{ id: 'session-a', customerId: 'customer-a', routerId: 'router-a', username: 'alice', ipAddress: '10.0.0.10', macAddress: 'AA:BB:CC:DD:EE:FF', apiEndpoint: 'https://10.0.0.1', managementProtocol: 'MIKROTIK_REST', managementEnabled: true, credentialsEncrypted: 'enc' }], rowCount: 1 }).mockResolvedValueOnce({ rows: [{ hasValidAccess: false }], rowCount: 1 });
    networkCommands.queue.mockResolvedValueOnce({ id: 'command-a' });
    mikrotik.disconnectClient.mockResolvedValueOnce({ ok: true, disconnected: true });
    secureCredentials.decrypt.mockReturnValueOnce({ username: 'admin' });
    clientQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }).mockResolvedValueOnce({ rows: [{ status: 'ACTIVE' }], rowCount: 1 }).mockResolvedValueOnce({ rows: [{ id: 'session-a', routerId: 'router-a', status: 'ENDED' }], rowCount: 1 }).mockResolvedValueOnce({ rows: [], rowCount: 1 }).mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const result = await service.reconcileAccessState('tenant-a');
    expect(result.sessions[0]).toMatchObject({ sessionId: 'session-a', state: 'ENDED' });
  });

  it('retains a session when access is renewed during reconciliation', async () => {
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
    clientQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }).mockResolvedValueOnce({ rows: [{ status: 'ACTIVE' }], rowCount: 1 }).mockResolvedValueOnce({ rows: [{ id: 'session-suspended', routerId: 'router-a', status: 'ENDED' }], rowCount: 1 }).mockResolvedValueOnce({ rows: [], rowCount: 1 }).mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const result = await service.reconcileAccessState('tenant-a');
    expect(result.sessions[0]).toMatchObject({ sessionId: 'session-suspended', state: 'ENDED' });
    expect(networkCommands.queue).toHaveBeenCalledWith('tenant-a', expect.objectContaining({ request: { reason: 'ACCESS_GRANT_BINDING_OR_SERVICE_STATE_INVALID' } }));
  });
});
