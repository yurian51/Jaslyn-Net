import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from 'pg';

const MIGRATION_LOCK_KEY = 7_421_931;

/**
 * Some historical migration files were renamed with an alphabetic suffix to
 * resolve prefix collisions. Production may already have applied the exact
 * same SQL under the original version. Only list aliases whose SQL is identical.
 */
export const LEGACY_MIGRATION_ALIASES: Record<string, string[]> = {
  '005a_payment_indexes': ['005_payment_indexes'],
  '044a_radius_correlation_convergence': ['044_radius_correlation_convergence'],
  '045a_invoice_number_sequences': ['045_invoice_number_sequences'],
  '046a_upesipay_capabilities': ['046_upesipay_capabilities'],
  '048a_remove_upesilipa_subsystem': ['048_remove_upesilipa_subsystem'],
  '060a_sms_delivery_provider': ['060_sms_delivery_provider'],
  '061a_sms_campaigns': ['061_sms_campaigns'],
  '062a_sms_provider_configs': ['062_sms_provider_configs'],
  '071a_public_captive_portal_voucher_security': ['071_public_captive_portal_voucher_security'],
  '075_event_driven_automation': ['074_event_driven_automation'],
  '076_tenant_usage_quotas': ['075_tenant_usage_quotas'],
  '077_financial_audit_head_guard': ['076_financial_audit_head_guard'],
  '077a_workflow_automation_engine': ['077_workflow_automation_engine'],
};

export function findLegacyMigrationAlias(version: string, appliedVersions: ReadonlySet<string>): string | undefined {
  return LEGACY_MIGRATION_ALIASES[version]?.find((legacyVersion) => appliedVersions.has(legacyVersion));
}

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
  const client = new Client({
    connectionString,
    ssl: buildSsl(process.env),
    connectionTimeoutMillis: 15_000,
    query_timeout: 60_000,
  });

  console.log('Migration runner: connecting to PostgreSQL');
  await client.connect();
  console.log('Migration runner: PostgreSQL connection established');

  let lockAcquired = false;

  try {
    const lockResult = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [MIGRATION_LOCK_KEY]);
    lockAcquired = Boolean(lockResult.rows[0]?.acquired);
    if (!lockAcquired) {
      throw new Error('Migration lock is already held by another Jaslyn Net migration process');
    }
    console.log('Migration runner: migration lock acquired');

    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const appliedRows = await client.query<{ version: string }>('SELECT version FROM schema_migrations');
    const appliedVersions = new Set(appliedRows.rows.map((row) => row.version));

    const migrationDir = join(process.cwd(), 'migrations');
    const files = (await readdir(migrationDir)).filter((file) => /^\d+[a-z]?_.+\.sql$/.test(file)).sort();

    for (const file of files) {
      const version = file.replace(/\.sql$/, '');
      if (appliedVersions.has(version)) continue;

      const legacyAlias = findLegacyMigrationAlias(version, appliedVersions);
      if (legacyAlias) {
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING', [version]);
        appliedVersions.add(version);
        console.log(`Skipping migration ${version}; equivalent legacy migration ${legacyAlias} is already applied`);
        continue;
      }

      const sql = await readFile(join(migrationDir, file), 'utf8');
      console.log(`Applying migration ${version}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
        await client.query('COMMIT');
        console.log(`Applied migration ${version}`);
        appliedVersions.add(version);
      } catch (error) {
        await client.query('ROLLBACK');
        console.error(`Migration failed: ${version}`);
        throw error;
      }
    }

    console.log('Migration runner: all migrations applied');
  } finally {
    if (lockAcquired) {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => undefined);
    }
    await client.end();
    console.log('Migration runner: connection closed');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
