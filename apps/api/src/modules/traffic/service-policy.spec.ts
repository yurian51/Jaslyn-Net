import { resolveServicePolicy } from './service-policy';

describe('resolveServicePolicy', () => {
  const now = new Date('2026-09-14T12:00:00.000Z');

  it('enforces package speed and returns remaining quota', () => {
    expect(resolveServicePolicy({
      startsAt: new Date('2026-09-14T11:00:00.000Z'),
      endsAt: new Date('2026-09-15T11:00:00.000Z'),
      dataLimitBytes: 10_000,
      usedBytes: 2_500,
      downloadBps: 50_000_000,
      uploadBps: 10_000_000,
      now,
    })).toEqual({ state: 'ACTIVE', maxDownloadMbps: 50, maxUploadMbps: 10, remainingBytes: 7_500 });
  });

  it('fails closed after quota exhaustion', () => {
    expect(resolveServicePolicy({ dataLimitBytes: 1_000, usedBytes: 1_000, downloadBps: 20_000_000, uploadBps: 5_000_000, now }))
      .toEqual({ state: 'QUOTA_EXCEEDED', maxDownloadMbps: 0, maxUploadMbps: 0, remainingBytes: 0 });
  });

  it('fails closed after expiry', () => {
    expect(resolveServicePolicy({ startsAt: new Date('2026-09-13T12:00:00.000Z'), endsAt: now, downloadBps: 20_000_000, uploadBps: 5_000_000, usedBytes: 0, now }).state)
      .toBe('EXPIRED');
  });

  it('fails closed before activation', () => {
    expect(resolveServicePolicy({ startsAt: new Date('2026-09-14T13:00:00.000Z'), endsAt: new Date('2026-09-15T13:00:00.000Z'), downloadBps: 20_000_000, uploadBps: 5_000_000, usedBytes: 0, now }).state)
      .toBe('NO_ACTIVE_SERVICE');
  });

  it('fails closed for an invalid service window', () => {
    expect(resolveServicePolicy({ startsAt: new Date('2026-09-15T12:00:00.000Z'), endsAt: new Date('2026-09-14T12:00:00.000Z'), usedBytes: 0, now }).state)
      .toBe('NO_ACTIVE_SERVICE');
  });

  it('fails closed for an invalid current timestamp', () => {
    expect(resolveServicePolicy({ usedBytes: 0, now: new Date('invalid') }).state).toBe('NO_ACTIVE_SERVICE');
  });

  it('allows uncapped speed when package speed is unspecified', () => {
    expect(resolveServicePolicy({ usedBytes: 0, now })).toEqual({ state: 'ACTIVE', maxDownloadMbps: Number.POSITIVE_INFINITY, maxUploadMbps: Number.POSITIVE_INFINITY, remainingBytes: null });
  });
});
