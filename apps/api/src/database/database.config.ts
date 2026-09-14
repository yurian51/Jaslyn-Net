export type DatabaseRuntimeConfig = {
  connectionString: string;
  ssl: false | { rejectUnauthorized: boolean };
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
  maxUses: number | undefined;
};

export function buildDatabaseConfig(env: Record<string, string | undefined>): DatabaseRuntimeConfig {
  const connectionString = requireNonBlank(env.DATABASE_URL, 'DATABASE_URL');
  const sslMode = (env.DATABASE_SSL ?? 'require').trim().toLowerCase();

  if (sslMode !== 'disable' && sslMode !== 'require' && sslMode !== 'verify-full') {
    throw new Error('DATABASE_SSL must be one of: disable, require, verify-full');
  }

  return {
    connectionString,
    ssl: sslMode === 'disable' ? false : { rejectUnauthorized: sslMode === 'verify-full' },
    max: parsePositiveInteger(env.DATABASE_POOL_MAX, 'DATABASE_POOL_MAX', 10),
    idleTimeoutMillis: parseNonNegativeInteger(env.DATABASE_IDLE_TIMEOUT_MS, 'DATABASE_IDLE_TIMEOUT_MS', 30_000),
    connectionTimeoutMillis: parsePositiveInteger(env.DATABASE_CONNECTION_TIMEOUT_MS, 'DATABASE_CONNECTION_TIMEOUT_MS', 5_000),
    maxUses: parseNonNegativeIntegerOrUndefined(env.DATABASE_POOL_MAX_USES, 'DATABASE_POOL_MAX_USES'),
  };
}

function requireNonBlank(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function parsePositiveInteger(value: string | undefined, name: string, fallback: number): number {
  const parsed = parseInteger(value, name, fallback);
  if (parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function parseNonNegativeInteger(value: string | undefined, name: string, fallback: number): number {
  const parsed = parseInteger(value, name, fallback);
  if (parsed < 0) throw new Error(`${name} must be a non-negative integer`);
  return parsed;
}

function parseNonNegativeIntegerOrUndefined(value: string | undefined, name: string): number | undefined {
  if (value === undefined || value.trim() === '' || value.trim() === '0') return undefined;
  return parseNonNegativeInteger(value, name, 0);
}

function parseInteger(value: string | undefined, name: string, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  if (!/^[0-9]+$/.test(value.trim())) throw new Error(`${name} must be an integer`);
  const parsed = Number(value.trim());
  if (!Number.isSafeInteger(parsed)) throw new Error(`${name} is outside the safe integer range`);
  return parsed;
}
