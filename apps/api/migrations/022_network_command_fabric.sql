BEGIN;

CREATE TABLE IF NOT EXISTS network_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  router_id uuid REFERENCES routers(id) ON DELETE SET NULL,
  command_type text NOT NULL,
  actor text NOT NULL DEFAULT 'system',
  target jsonb NOT NULL DEFAULT '{}'::jsonb,
  request jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider text,
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','SENT','ACCEPTED','EXECUTED','VERIFIED','FAILED','RETRYING','ABANDONED')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  response jsonb,
  verification jsonb,
  error text,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  completed_at timestamptz,
  verified_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS network_commands_tenant_created_idx
  ON network_commands (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS network_commands_router_status_idx
  ON network_commands (tenant_id, router_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS network_commands_correlation_idx
  ON network_commands (tenant_id, correlation_id)
  WHERE correlation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS network_commands_active_idx
  ON network_commands (tenant_id, status)
  WHERE status IN ('QUEUED','SENT','ACCEPTED','RETRYING');

COMMIT;
