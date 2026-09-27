import { ForbiddenException } from '@nestjs/common';
import { CommunicationCommandService } from './communication.command';

describe('CommunicationCommandService', () => {
  const db = {
    query: jest.fn(),
  } as any;
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as any;
  const networkCommands = { queue: jest.fn().mockResolvedValue({ id:'cmd-1', status:'QUEUED' }) } as any;
  const service = new CommunicationCommandService(db, audit, networkCommands);

  beforeEach(() => jest.clearAllMocks());

  it('requires explicit confirmation before a router restart', async () => {
    const result = await service.execute(
      { userId:'user-1', tenantId:'tenant-1', role:'OWNER' },
      'restart router MW-07',
      false,
    );
    expect(result.status).toBe('AWAITING_CONFIRMATION');
    expect(result.preview?.requiresConfirmation).toBe(true);
    expect(networkCommands.queue).not.toHaveBeenCalled();
  });

  it('queues a confirmed router restart through the network command fabric', async () => {
    db.query.mockResolvedValueOnce({
      rowCount:1,
      rows:[{
        id:'router-1',
        name:'MW-07',
        managementProtocol:'MIKROTIK_REST',
        managementEnabled:true,
        apiEndpoint:'https://10.0.0.7',
      }],
    });

    const result = await service.execute(
      { userId:'user-1', tenantId:'tenant-1', role:'OWNER' },
      'restart router MW-07',
      true,
    );

    expect(networkCommands.queue).toHaveBeenCalledWith('tenant-1',expect.objectContaining({
      routerId:'router-1',
      commandType:'ROUTER_RESTART',
      provider:'MIKROTIK_REST',
    }));
    expect(result.status).toBe('QUEUED');
  });

  it('does not allow non-operators to confirm dangerous commands', async () => {
    await expect(service.execute(
      { userId:'user-1', tenantId:'tenant-1', role:'SUPPORT_AGENT' },
      'restart router MW-07',
      true,
    )).rejects.toBeInstanceOf(ForbiddenException);
  });
});
