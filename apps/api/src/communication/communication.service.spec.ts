import { CommunicationService } from './communication.service';

describe('CommunicationService', () => {
  it('rejects an empty message before touching persistence', async () => {
    const db = { query: jest.fn(), connect: jest.fn() };
    const audit = { record: jest.fn() };
    const realtime = { publish: jest.fn() };
    const service = new CommunicationService(db as never, audit as never, realtime as never);
    await expect(service.sendMessage({ userId:'u',tenantId:'t',role:'AGENT' },'c',{ body:'   ' }))
      .rejects.toThrow('Message body must contain 1-10000 characters');
    expect(db.query).not.toHaveBeenCalled();
  });
});
