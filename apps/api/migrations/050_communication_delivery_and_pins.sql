BEGIN;

CREATE TABLE IF NOT EXISTS message_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  message_id uuid NOT NULL,
  user_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('SENT','DELIVERED','READ','FAILED')),
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,message_id,user_id),
  FOREIGN KEY (tenant_id,message_id) REFERENCES messages(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,user_id) REFERENCES users(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS message_deliveries_message_status_idx
  ON message_deliveries(tenant_id,message_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS message_deliveries_user_status_idx
  ON message_deliveries(tenant_id,user_id,status,updated_at DESC);

CREATE TABLE IF NOT EXISTS pinned_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  message_id uuid NOT NULL,
  pinned_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,conversation_id,message_id),
  FOREIGN KEY (tenant_id,conversation_id) REFERENCES conversations(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,message_id) REFERENCES messages(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,pinned_by_user_id) REFERENCES users(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS pinned_messages_conversation_idx
  ON pinned_messages(tenant_id,conversation_id,created_at DESC);

CREATE INDEX IF NOT EXISTS messages_tenant_created_idx
  ON messages(tenant_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS message_attachments_tenant_created_idx
  ON message_attachments(tenant_id,created_at DESC);
CREATE INDEX IF NOT EXISTS saved_messages_user_created_idx
  ON saved_messages(tenant_id,user_id,created_at DESC);

COMMIT;
