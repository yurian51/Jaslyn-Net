BEGIN;

-- ACTIVE means current network evidence supports the session.
-- STALE preserves the record when the control plane can no longer prove that
-- an ACTIVE session is still present. Historical evidence is never deleted.
ALTER TABLE sessions
  DROP CONSTRAINT IF EXISTS sessions_status_check;

ALTER TABLE sessions
  ADD CONSTRAINT sessions_status_check CHECK (status IN ('ACTIVE','STALE','ENDED'));

CREATE INDEX IF NOT EXISTS sessions_tenant_stale_idx
  ON sessions (tenant_id, router_id, started_at DESC)
  WHERE status = 'STALE';

COMMIT;
