BEGIN;

ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS assignee_user_id uuid;

ALTER TABLE incidents
  DROP CONSTRAINT IF EXISTS incidents_assignee_fk;

ALTER TABLE incidents
  ADD CONSTRAINT incidents_assignee_fk
  FOREIGN KEY (tenant_id, assignee_user_id)
  REFERENCES users(tenant_id, id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS incidents_tenant_assignee_idx
  ON incidents (tenant_id, assignee_user_id, status, last_seen_at DESC);

COMMIT;
