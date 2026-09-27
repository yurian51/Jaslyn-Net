import { ServiceUnavailableException } from '@nestjs/common';
import { CommunicationAiService } from './communication.ai';

describe('CommunicationAiService', () => {
  it('fails closed when no AI provider key is configured', async () => {
    const db = { query: jest.fn() } as any;
    const config = { get: jest.fn(() => undefined) } as any;
    const audit = { record: jest.fn() } as any;
    const commands = { execute: jest.fn() } as any;
    const service = new CommunicationAiService(db, config, audit, commands);

    await expect(service.chat(
      { userId:'u1',tenantId:'t1',role:'OWNER' },
      { message:'show offline routers' },
    )).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(commands.execute).not.toHaveBeenCalled();
  });
});
