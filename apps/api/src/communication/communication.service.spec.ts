import { CommunicationService } from './communication.service';

describe('CommunicationService', () => {
  it('pins with a bounded lifetime and transactionally evicts the oldest fourth pin', async () => {
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id:'m4', conversationId:'c1', messageType:'TEXT', body:'Pinned', senderUserId:'u1', protected:false }] })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }),
      connect: jest.fn(),
    };
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id:'oldest-pin' }] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }),
      release: jest.fn(),
    };
    db.connect.mockResolvedValue(client);
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const realtime = { publish: jest.fn() };
    const service = new CommunicationService(db as never, audit as never, realtime as never);

    const result = await service.pinMessage({ userId:'u1',tenantId:'t1',role:'ADMIN' },'m4','7D');

    expect(result.pinned).toBe(true);
    expect(result.expiresAt).toEqual(expect.any(String));
    expect(client.query).toHaveBeenCalledWith('BEGIN');
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('hashtextextended'), ['t1:c1']);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM pinned_messages WHERE tenant_id=$1 AND id=$2'), ['t1','oldest-pin']);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(realtime.publish).toHaveBeenCalledWith(expect.objectContaining({type:'message.pinned'}));
  });

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
