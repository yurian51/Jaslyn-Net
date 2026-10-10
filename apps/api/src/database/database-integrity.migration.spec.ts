import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationPath = join(__dirname, '../../migrations/060_database_integrity_hardening.sql');
const sql = readFileSync(migrationPath, 'utf8');

describe('060 database integrity hardening migration', () => {
  it('is transaction-wrapped and avoids non-transactional DDL', () => {
    expect(sql.trimStart().startsWith('BEGIN;')).toBe(true);
    expect(sql.trimEnd().endsWith('COMMIT;')).toBe(true);
    expect(sql).not.toMatch(/CREATE\s+(UNIQUE\s+)?INDEX\s+CONCURRENTLY/i);
    expect(sql).not.toMatch(/ALTER\s+TYPE/i);
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
  });

  it('preflights existing data before replacing global FKs', () => {
    for (const fragment of [
      'network_commands nc',
      'incident_impacts ii',
      'vouchers v',
      'ipam_addresses a',
      'radius_accounting_events e',
      'radius_events e',
      'ai_runs r',
      'ai_actions a',
    ]) {
      expect(sql).toContain(fragment);
    }
    expect((sql.match(/RAISE EXCEPTION 'Cannot harden/g) ?? []).length).toBe(8);
    expect(sql).toContain('Cannot tenant-scope users.email');
  });

  it('uses tenant-scoped composite FKs for critical relations', () => {
    for (const fragment of [
      'FOREIGN KEY (tenant_id, router_id) REFERENCES routers(tenant_id, id)',
      'FOREIGN KEY (tenant_id, incident_id) REFERENCES incidents(tenant_id, id)',
      'FOREIGN KEY (tenant_id, batch_id) REFERENCES voucher_batches(tenant_id, id)',
      'FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id)',
      'FOREIGN KEY (tenant_id, session_id) REFERENCES sessions(tenant_id, id)',
      'FOREIGN KEY (tenant_id, nas_client_id) REFERENCES radius_nas_clients(tenant_id, id)',
      'FOREIGN KEY (tenant_id, parent_run_id) REFERENCES ai_runs(tenant_id, id)',
      'FOREIGN KEY (tenant_id, run_id) REFERENCES ai_runs(tenant_id, id)',
    ]) {
      expect(sql).toContain(fragment);
    }
  });

  it('keeps database-enforced uniqueness and supporting indexes', () => {
    for (const fragment of [
      'users_tenant_email_lower_uq',
      'voucher_batches_tenant_id_uq',
      'ai_runs_tenant_id_uq',
      'ipam_addresses_router_idx',
      'ipam_addresses_session_idx',
      'radius_accounting_nas_idx',
      'radius_events_nas_idx',
    ]) {
      expect(sql).toContain(fragment);
    }
  });

  it('does not rewrite or delete existing data', () => {
    expect(sql).not.toMatch(/DELETE\s+FROM/i);
    expect(sql).not.toMatch(/UPDATE\s+/i);
  });
});
