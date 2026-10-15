import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { stripOuterTransactionWrapper } from './migration-sql';

/**
 * Builds a single SQL file for provisioning a BRAND-NEW PostgreSQL database.
 * Keep individual migrations as the source of truth. Do not run this bundle
 * against a database where some migrations may already have been applied.
 */
async function main() {
  const migrationDir = resolve(process.cwd(), 'migrations');
  const outputPath = resolve(process.cwd(), 'combined-migrations.sql');
  const files = (await readdir(migrationDir))
    .filter((file) => /^\d+[a-z]?_.+\.sql$/.test(file))
    .sort();

  if (files.length === 0) throw new Error(`No SQL migrations found in ${migrationDir}`);

  const sections: string[] = [
    '-- Jaslyn Net combined migration bundle',
    '-- GENERATED FILE: do not edit; run pnpm --filter @jaslyn-net/api migrate:bundle',
    '-- For a brand-new database only. Existing databases must use the normal migrate command.',
    'CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());',
    '',
  ];

  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    const raw = await readFile(join(migrationDir, file), 'utf8');
    const sql = stripOuterTransactionWrapper(raw).trim();
    sections.push(`-- BEGIN MIGRATION: ${file}`);
    sections.push('BEGIN;');
    sections.push(sql);
    sections.push(`INSERT INTO schema_migrations(version) VALUES ('${version.replace(/'/g, "''")}') ON CONFLICT (version) DO NOTHING;`);
    sections.push('COMMIT;');
    sections.push(`-- END MIGRATION: ${file}`, '');
  }

  await writeFile(outputPath, sections.join('\n') + '\n', { encoding: 'utf8', flag: 'w' });
  console.log(`Created ${outputPath} from ${files.length} ordered migration files.`);
  console.log('Use only on a brand-new database; for upgrades use pnpm --filter @jaslyn-net/api migrate.');
}

main().catch((error) => {
  console.error('Failed to build combined migrations:', error);
  process.exitCode = 1;
});
