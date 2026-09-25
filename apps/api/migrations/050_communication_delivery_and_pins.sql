BEGIN;

-- 049 owns the delivery/pin tables. This migration only hardens their schema.
ALTER TABLE message_deliveries
  ADD COLUMN IF NOT EXISTS failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS error text;

CREATE INDEX IF NOT EXISTS message_deliveries_message_status_idx
  ON message_deliveries(tenant_id,message_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS message_deliveries_user_status_idx
  ON message_deliveries(tenant_id,user_id,status,updated_at DESC);

CREATE INDEX IF NOT EXISTS pinned_messages_conversation_idx
  ON pinned_messages(tenant_id,conversation_id,created_at DESC);

CREATE INDEX IF NOT EXISTS messages_tenant_created_idx
  ON messages(tenant_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS message_attachments_tenant_created_idx
  ON message_attachments(tenant_id,created_at DESC);
CREATE INDEX IF NOT EXISTS saved_messages_user_created_idx
  ON saved_messages(tenant_id,user_id,created_at DESC);

COMMIT;
