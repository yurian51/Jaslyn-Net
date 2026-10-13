import { NetworkCommandWorkerService } from './network-command-worker.service';

describe('NetworkCommandWorkerService router protocol safety', () => {
  it('rejects a command whose provider differs from the tenant router configuration', async () => {
    const db = {
      query: jest.fn().mockResolvedValue({
        rowCount: 1,
        rows: [{
          apiEndpoint: 'https://router.example.invalid',
          managementProtocol: 'MIKROTIK_REST',
          managementCredentialsEncrypted: 'encrypted',
        }],
      }),
    };
    const config = { get: jest.fn((_key: string, fallback: unknown) => fallback) };
    const credentials = { decrypt: jest.fn() };
    const commands = { claimPending: jest.fn(), markFailed: jest.fn() };
    const enforcement = { executeVerifiedBandwidthCommands: jest.fn(), executePersistedDisconnectCommand: jest.fn() };
    const service = new NetworkCommandWorkerService(db as never, config as never, credentials as never, commands as never, enforcement as never);
    const execute = Reflect.get(service, 'execute') as (command: unknown) => Promise<void>;

    await expect(execute.call(service, {
      id: 'command-1',
      tenantId: 'tenant-1',
      routerId: 'router-1',
      commandType: 'DISCONNECT_SESSION',
      target: { username: 'subscriber' },
      request: { username: 'subscriber', targetMacAddress: 'AA:BB:CC:DD:EE:FF' },
      provider: 'ARUBA_CENTRAL_API',
      attempts: 0,
    })).rejects.toThrow('does not match router management protocol');

    expect(credentials.decrypt).not.toHaveBeenCalled();
    expect(enforcement.executePersistedDisconnectCommand).not.toHaveBeenCalled();
  });
});
