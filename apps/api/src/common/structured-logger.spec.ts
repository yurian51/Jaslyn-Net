import { StructuredLogger } from './structured-logger';

describe('StructuredLogger', () => {
  let stdout: jest.SpyInstance;
  let stderr: jest.SpyInstance;

  beforeEach(() => {
    stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => jest.restoreAllMocks());

  it('emits parseable JSON with timestamps and severity', () => {
    new StructuredLogger('INFO', 'test').log('service ready', 'Bootstrap');
    const entry = JSON.parse(String(stdout.mock.calls[0][0]));
    expect(entry).toMatchObject({ level: 'INFO', environment: 'test', message: 'service ready', context: 'Bootstrap' });
    expect(Number.isNaN(Date.parse(entry.timestamp))).toBe(false);
  });

  it('filters below configured threshold', () => {
    const logger = new StructuredLogger('WARN', 'test');
    logger.debug('details');
    logger.log('normal');
    logger.warn('recoverable');
    expect(stdout).toHaveBeenCalledTimes(1);
    expect(stderr).not.toHaveBeenCalled();
  });

  it('redacts secret fields and bearer tokens', () => {
    new StructuredLogger('DEBUG', 'test').debug({
      event: 'auth.failure',
      password: 'dont-log-me',
      nested: { accessToken: 'dont-log-this-either' },
      header: 'Bearer abc.def.ghi',
    });
    const output = String(stdout.mock.calls[0][0]);
    expect(output).not.toContain('dont-log-me');
    expect(output).not.toContain('dont-log-this-either');
    expect(output).not.toContain('abc.def.ghi');
    expect(output).toContain('[REDACTED]');
    new StructuredLogger('DEBUG', 'test').debug('Authorization: Bearer plain-text-token');
    expect(String(stdout.mock.calls[1][0])).not.toContain('plain-text-token');
  });

  it('keeps structured event fields at the JSON root', () => {
    new StructuredLogger('INFO', 'test').log({
      event: 'http.request.completed',
      requestId: 'req-123',
      status: 503,
    });
    const entry = JSON.parse(String(stdout.mock.calls[0][0]));
    expect(entry).toMatchObject({
      event: 'http.request.completed',
      requestId: 'req-123',
      status: 503,
      level: 'INFO',
    });
    expect(entry.message).toBeUndefined();
  });

  it('writes errors to stderr and supports FATAL', () => {
    new StructuredLogger('TRACE', 'test').fatal('database unavailable');
    expect(stderr).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(stderr.mock.calls[0][0])).level).toBe('FATAL');
  });
});
