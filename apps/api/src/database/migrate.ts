import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from 'pg';

const MIGRATION_LOCK_KEY = 7_421_931;

function buildConnectionString(env: NodeJS.ProcessEnv): string {
  const direct = env.DATABASE_URL?.trim();
  if (direct) return direct;

  const host = env.DATABASE_HOST?.trim();
  const name = env.DATABASE_NAME?.trim();
  const user = env.DATABASE_USER?.trim();
  if (!host || !name || !user) {
    throw new Error('DATABASE_URL is required (or DATABASE_HOST, DATABASE_NAME, and DATABASE_USER must be provided)');
  }

  const password = env.DATABASE_PASSWORD ?? '';
  const port = env.DATABASE_PORT?.trim() || '5432';
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(name)}`;
}

function buildSsl(env: NodeJS.ProcessEnv): false | { rejectUnauthorized: boolean } {
  const sslMode = (env.DATABASE_SSL ?? 'require').trim().toLowerCase();
  if (!['disable', 'require', 'verify-full'].includes(sslMode)) {
    throw new Error('DATABASE_SSL must be disable, require, or verify-full');
  }
  return sslMode === 'disable' ? false : { rejectUnauthorized: sslMode === 'verify-full' };
}

async function main() {
  const connectionString = buildConnectionString(process.env);
  const client = new Client({ connectionString, ssl: buildSsl(process.env) });
  await client.connect();

  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');

    const migrationDir = join(process.cwd(), 'migrations');
    const files = (await readdir(migrationDir)).filter((file) => /^\d+_.+\.sql$/.test(file)).sort();

    for (const file of files) {
      const version = file.replace(/\.sql$/, '');
      const applied = await client.query('SELECT 1 FROM schema_migrations WHERE version = $1', [version]);
      if (applied.rowCount) continue;

      const sql = await readFile(join(migrationDir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
        await client.query('COMMIT');
        console.log(`Applied migration ${version}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => undefined);
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
