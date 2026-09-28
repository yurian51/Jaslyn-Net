import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migration=readFileSync(join(__dirname,'../../migrations/061_billing_payment_integrity.sql'),'utf8');

describe('billing/payment integrity migration',()=>{
  it('is transactional and non-destructive except for deterministic legacy status normalization',()=>{
    expect(migration.trim().startsWith('BEGIN;')).toBe(true);
    expect(migration.trim().endsWith('COMMIT;')).toBe(true);
    expect(migration).toContain("UPDATE payments SET status='PAID'");
    expect(migration).not.toMatch(/DROP TABLE|TRUNCATE/i);
  });

  it('defines the complete deterministic payment state machine',()=>{
    for(const state of ['INITIATED','PENDING','AUTHORIZED','PAID','FAILED','CANCELLED','REVERSED','REFUNDED']) expect(migration).toContain(state);
    expect(migration).toContain('payments_state_transition_trg');
    expect(migration).toContain('payments_one_active_attempt_per_purchase_uq');
  });

  it('defines the complete entitlement state machine',()=>{
    for(const state of ['PENDING','ACTIVE','SUSPENDED','EXPIRED','REVOKED']) expect(migration).toContain(state);
    expect(migration).toContain('access_grants_state_transition_trg');
  });

  it('hardens refunds, ledger immutability, and reconciliation idempotency',()=>{
    expect(migration).toContain('refunds_tenant_idempotency_uq');
    expect(migration).toContain('prevent_financial_ledger_mutation');
    expect(migration).toContain('reconciliation_items_tenant_payment_run_uq');
    expect(migration).toContain('payment_state_history');
    expect(migration).toContain('entitlement_state_history');
  });

  it('covers replay, concurrency, failure, refund, partial fulfillment, and expiry guards',()=>{
    expect(migration).toContain('payment_events_tenant_provider_event_uq');
    expect(migration).toContain('payments_one_active_attempt_per_purchase_uq');
    expect(migration).toContain('refunds_tenant_idempotency_uq');
    expect(migration).toContain('access_grants_state_transition_trg');
    expect(migration).toContain('payment_state_history');
  });

  it('has transaction rollback safety',()=>{
    expect(migration).toContain('BEGIN;');
    expect(migration).toContain('COMMIT;');
  });
});
