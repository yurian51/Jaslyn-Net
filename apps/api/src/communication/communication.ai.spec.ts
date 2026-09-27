import { CommunicationAiService } from './communication.ai';

describe('CommunicationAiService', () => {
  const db = { query: jest.fn(), connect: jest.fn() } as any;
  const config = { get: jest.fn((key: string, fallback: string) => fallback) } as any;
  const audit = { record: jest.fn() } as any;
  const communication = { sendMessage: jest.fn(), scheduleMessage: jest.fn() } as any;
  const commands = { execute: jest.fn() } as any;
  const networkTools = { listTools: jest.fn(() => []), execute: jest.fn(), preview: jest.fn() } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not fabricate an answer when the AI provider is not configured', async () => {
    const service = new CommunicationAiService(db, config, audit, communication, commands, networkTools);
    db.query.mockResolvedValueOnce({ rows: [{ id: 'ai-1' }] });
    db.query.mockResolvedValueOnce({ rows: [] });
    const result = await service.chat({ userId:'u1',tenantId:'t1',role:'SUPPORT_AGENT' }, 'show status');
    expect(result.status).toBe('UNAVAILABLE');
    expect(result.verified).toBe(false);
    expect(result.message).toContain('AI provider is not configured');
  });

  it('rejects a destructive AI tool for a non-operator', async () => {
    const service = new CommunicationAiService(db, config, audit, communication, commands);
    expect(() => (service as any).assertPermission(
      { userId:'u1',tenantId:'t1',role:'SUBSCRIBER' },
      { name:'terminateSession',description:'',input_schema:{type:'object',properties:{},required:[]},requiresConfirmation:true,permission:'network.commands.execute' },
    )).toThrow('Network command permission required');
  });

  it('claims destructive confirmation before provider execution and releases the DB transaction', async () => {
    const client = { query: jest.fn(), release: jest.fn() } as any;
    client.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: 'exec-1',
          conversationId: 'ai-1',
          toolName: 'terminateSession',
          input: { sessionId: 'session-1' },
          status: 'AWAITING_CONFIRMATION',
        }],
      })
      .mockResolvedValueOnce({ rowCount: 1 }) // claim EXECUTING
      .mockResolvedValueOnce({}); // COMMIT
    db.connect.mockResolvedValueOnce(client);
    db.query.mockResolvedValueOnce({ rowCount: 1 }); // persist QUEUED result
    commands.execute.mockResolvedValueOnce({ status: 'QUEUED', queued: true, commandId: 'command-1' });

    const service = new CommunicationAiService(db, config, audit, communication, commands);
    const result = await service.confirm(
      { userId: 'u1', tenantId: 't1', role: 'NOC_ENGINEER' },
      'exec-1',
    );

    expect(result.status).toBe('QUEUED');
    expect(result.verified).toBe(false);
    expect(commands.execute).toHaveBeenCalledWith(
      { userId: 'u1', tenantId: 't1', role: 'NOC_ENGINEER' },
      'terminate session session-1',
      true,
    );
    expect(client.query.mock.calls[0][0]).toBe('BEGIN');
    expect(client.query.mock.calls[1][0]).toContain('FOR UPDATE');
    expect(client.query.mock.calls[2][0]).toContain("status='EXECUTING'");
    expect(client.query.mock.calls[3][0]).toBe('COMMIT');
    expect(db.query.mock.calls[0][0]).toContain("status='EXECUTING'");
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('does not execute a confirmation already claimed by another request', async () => {
    const client = { query: jest.fn(), release: jest.fn() } as any;
    client.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: 'exec-1',
          toolName: 'terminateSession',
          input: { sessionId: 'session-1' },
          status: 'EXECUTING',
        }],
      });
    db.connect.mockResolvedValueOnce(client);

    const service = new CommunicationAiService(db, config, audit, communication, commands);
    await expect(service.confirm(
      { userId: 'u1', tenantId: 't1', role: 'NOC_ENGINEER' },
      'exec-1',
    )).rejects.toThrow('AI execution is no longer awaiting confirmation');

    expect(commands.execute).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('returns the declared tool contract without hiding confirmation requirements', async () => {
    const service = new CommunicationAiService(db, config, audit, communication, commands);
    const terminate = service.listTools().find((tool:any) => tool.name === 'terminateSession');
    expect(terminate?.requiresConfirmation).toBe(true);
    expect(terminate?.permission).toBe('network.commands.execute');
  });
});
