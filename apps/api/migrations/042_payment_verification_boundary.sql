BEGIN;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_source text;

ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_verification_status_chk;
ALTER TABLE payments
  ADD CONSTRAINT payments_verification_status_chk
  CHECK (verification_status IN ('UNVERIFIED','PENDING','VERIFIED','REJECTED'));

CREATE INDEX IF NOT EXISTS payments_verification_idx
  ON payments (tenant_id, verification_status, updated_at DESC);

CREATE OR REPLACE FUNCTION enforce_payment_state_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'PENDING' AND NEW.status IN ('SUCCESS','FAILED') THEN
      NULL;
    ELSIF OLD.status = 'SUCCESS' AND NEW.status = 'REFUNDED' THEN
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

ALTER TABLE payment_events
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'RECEIVED',
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_source text;

ALTER TABLE payment_events
  DROP CONSTRAINT IF EXISTS payment_events_verification_status_chk;
ALTER TABLE payment_events
  ADD CONSTRAINT payment_events_verification_status_chk
  CHECK (verification_status IN ('RECEIVED','VERIFIED','REJECTED'));

CREATE INDEX IF NOT EXISTS payment_events_verification_idx
  ON payment_events (tenant_id, verification_status, created_at DESC);

COMMIT;
