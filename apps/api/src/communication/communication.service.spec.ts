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
  it('verifies a signed mini-app launch context and enforces app binding', async () => {
    process.env.JASLYN_MINI_APP_SECRET = 'test-secret-012345678901234567890123';
    const { createHmac } = await import('node:crypto');
    const issuedAt = Math.floor(Date.now() / 1000);
    const payload = {
      v: 1,
      tenantId: 't1',
      userId: 'u1',
      miniAppId: 'app1',
      slug: 'billing',
      permissions: ['payments.read'],
      iat: issuedAt,
      exp: issuedAt + 300,
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const secret = process.env.JASLYN_MINI_APP_SECRET!;
    const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
    const db = {
      query: jest.fn().mockResolvedValue({
        rowCount: 1,
        rows: [{ id:'app1', slug:'billing', enabled:true, permissions:['payments.read'] }],
      }),
      connect: jest.fn(),
    };
    const audit = { record: jest.fn() };
    const realtime = { publish: jest.fn() };
    const superApp = new (await import('./communication.superapp')).CommunicationSuperAppService(db as never, audit as never, realtime as never);

    await expect(superApp.verifyMiniAppLaunch(
      {userId:'u1',tenantId:'t1',role:'ADMIN'},
      encoded + '.' + signature,
      'app1',
    )).resolves.toMatchObject({valid:true,miniAppId:'app1',slug:'billing'});

    await expect(superApp.verifyMiniAppLaunch(
      {userId:'u1',tenantId:'t1',role:'ADMIN'},
      encoded + '.' + signature,
      'other-app',
    )).rejects.toThrow('does not match this mini app');

    delete process.env.JASLYN_MINI_APP_SECRET;
  });

  it('rejects a tampered mini-app launch signature', async () => {
    process.env.JASLYN_MINI_APP_SECRET = 'test-secret-012345678901234567890123';
    const superApp = new (await import('./communication.superapp')).CommunicationSuperAppService(
      { query: jest.fn(), connect: jest.fn() } as never,
      { record: jest.fn() } as never,
      { publish: jest.fn() } as never,
    );
    await expect(superApp.verifyMiniAppLaunch(
      {userId:'u1',tenantId:'t1',role:'ADMIN'},
      'eyJ2IjoxfQ.invalid-signature',
    )).rejects.toThrow('Invalid mini app launch signature');
    delete process.env.JASLYN_MINI_APP_SECRET;
  });

});
