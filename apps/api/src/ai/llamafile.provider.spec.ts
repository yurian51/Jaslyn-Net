import { extractLlamafilePlanJson } from './llamafile.provider';

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
