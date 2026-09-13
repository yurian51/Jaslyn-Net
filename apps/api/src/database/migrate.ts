import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from 'pg';

const MIGRATION_LOCK_KEY = 7_421_931;

async function main() {
  const connectionString = process.env.DATABASE_URL || (process.env.DATABASE_HOST && process.env.DATABASE_NAME && process.env.DATABASE_USER ? `postgresql://${encodeURIComponent(process.env.DATABASE_USER)}:${encodeURIComponent(process.env.DATABASE_PASSWORD ?? '')}@${process.env.DATABASE_HOST}/${process.env.DATABASE_NAME}?sslmode=require` : undefined);
  if (!connectionString) throw new Error('DATABASE_URL is required');

  const sslMode = (process.env.DATABASE_SSL ?? 'require').toLowerCase();
  if (!['disable', 'require', 'verify-full'].includes(sslMode)) throw new Error('DATABASE_SSL must be disable, require, or verify-full');
  const ssl = sslMode === 'disable' ? undefined : { rejectUnauthorized: sslMode === 'verify-full' };
  const client = new Client({ connectionString, ssl });
  await client.connect();

  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');

    const migrationDir = join(process.cwd(), 'migrations');
    const files = (await readdir(migrationDir))
      .filter((file) => /^\d+_.+\.sql$/.test(file))
      .sort();

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
