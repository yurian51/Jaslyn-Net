BEGIN;

CREATE TABLE IF NOT EXISTS message_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE (tenant_id,id),
  message_id uuid NOT NULL,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'SENT' CHECK (status IN ('SENDING','SENT','DELIVERED','READ','FAILED')),
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,message_id,user_id),
  FOREIGN KEY (tenant_id,message_id) REFERENCES messages(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,user_id) REFERENCES users(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS message_deliveries_user_status_idx ON message_deliveries(tenant_id,user_id,status,updated_at DESC);

CREATE TABLE IF NOT EXISTS pinned_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE (tenant_id,id),
  conversation_id uuid NOT NULL,
  message_id uuid NOT NULL,
  pinned_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,conversation_id,message_id),
  FOREIGN KEY (tenant_id,conversation_id) REFERENCES conversations(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,message_id) REFERENCES messages(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,pinned_by_user_id) REFERENCES users(tenant_id,id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS channel_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE (tenant_id,id),
  channel_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('OWNER','ADMIN','MODERATOR','MEMBER','READ_ONLY')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  UNIQUE (tenant_id,channel_id,user_id),
  FOREIGN KEY (tenant_id,channel_id) REFERENCES channels(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,user_id) REFERENCES users(tenant_id,id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE (tenant_id,id),
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,slug),
  FOREIGN KEY (tenant_id,created_by_user_id) REFERENCES users(tenant_id,id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS community_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE (tenant_id,id),
  community_id uuid NOT NULL,
  user_id uuid,
  customer_id uuid,
  role text NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('OWNER','ADMIN','MODERATOR','MEMBER','READ_ONLY')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  UNIQUE (tenant_id,community_id,user_id),
  UNIQUE (tenant_id,community_id,customer_id),
  FOREIGN KEY (tenant_id,community_id) REFERENCES communities(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,user_id) REFERENCES users(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,customer_id) REFERENCES customers(tenant_id,id) ON DELETE CASCADE,
  CHECK (num_nonnulls(user_id,customer_id)=1)
);

CREATE TABLE IF NOT EXISTS polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE (tenant_id,id),
  conversation_id uuid NOT NULL,
  message_id uuid,
  question text NOT NULL,
  anonymous boolean NOT NULL DEFAULT false,
  multiple_choice boolean NOT NULL DEFAULT false,
  quiz_mode boolean NOT NULL DEFAULT false,
  closes_at timestamptz,
  closed_at timestamptz,
  created_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,conversation_id) REFERENCES conversations(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,message_id) REFERENCES messages(tenant_id,id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id,created_by_user_id) REFERENCES users(tenant_id,id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS poll_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE (tenant_id,id),
  poll_id uuid NOT NULL,
  label text NOT NULL,
  position integer NOT NULL,
  UNIQUE (tenant_id,poll_id,position),
  FOREIGN KEY (tenant_id,poll_id) REFERENCES polls(tenant_id,id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS poll_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE (tenant_id,id),
  poll_id uuid NOT NULL,
  option_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,poll_id,option_id,user_id),
  FOREIGN KEY (tenant_id,poll_id) REFERENCES polls(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,option_id) REFERENCES poll_options(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,user_id) REFERENCES users(tenant_id,id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE (tenant_id,id),
  ticket_number text NOT NULL,
  customer_id uuid,
  conversation_id uuid,
  category text NOT NULL,
  priority text NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH','CRITICAL')),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','WAITING_CUSTOMER','RESOLVED','CLOSED')),
  subject text NOT NULL,
  created_by_user_id uuid,
  assigned_to_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,ticket_number),
  FOREIGN KEY (tenant_id,customer_id) REFERENCES customers(tenant_id,id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id,conversation_id) REFERENCES conversations(tenant_id,id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id,created_by_user_id) REFERENCES users(tenant_id,id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id,assigned_to_user_id) REFERENCES users(tenant_id,id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS incidents_tenant_id_uq ON incidents(tenant_id,id);

CREATE TABLE IF NOT EXISTS incident_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE (tenant_id,id),
  incident_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,incident_id),
  UNIQUE (tenant_id,conversation_id),
  FOREIGN KEY (tenant_id,incident_id) REFERENCES incidents(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,conversation_id) REFERENCES conversations(tenant_id,id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE (tenant_id,id),
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  trigger_type text NOT NULL,
  action_type text NOT NULL,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,created_by_user_id) REFERENCES users(tenant_id,id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS automations_trigger_idx ON automations(tenant_id,trigger_type,enabled);

CREATE TABLE IF NOT EXISTS automation_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE (tenant_id,id),
  automation_id uuid NOT NULL,
  event_id text,
  status text NOT NULL CHECK (status IN ('PENDING','SUCCESS','FAILED','SKIPPED')),
  result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (tenant_id,automation_id,event_id),
  FOREIGN KEY (tenant_id,automation_id) REFERENCES automations(tenant_id,id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE (tenant_id,id),
  user_id uuid NOT NULL,
  title text,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,user_id) REFERENCES users(tenant_id,id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE (tenant_id,id),
  ai_conversation_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('USER','ASSISTANT','TOOL','SYSTEM')),
  content text NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,ai_conversation_id) REFERENCES ai_conversations(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ai_messages_conversation_created_idx ON ai_messages(tenant_id,ai_conversation_id,created_at ASC);

CREATE TABLE IF NOT EXISTS ai_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE (tenant_id,id),
  ai_conversation_id uuid,
  actor_user_id uuid NOT NULL,
  tool_name text NOT NULL,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb,
  status text NOT NULL CHECK (status IN ('PREVIEW','AWAITING_CONFIRMATION','SUCCESS','DENIED','FAILED')),
  requires_confirmation boolean NOT NULL DEFAULT false,
  confirmed_at timestamptz,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  FOREIGN KEY (tenant_id,ai_conversation_id) REFERENCES ai_conversations(tenant_id,id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id,actor_user_id) REFERENCES users(tenant_id,id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS command_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE (tenant_id,id),
  actor_user_id uuid NOT NULL,
  command text NOT NULL,
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL CHECK (status IN ('PREVIEW','AWAITING_CONFIRMATION','SUCCESS','DENIED','FAILED')),
  result jsonb,
  error text,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  FOREIGN KEY (tenant_id,actor_user_id) REFERENCES users(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS command_executions_actor_created_idx ON command_executions(tenant_id,actor_user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS bot_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE (tenant_id,id),
  bot_id uuid NOT NULL,
  permission text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,bot_id,permission),
  FOREIGN KEY (tenant_id,bot_id) REFERENCES bots(tenant_id,id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS conversations_tenant_updated_idx ON conversations(tenant_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS scheduled_messages_tenant_due_idx ON scheduled_messages(tenant_id,scheduled_at,status);
CREATE INDEX IF NOT EXISTS message_reads_tenant_user_idx ON message_reads(tenant_id,user_id,read_at DESC);

COMMIT;
