BEGIN;

ALTER TABLE customer_service_state
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS customer_service_state_updated_idx
  ON customer_service_state (tenant_id, updated_at DESC);

COMMIT;
