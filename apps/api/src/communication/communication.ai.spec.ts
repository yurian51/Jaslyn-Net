import { CommunicationAiService } from './communication.ai';

describe('CommunicationAiService', () => {
  const db = { query: jest.fn() } as any;
  const config = { get: jest.fn((key: string, fallback: string) => fallback) } as any;
  const audit = { record: jest.fn() } as any;
  const communication = { sendMessage: jest.fn(), scheduleMessage: jest.fn() } as any;
  const commands = { execute: jest.fn() } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not fabricate an answer when the AI provider is not configured', async () => {
    const service = new CommunicationAiService(db, config, audit, communication, commands);
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

  it('returns the declared tool contract without hiding confirmation requirements', async () => {
    const service = new CommunicationAiService(db, config, audit, communication, commands);
    const terminate = service.listTools().find((tool:any) => tool.name === 'terminateSession');
    expect(terminate?.requiresConfirmation).toBe(true);
    expect(terminate?.permission).toBe('network.commands.execute');
  });
});
