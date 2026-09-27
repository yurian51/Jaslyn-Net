BEGIN;

ALTER TABLE pinned_messages
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE INDEX IF NOT EXISTS pinned_messages_expiry_idx
  ON pinned_messages(tenant_id,conversation_id,expires_at)
  WHERE expires_at IS NOT NULL;

COMMIT;
