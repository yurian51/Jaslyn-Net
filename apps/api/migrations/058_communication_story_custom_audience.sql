BEGIN;

ALTER TABLE stories
  DROP CONSTRAINT IF EXISTS stories_audience_check;

ALTER TABLE stories
  ADD CONSTRAINT stories_audience_check
  CHECK (audience IN ('PUBLIC','CONTACTS','PRIVATE','CUSTOM'));

CREATE TABLE IF NOT EXISTS story_allowed_users (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  story_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,story_id,user_id),
  FOREIGN KEY (tenant_id,story_id) REFERENCES stories(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,user_id) REFERENCES users(tenant_id,id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS story_allowed_users_user_idx
  ON story_allowed_users(tenant_id,user_id,story_id);

COMMIT;
