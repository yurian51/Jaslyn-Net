import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migration=readFileSync(join(__dirname,'../../migrations/060_database_integrity.sql'),'utf8');

describe('database integrity migration',()=>{
  it('is transactional and fail-closed',()=>{
    expect(migration.trim().startsWith('BEGIN;')).toBe(true);
    expect(migration.trim().endsWith('COMMIT;')).toBe(true);
    expect((migration.match(/RAISE EXCEPTION 'Cannot harden/g)||[]).length).toBe(8);
    expect(migration).not.toMatch(/DELETE FROM|UPDATE\s+[^;]+\s+SET/i);
  });

  it('replaces weak tenant-crossing foreign keys',()=>{
    for(const s of [
      'network_commands_tenant_router_fk',
      'incident_impacts_tenant_incident_fk',
      'vouchers_tenant_batch_fk',
      'ipam_addresses_tenant_customer_fk',
      'ipam_addresses_tenant_router_fk',
      'ipam_addresses_tenant_session_fk',
      'radius_accounting_tenant_nas_fk',
      'radius_events_tenant_nas_fk',
    ]) expect(migration).toContain(s);
  });

  it('covers critical uniqueness and query indexes',()=>{
    expect(migration).toContain('voucher_batches_tenant_id_uq');
    expect(migration).toContain('invoices_purchase_uq');
    expect(migration).toContain('audit_logs_tenant_correlation_idx');
    expect(migration).toContain('ipam_addresses_router_idx');
    expect(migration).toContain('ipam_addresses_session_idx');
  });

  it('is rollback-safe by transaction semantics and has no destructive table operations',()=>{
    expect(migration).not.toMatch(/DROP TABLE|TRUNCATE|DELETE FROM/i);
    expect(migration).toContain('BEGIN;');
    expect(migration).toContain('COMMIT;');
  });
});
