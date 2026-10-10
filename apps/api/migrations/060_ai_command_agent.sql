BEGIN;

CREATE TABLE IF NOT EXISTS ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'Jaslyn Command Chat',
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,user_id) REFERENCES users(tenant_id,id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ai_conversations_tenant_user_idx
  ON ai_conversations(tenant_id,user_id,status,updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ai_conversation_id uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('USER','ASSISTANT','TOOL')),
  content text NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,ai_conversation_id) REFERENCES ai_conversations(tenant_id,id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ai_messages_conversation_created_idx
  ON ai_messages(tenant_id,ai_conversation_id,created_at ASC);

CREATE TABLE IF NOT EXISTS ai_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ai_conversation_id uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL,
  tool_name text NOT NULL,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL CHECK (status IN ('AWAITING_CONFIRMATION','EXECUTING','SUCCESS','FAILED')),
  requires_confirmation boolean NOT NULL DEFAULT false,
  confirmed_at timestamptz,
  request_id uuid NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,ai_conversation_id) REFERENCES ai_conversations(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,actor_user_id) REFERENCES users(tenant_id,id) ON DELETE CASCADE,
  UNIQUE (tenant_id,request_id)
);

CREATE INDEX IF NOT EXISTS ai_executions_tenant_created_idx
  ON ai_executions(tenant_id,created_at DESC);

CREATE INDEX IF NOT EXISTS ai_executions_pending_idx
  ON ai_executions(tenant_id,status,created_at)
  WHERE status IN ('AWAITING_CONFIRMATION','EXECUTING');

CREATE INDEX IF NOT EXISTS ai_executions_conversation_idx
  ON ai_executions(tenant_id,ai_conversation_id,created_at DESC);

COMMIT;