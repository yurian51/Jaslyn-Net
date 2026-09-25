BEGIN;

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_user_id uuid,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  request_id text,
  ip_address inet,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, actor_user_id) REFERENCES users(tenant_id, id) ON DELETE SET NULL
);
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS audit_logs_tenant_created_idx ON audit_logs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_tenant_resource_idx ON audit_logs (tenant_id, resource_type, resource_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_tenant_actor_idx ON audit_logs (tenant_id, actor_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('SMS','EMAIL','WHATSAPP','WEBHOOK')),
  recipient text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','SENT','FAILED','CANCELED')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE notification_outbox
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS notification_outbox_pending_idx ON notification_outbox (status, available_at, created_at);
CREATE INDEX IF NOT EXISTS notification_outbox_tenant_idx ON notification_outbox (tenant_id, created_at DESC);

ALTER TABLE routers ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
ALTER TABLE routers ADD COLUMN IF NOT EXISTS api_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE routers ADD COLUMN IF NOT EXISTS api_endpoint text;
ALTER TABLE routers ADD COLUMN IF NOT EXISTS sync_error text;
CREATE INDEX IF NOT EXISTS routers_tenant_status_seen_idx ON routers (tenant_id, status, last_seen_at DESC);

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS mac_address macaddr;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS bytes_total bigint GENERATED ALWAYS AS (bytes_in + bytes_out) STORED;
CREATE INDEX IF NOT EXISTS sessions_tenant_router_active_idx ON sessions (tenant_id, router_id, status, started_at DESC);
CREATE INDEX IF NOT EXISTS sessions_tenant_customer_active_idx ON sessions (tenant_id, customer_id, status, started_at DESC);

CREATE INDEX IF NOT EXISTS purchases_tenant_router_status_idx ON wifi_plan_purchases (tenant_id, router_id, status, ends_at DESC);
CREATE INDEX IF NOT EXISTS access_grants_tenant_active_expiry_idx ON access_grants (tenant_id, status, ends_at DESC);
CREATE INDEX IF NOT EXISTS payment_events_tenant_status_idx ON payment_events (tenant_id, processing_status, created_at DESC);

COMMIT;
