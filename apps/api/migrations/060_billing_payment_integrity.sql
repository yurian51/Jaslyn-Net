BEGIN;

-- Deterministic payment lifecycle. Legacy SUCCESS is normalized to PAID before
-- the stronger state constraint is installed.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check;
UPDATE payments SET status='PAID', updated_at=now() WHERE status='SUCCESS';
ALTER TABLE payments
  ADD CONSTRAINT payments_status_check
  CHECK (status IN ('INITIATED','PENDING','AUTHORIZED','PAID','FAILED','CANCELLED','REVERSED','REFUNDED'));

CREATE OR REPLACE FUNCTION enforce_payment_state_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF (OLD.status='INITIATED' AND NEW.status IN ('PENDING','FAILED','CANCELLED'))
       OR (OLD.status='PENDING' AND NEW.status IN ('AUTHORIZED','PAID','FAILED','CANCELLED'))
       OR (OLD.status='AUTHORIZED' AND NEW.status IN ('PAID','FAILED','CANCELLED','REVERSED'))
       OR (OLD.status='PAID' AND NEW.status IN ('REVERSED','REFUNDED'))
       OR (OLD.status='REVERSED' AND NEW.status='REFUNDED') THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'invalid payment state transition: % -> %', OLD.status, NEW.status
        USING ERRCODE='22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payments_state_transition_trg ON payments;
CREATE TRIGGER payments_state_transition_trg
BEFORE UPDATE OF status ON payments
FOR EACH ROW EXECUTE FUNCTION enforce_payment_state_transition();

DROP INDEX IF EXISTS payments_one_pending_per_purchase_uq;
CREATE UNIQUE INDEX IF NOT EXISTS payments_one_active_attempt_per_purchase_uq
  ON payments (tenant_id,purchase_id)
  WHERE purchase_id IS NOT NULL AND status IN ('INITIATED','PENDING','AUTHORIZED');

-- Entitlements are access_grants in the existing architecture.
ALTER TABLE access_grants DROP CONSTRAINT IF EXISTS access_grants_status_check;
ALTER TABLE access_grants
  ADD CONSTRAINT access_grants_status_check
  CHECK (status IN ('PENDING','ACTIVE','SUSPENDED','EXPIRED','REVOKED'));

CREATE OR REPLACE FUNCTION enforce_entitlement_state_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF (OLD.status='PENDING' AND NEW.status IN ('ACTIVE','EXPIRED','REVOKED'))
       OR (OLD.status='ACTIVE' AND NEW.status IN ('SUSPENDED','EXPIRED','REVOKED'))
       OR (OLD.status='SUSPENDED' AND NEW.status IN ('ACTIVE','EXPIRED','REVOKED')) THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'invalid entitlement state transition: % -> %', OLD.status, NEW.status
        USING ERRCODE='22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS access_grants_state_transition_trg ON access_grants;
CREATE TRIGGER access_grants_state_transition_trg
BEFORE UPDATE OF status ON access_grants
FOR EACH ROW EXECUTE FUNCTION enforce_entitlement_state_transition();

-- Refund requests become idempotent and concurrency-safe.
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS idempotency_key text;
UPDATE refunds SET idempotency_key='legacy-refund:' || id::text WHERE idempotency_key IS NULL;
ALTER TABLE refunds ALTER COLUMN idempotency_key SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS refunds_tenant_idempotency_uq
  ON refunds (tenant_id,idempotency_key);

-- Financial ledger is append-only. Corrections must be represented by new
-- transactions, never by rewriting posted history.
CREATE OR REPLACE FUNCTION prevent_financial_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'financial ledger is immutable; post a compensating transaction'
    USING ERRCODE='55000';
END;
$$;

DROP TRIGGER IF EXISTS financial_ledger_transactions_immutable_trg ON financial_ledger_transactions;
CREATE TRIGGER financial_ledger_transactions_immutable_trg
BEFORE UPDATE OR DELETE ON financial_ledger_transactions
FOR EACH ROW EXECUTE FUNCTION prevent_financial_ledger_mutation();

DROP TRIGGER IF EXISTS financial_ledger_entries_immutable_trg ON financial_ledger_entries;
CREATE TRIGGER financial_ledger_entries_immutable_trg
BEFORE UPDATE OR DELETE ON financial_ledger_entries
FOR EACH ROW EXECUTE FUNCTION prevent_financial_ledger_mutation();

-- Reconciliation lookup/idempotency protections.
CREATE UNIQUE INDEX IF NOT EXISTS reconciliation_items_tenant_payment_run_uq
  ON reconciliation_items (tenant_id,run_id,payment_id)
  WHERE payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payments_reconciliation_lookup_idx
  ON payments (tenant_id,provider,provider_reference,status,created_at DESC)
  WHERE provider_reference IS NOT NULL;

COMMIT;
