BEGIN;

CREATE TABLE IF NOT EXISTS captive_portal_voucher_attempts (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_fingerprint char(64) NOT NULL CHECK (client_fingerprint ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, client_fingerprint)
);

CREATE INDEX IF NOT EXISTS captive_portal_voucher_attempts_blocked_idx
  ON captive_portal_voucher_attempts (blocked_until)
  WHERE blocked_until IS NOT NULL;

COMMIT;
