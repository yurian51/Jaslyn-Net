BEGIN;

-- A device MAC must not have two simultaneous sessions on the same tenant/router.
-- Historical rows are left untouched; only active sessions are constrained.
CREATE UNIQUE INDEX IF NOT EXISTS sessions_active_router_mac_uq
  ON sessions (tenant_id, router_id, mac_address)
  WHERE status = 'ACTIVE' AND router_id IS NOT NULL AND mac_address IS NOT NULL;

CREATE INDEX IF NOT EXISTS sessions_tenant_started_idx
  ON sessions (tenant_id, started_at DESC);

CREATE INDEX IF NOT EXISTS sessions_tenant_mac_idx
  ON sessions (tenant_id, mac_address, started_at DESC)
  WHERE mac_address IS NOT NULL;

COMMIT;
