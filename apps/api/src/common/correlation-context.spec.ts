import { getCorrelationId, runWithCorrelation } from './correlation-context';
import { RequestIdMiddleware } from './request-id.middleware';

describe('correlation context', () => {
  it('uses an incoming correlation id and keeps it available to downstream work', () => {
    const req: any = { headers: { 'x-request-id': 'request-1', 'x-correlation-id': 'operation-1' } };
    const headers: Record<string, string> = {};
    const res = { setHeader: (name: string, value: string) => { headers[name] = value; } };

    new RequestIdMiddleware().use(req, res, () => {
      expect(req.requestId).toBe('request-1');
      expect(req.correlationId).toBe('operation-1');
      expect(headers['x-request-id']).toBe('request-1');
      expect(headers['x-correlation-id']).toBe('operation-1');
      expect(getCorrelationId()).toBe('operation-1');
    });
  });

  it('falls back to request id when no correlation id is supplied', () => {
    let observed: string | undefined;
    runWithCorrelation('fallback', () => {
      observed = getCorrelationId();
    });
    expect(observed).toBe('fallback');
  });
});
