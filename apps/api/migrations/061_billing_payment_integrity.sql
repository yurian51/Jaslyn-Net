BEGIN;

-- Deterministic financial state machines and replay-safe settlement primitives.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS provider_event_id text;

ALTER TABLE refunds
  ADD COLUMN IF NOT EXISTS idempotency_key text;

-- Remove the legacy transition trigger/constraint before normalizing SUCCESS -> PAID.
DROP TRIGGER IF EXISTS payments_state_transition_trg ON payments;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_chk;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_state_chk;
UPDATE payments SET status='PAID' WHERE status='SUCCESS';

ALTER TABLE payments
  ADD CONSTRAINT payments_status_chk
  CHECK (status IN ('INITIATED','PENDING','AUTHORIZED','PAID','FAILED','CANCELLED','REVERSED','REFUNDED'));

CREATE UNIQUE INDEX IF NOT EXISTS refunds_tenant_idempotency_uq
  ON refunds (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_event_uq
  ON payments (tenant_id, provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

DROP INDEX IF EXISTS payments_one_pending_per_purchase_uq;
CREATE UNIQUE INDEX IF NOT EXISTS payments_one_active_attempt_per_purchase_uq
  ON payments (tenant_id, purchase_id)
  WHERE purchase_id IS NOT NULL
    AND status IN ('INITIATED','PENDING','AUTHORIZED');

ALTER TABLE access_grants DROP CONSTRAINT IF EXISTS access_grants_status_chk;
ALTER TABLE access_grants
  ADD CONSTRAINT access_grants_status_chk
  CHECK (status IN ('PENDING','ACTIVE','SUSPENDED','EXPIRED','REVOKED'));

CREATE OR REPLACE FUNCTION enforce_payment_state_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'INITIATED' AND NEW.status IN ('PENDING','CANCELLED','FAILED') THEN
      NULL;
    ELSIF OLD.status = 'PENDING' AND NEW.status IN ('AUTHORIZED','PAID','FAILED','CANCELLED') THEN
      NULL;
    ELSIF OLD.status = 'AUTHORIZED' AND NEW.status IN ('PAID','FAILED','CANCELLED') THEN
      NULL;
    ELSIF OLD.status = 'PAID' AND NEW.status IN ('REVERSED','REFUNDED') THEN
      NULL;
    ELSIF OLD.status = 'REVERSED' AND NEW.status = 'REFUNDED' THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'invalid payment state transition: % -> %', OLD.status, NEW.status
        USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payments_state_transition_trg ON payments;
CREATE TRIGGER payments_state_transition_trg
BEFORE UPDATE OF status ON payments
FOR EACH ROW
EXECUTE FUNCTION enforce_payment_state_transition();

CREATE OR REPLACE FUNCTION enforce_entitlement_state_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'PENDING' AND NEW.status IN ('ACTIVE','REVOKED','EXPIRED') THEN
      NULL;
    ELSIF OLD.status = 'ACTIVE' AND NEW.status IN ('SUSPENDED','EXPIRED','REVOKED') THEN
      NULL;
    ELSIF OLD.status = 'SUSPENDED' AND NEW.status IN ('ACTIVE','EXPIRED','REVOKED') THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'invalid entitlement state transition: % -> %', OLD.status, NEW.status
        USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS access_grants_state_transition_trg ON access_grants;
CREATE TRIGGER access_grants_state_transition_trg
BEFORE UPDATE OF status ON access_grants
FOR EACH ROW
EXECUTE FUNCTION enforce_entitlement_state_transition();

CREATE OR REPLACE FUNCTION prevent_financial_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'financial ledger is immutable; create a reversal or adjustment instead'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS financial_ledger_transactions_immutable_trg ON financial_ledger_transactions;
CREATE TRIGGER financial_ledger_transactions_immutable_trg
BEFORE UPDATE OR DELETE ON financial_ledger_transactions
FOR EACH ROW
EXECUTE FUNCTION prevent_financial_ledger_mutation();

DROP TRIGGER IF EXISTS financial_ledger_entries_immutable_trg ON financial_ledger_entries;
CREATE TRIGGER financial_ledger_entries_immutable_trg
BEFORE UPDATE OR DELETE ON financial_ledger_entries
FOR EACH ROW
EXECUTE FUNCTION prevent_financial_ledger_mutation();

CREATE INDEX IF NOT EXISTS payment_reconciliation_idx
  ON payments (tenant_id, provider, status, provider_reference, updated_at DESC);

CREATE INDEX IF NOT EXISTS access_grants_expiry_idx
  ON access_grants (tenant_id, status, ends_at);

COMMIT;
