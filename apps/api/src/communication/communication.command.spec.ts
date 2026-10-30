import { ForbiddenException } from '@nestjs/common';
import { CommunicationCommandService } from './communication.command';

function makeDb() {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  return {
    queries,
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      if (sql.includes("FROM sessions") && sql.includes("status='ACTIVE'")) {
        return {
          rowCount: 1,
          rows: [{
            id: 'session-1',
            customerId: 'customer-1',
            routerId: 'router-1',
            username: 'customer-1',
            ipAddress: '10.0.0.2',
            macAddress: 'AA:BB:CC:DD:EE:FF',
            routerName: 'MW-07',
            managementProtocol: 'MIKROTIK_REST',
            managementEnabled: true,
            apiEndpoint: 'https://router.example/api',
            routerStatus: 'ONLINE',
          }],
        };
      }
      return { rowCount: 0, rows: [] };
    }),
  };
}

describe('CommunicationCommandService', () => {
  it('requires operator authorization before exposing destructive previews', async () => {
    const db = makeDb();
    const audit = { record: jest.fn() };
    const networkCommands = { queue: jest.fn() };
    const service = new CommunicationCommandService(db as never, audit as never, networkCommands as never);

    await expect(
      service.execute({ userId: 'user-1', tenantId: 'tenant-1', role: 'SUPPORT_AGENT' }, 'terminate session session-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(networkCommands.queue).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('previews and then queues session termination through the network command fabric', async () => {
    const db = makeDb();
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const networkCommands = { queue: jest.fn().mockResolvedValue({ id: 'command-1', reused: false }) };
    const service = new CommunicationCommandService(db as never, audit as never, networkCommands as never);

    const preview = await service.execute(
      { userId: 'operator-1', tenantId: 'tenant-1', role: 'NOC_ENGINEER' },
      'terminate session session-1',
    );

    expect(preview.status).toBe('AWAITING_CONFIRMATION');
    expect((preview.preview as Record<string, unknown>).dataAvailable).toBe(true);
    expect(networkCommands.queue).not.toHaveBeenCalled();

    const queued = await service.execute(
      { userId: 'operator-1', tenantId: 'tenant-1', role: 'NOC_ENGINEER' },
      'terminate session session-1',
      true,
    );

    expect(queued.status).toBe('SUCCESS');
    expect((queued.result as Record<string, unknown>).queued).toBe(true);
    expect((queued.result as Record<string, unknown>).commandId).toBe('command-1');
    expect(networkCommands.queue).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        routerId: 'router-1',
        commandType: 'DISCONNECT_SESSION',
        actor: 'operator-1',
        provider: 'MIKROTIK_REST',
        target: expect.objectContaining({ sessionId: 'session-1' }),
      }),
    );
  });
});
