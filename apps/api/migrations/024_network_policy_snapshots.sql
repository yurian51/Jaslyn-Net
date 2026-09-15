BEGIN;

ALTER TABLE access_grants
  ADD COLUMN IF NOT EXISTS network_policy jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS access_grants_policy_gin_idx
  ON access_grants USING gin (network_policy);

COMMIT;
