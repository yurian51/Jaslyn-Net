BEGIN;

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'DIRECT' CHECK (kind IN ('DIRECT','GROUP','CHANNEL','SUPPORT','INCIDENT','NOC')),
  title text, description text, is_private boolean NOT NULL DEFAULT true, archived_at timestamptz,
  created_by_user_id uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id), FOREIGN KEY (tenant_id,created_by_user_id) REFERENCES users(tenant_id,id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS conversation_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL, user_id uuid, customer_id uuid,
  role text NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('OWNER','ADMIN','MODERATOR','AGENT','MEMBER','READ_ONLY')),
  joined_at timestamptz NOT NULL DEFAULT now(), left_at timestamptz, muted_until timestamptz,
  last_read_message_id uuid, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,conversation_id) REFERENCES conversations(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,user_id) REFERENCES users(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,customer_id) REFERENCES customers(tenant_id,id) ON DELETE CASCADE,
  CHECK (num_nonnulls(user_id,customer_id)=1)
);
CREATE UNIQUE INDEX IF NOT EXISTS conversation_members_user_uq ON conversation_members(tenant_id,conversation_id,user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS conversation_members_customer_uq ON conversation_members(tenant_id,conversation_id,customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS conversation_members_user_idx ON conversation_members(tenant_id,user_id,left_at,joined_at DESC);
CREATE INDEX IF NOT EXISTS conversation_members_customer_idx ON conversation_members(tenant_id,customer_id,left_at,joined_at DESC);

CREATE TABLE IF NOT EXISTS conversation_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL, name text NOT NULL, description text, archived_at timestamptz,
  created_by_user_id uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id), UNIQUE (tenant_id,conversation_id,name),
  FOREIGN KEY (tenant_id,conversation_id) REFERENCES conversations(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,created_by_user_id) REFERENCES users(tenant_id,id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL, topic_id uuid, sender_user_id uuid, sender_customer_id uuid,
  message_type text NOT NULL DEFAULT 'TEXT' CHECK (message_type IN ('TEXT','SYSTEM','COMMAND','BOT','VOICE','FILE')),
  body text, reply_to_message_id uuid, forwarded_from_message_id uuid, idempotency_key text,
  protected boolean NOT NULL DEFAULT false, edited_at timestamptz, deleted_at timestamptz, deleted_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,conversation_id) REFERENCES conversations(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,topic_id) REFERENCES conversation_topics(tenant_id,id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id,sender_user_id) REFERENCES users(tenant_id,id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id,sender_customer_id) REFERENCES customers(tenant_id,id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id,reply_to_message_id) REFERENCES messages(tenant_id,id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id,forwarded_from_message_id) REFERENCES messages(tenant_id,id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id,deleted_by_user_id) REFERENCES users(tenant_id,id) ON DELETE SET NULL,
  CHECK (num_nonnulls(sender_user_id,sender_customer_id)=1), CHECK (body IS NULL OR length(body)<=10000)
);
CREATE UNIQUE INDEX IF NOT EXISTS messages_idempotency_uq ON messages(tenant_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS messages_conversation_created_idx ON messages(tenant_id,conversation_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS messages_topic_created_idx ON messages(tenant_id,topic_id,created_at DESC) WHERE topic_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS messages_sender_user_idx ON messages(tenant_id,sender_user_id,created_at DESC) WHERE sender_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS messages_body_search_idx ON messages USING gin(to_tsvector('simple',coalesce(body,'')));

CREATE TABLE IF NOT EXISTS message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  message_id uuid NOT NULL, user_id uuid NOT NULL, reaction text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,message_id,user_id,reaction),
  FOREIGN KEY (tenant_id,message_id) REFERENCES messages(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,user_id) REFERENCES users(tenant_id,id) ON DELETE CASCADE,
  CHECK (reaction<>'' AND length(reaction)<=32)
);
CREATE INDEX IF NOT EXISTS message_reactions_message_idx ON message_reactions(tenant_id,message_id,created_at DESC);

CREATE TABLE IF NOT EXISTS message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  message_id uuid NOT NULL, storage_key text NOT NULL, original_name text NOT NULL, mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes>=0), checksum_sha256 text, duration_seconds numeric(12,3),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,message_id) REFERENCES messages(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS message_attachments_message_idx ON message_attachments(tenant_id,message_id);

CREATE TABLE IF NOT EXISTS message_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  message_id uuid NOT NULL, edited_by_user_id uuid NOT NULL, previous_body text, edited_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,message_id) REFERENCES messages(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,edited_by_user_id) REFERENCES users(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS message_edits_message_idx ON message_edits(tenant_id,message_id,edited_at DESC);

CREATE TABLE IF NOT EXISTS message_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL, user_id uuid NOT NULL, last_read_message_id uuid, read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,conversation_id,user_id),
  FOREIGN KEY (tenant_id,conversation_id) REFERENCES conversations(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,user_id) REFERENCES users(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,last_read_message_id) REFERENCES messages(tenant_id,id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS saved_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL, message_id uuid NOT NULL, note text, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,user_id,message_id),
  FOREIGN KEY (tenant_id,user_id) REFERENCES users(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,message_id) REFERENCES messages(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS chat_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL, name text NOT NULL, rules jsonb NOT NULL DEFAULT '{}'::jsonb, position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,user_id,name), FOREIGN KEY (tenant_id,user_id) REFERENCES users(tenant_id,id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL, slug text NOT NULL, public_name text NOT NULL, description text, is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id,id), UNIQUE (tenant_id,slug),
  FOREIGN KEY (tenant_id,conversation_id) REFERENCES conversations(tenant_id,id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS scheduled_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL, created_by_user_id uuid NOT NULL, body text NOT NULL, scheduled_at timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'Africa/Dar_es_Salaam', recurrence jsonb,
  status text NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED','PROCESSING','SENT','CANCELED','FAILED')),
  sent_message_id uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,conversation_id) REFERENCES conversations(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,created_by_user_id) REFERENCES users(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,sent_message_id) REFERENCES messages(tenant_id,id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS scheduled_messages_due_idx ON scheduled_messages(scheduled_at,status) WHERE status='SCHEDULED';

CREATE TABLE IF NOT EXISTS communication_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL, type text NOT NULL, title text NOT NULL, body text, resource_type text, resource_id uuid,
  read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,user_id) REFERENCES users(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS communication_notifications_user_idx ON communication_notifications(tenant_id,user_id,read_at,created_at DESC);

CREATE TABLE IF NOT EXISTS notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL, category text NOT NULL, in_app boolean NOT NULL DEFAULT true, push boolean NOT NULL DEFAULT true,
  email boolean NOT NULL DEFAULT true, sms boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,user_id,category), FOREIGN KEY (tenant_id,user_id) REFERENCES users(tenant_id,id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_presence (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'OFFLINE' CHECK (status IN ('ONLINE','OFFLINE','AWAY','BUSY','INVISIBLE')),
  last_seen_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,user_id), FOREIGN KEY (tenant_id,user_id) REFERENCES users(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS user_presence_expiry_idx ON user_presence(expires_at);

CREATE TABLE IF NOT EXISTS bots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL, username text NOT NULL, description text, enabled boolean NOT NULL DEFAULT true, created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id,username),
  FOREIGN KEY (tenant_id,created_by_user_id) REFERENCES users(tenant_id,id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS bot_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bot_id uuid NOT NULL, command text NOT NULL, description text, permission text NOT NULL,
  requires_confirmation boolean NOT NULL DEFAULT false, enabled boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id,bot_id,command), FOREIGN KEY (tenant_id,bot_id) REFERENCES bots(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS bot_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bot_id uuid NOT NULL, command_id uuid, actor_user_id uuid, conversation_id uuid, request_id text,
  status text NOT NULL CHECK (status IN ('PENDING','SUCCESS','FAILED','DENIED')), input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb, error text, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
  FOREIGN KEY (tenant_id,bot_id) REFERENCES bots(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,command_id) REFERENCES bot_commands(tenant_id,id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id,actor_user_id) REFERENCES users(tenant_id,id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id,conversation_id) REFERENCES conversations(tenant_id,id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS bot_executions_tenant_created_idx ON bot_executions(tenant_id,created_at DESC);

COMMIT;
