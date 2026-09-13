BEGIN;

ALTER TABLE routers
  ADD COLUMN IF NOT EXISTS management_credentials_encrypted text,
  ADD COLUMN IF NOT EXISTS management_credentials_version integer NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS routers_management_credentials_idx
  ON routers (tenant_id, management_protocol)
  WHERE management_enabled=true AND management_credentials_encrypted IS NOT NULL;

COMMIT;
