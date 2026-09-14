import { buildDatabaseConfig } from './database.config';

describe('buildDatabaseConfig', () => {
  const base = { DATABASE_URL: 'postgresql://user:pass@localhost:5432/app' };

  it('uses safe defaults and required TLS by default', () => {
    expect(buildDatabaseConfig(base)).toEqual({
      connectionString: base.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      maxUses: undefined,
    });
  });

  it('accepts explicit verify-full TLS', () => {
    expect(buildDatabaseConfig({ ...base, DATABASE_SSL: 'verify-full' }).ssl).toEqual({ rejectUnauthorized: true });
  });

  it('accepts disabled TLS only when explicitly configured', () => {
    expect(buildDatabaseConfig({ ...base, DATABASE_SSL: 'disable' }).ssl).toBe(false);
  });

  it('rejects unknown TLS modes', () => {
    expect(() => buildDatabaseConfig({ ...base, DATABASE_SSL: 'anything' })).toThrow('DATABASE_SSL must be one of: disable, require, verify-full');
  });

  it('rejects malformed numeric settings', () => {
    expect(() => buildDatabaseConfig({ ...base, DATABASE_POOL_MAX: 'ten' })).toThrow('DATABASE_POOL_MAX must be an integer');
    expect(() => buildDatabaseConfig({ ...base, DATABASE_POOL_MAX: '0' })).toThrow('DATABASE_POOL_MAX must be a positive integer');
    expect(() => buildDatabaseConfig({ ...base, DATABASE_CONNECTION_TIMEOUT_MS: '-1' })).toThrow('DATABASE_CONNECTION_TIMEOUT_MS must be an integer');
    expect(() => buildDatabaseConfig({ ...base, DATABASE_IDLE_TIMEOUT_MS: '-1' })).toThrow('DATABASE_IDLE_TIMEOUT_MS must be an integer');
    expect(() => buildDatabaseConfig({ ...base, DATABASE_POOL_MAX_USES: '-1' })).toThrow('DATABASE_POOL_MAX_USES must be an integer');
  });

  it('treats zero max uses as disabled', () => {
    expect(buildDatabaseConfig({ ...base, DATABASE_POOL_MAX_USES: '0' }).maxUses).toBeUndefined();
  });

  it('rejects an empty database URL', () => {
    expect(() => buildDatabaseConfig({ ...base, DATABASE_URL: '   ' })).toThrow('DATABASE_URL is required');
  });
});
