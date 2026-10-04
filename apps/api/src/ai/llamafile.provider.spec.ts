import { extractLlamafilePlanJson, LlamafileProvider } from './llamafile.provider';

describe('extractLlamafilePlanJson', () => {
  it('extracts JSON from a markdown-fenced model response', () => {
    const result = extractLlamafilePlanJson(```json
{"summary":"local plan","steps":[],"stopConditions":["stop on missing evidence"]}
```);
    expect(result).toEqual({
      summary: 'local plan',
      steps: [],
      stopConditions: ['stop on missing evidence'],
    });
  });

  it('rejects non-object model output', () => {
    expect(() => extractLlamafilePlanJson('not-json')).toThrow('Local model returned invalid JSON');
  });
});

describe('LlamafileProvider', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('calls the local OpenAI-compatible chat endpoint and returns the model plan', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      model: 'local-qwen',
      choices: [{
        message: {
          content: `{"summary":"inspect locally","steps":[],"stopConditions":["stop"]}`,
        },
      }],
      usage: { prompt_tokens: 11, completion_tokens: 7 },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const config = {
      get: (key: string, fallback?: unknown) => ({
        JASLYN_LLAMAFILE_ENDPOINT: 'http://127.0.0.1:9090/v1',
        JASLYN_LLAMAFILE_MODEL: 'local-qwen',
        JASLYN_LLAMAFILE_API_KEY: '',
        JASLYN_LLAMAFILE_TIMEOUT_MS: 15000,
      } as Record<string, unknown>)[key] ?? fallback,
    };

    const result = await new LlamafileProvider(config as never).plan('inspect router health', { tenant: 't1' }, []);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:9090/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result).toMatchObject({
      model: 'local-qwen',
      inputTokens: 11,
      outputTokens: 7,
      plan: { summary: 'inspect locally' },
    });
  });

  it('fails closed when the local runtime returns an HTTP error', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('offline', { status: 503 }));
    const config = {
      get: (key: string, fallback?: unknown) => ({
        JASLYN_LLAMAFILE_ENDPOINT: 'http://127.0.0.1:8080/v1',
        JASLYN_LLAMAFILE_MODEL: 'LLaMA_CPP',
        JASLYN_LLAMAFILE_API_KEY: '',
        JASLYN_LLAMAFILE_TIMEOUT_MS: 15000,
      } as Record<string, unknown>)[key] ?? fallback,
    };

    await expect(new LlamafileProvider(config as never).plan('inspect', {}, [])).rejects.toThrow(
      'Llamafile request failed: HTTP 503',
    );
  });
});
