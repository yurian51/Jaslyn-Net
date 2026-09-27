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

  it('uses the configured Anthropic provider for a non-tool response', async () => {
    const providerConfig = {
      get: jest.fn((key: string, fallback: string) => ({
        JASLYN_AI_PROVIDER: 'anthropic',
        JASLYN_AI_API_KEY: 'test-key',
        JASLYN_AI_MODEL: 'claude-test',
        JASLYN_AI_ENDPOINT: 'https://example.test/v1/messages',
      } as Record<string,string>)[key] ?? fallback),
    } as any;
    const service = new CommunicationAiService(db, providerConfig, audit, communication, commands);
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'ai-2' }] })
      .mockResolvedValueOnce({ rows: [{ role: 'USER', content: 'show status' }] })
      .mockResolvedValueOnce({ rows: [] });
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: 'Verified response.' }] }),
    });
    const previousFetch = global.fetch;
    global.fetch = fetchMock as any;
    try {
      const result = await service.chat({ userId:'u1',tenantId:'t1',role:'SUPPORT_AGENT' }, 'show status');
      expect(result.status).toBe('SUCCESS');
      expect(result.message).toBe('Verified response.');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      global.fetch = previousFetch;
    }
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
