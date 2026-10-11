BEGIN;

CREATE TABLE IF NOT EXISTS automation_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  trigger_type text NOT NULL CHECK (trigger_type IN ('MANUAL','EVENT','SCHEDULE','WEBHOOK')),
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(trigger_config)='object'),
  steps jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(steps)='array' AND jsonb_array_length(steps) BETWEEN 1 AND 30),
  enabled boolean NOT NULL DEFAULT false,
  webhook_token_hash text,
  next_run_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,name),
  FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,updated_by) REFERENCES users(tenant_id,id) ON DELETE RESTRICT,
  CHECK ((trigger_type='WEBHOOK' AND webhook_token_hash IS NOT NULL) OR trigger_type<>'WEBHOOK')
);
CREATE INDEX IF NOT EXISTS automation_workflows_due_idx ON automation_workflows(enabled,trigger_type,next_run_at);
CREATE INDEX IF NOT EXISTS automation_workflows_tenant_idx ON automation_workflows(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS automation_workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  workflow_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  trigger_type text NOT NULL CHECK (trigger_type IN ('MANUAL','EVENT','SCHEDULE','WEBHOOK')),
  trigger_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','RUNNING','WAITING_APPROVAL','SUCCEEDED','FAILED','CANCELLED')),
  current_step integer NOT NULL DEFAULT 0 CHECK (current_step>=0),
  step_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts>=0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,workflow_id,idempotency_key),
  FOREIGN KEY(tenant_id,workflow_id) REFERENCES automation_workflows(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS automation_workflow_runs_due_idx ON automation_workflow_runs(status,next_attempt_at,created_at);
CREATE INDEX IF NOT EXISTS automation_workflow_runs_tenant_idx ON automation_workflow_runs(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS automation_workflow_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  run_id uuid NOT NULL,
  step_index integer NOT NULL,
  title text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid,
  decision_note text,
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,run_id,step_index),
  FOREIGN KEY(tenant_id,run_id) REFERENCES automation_workflow_runs(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,decided_by) REFERENCES users(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS automation_workflow_approvals_pending_idx ON automation_workflow_approvals(tenant_id,status,requested_at DESC);

CREATE TABLE IF NOT EXISTS automation_workflow_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  run_id uuid NOT NULL,
  step_index integer NOT NULL,
  severity text NOT NULL CHECK (severity IN ('CRITICAL','HIGH','MEDIUM','LOW','INFO')),
  title text NOT NULL CHECK (length(title) BETWEEN 3 AND 180),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ACKNOWLEDGED','RESOLVED')),
  resolution_note text,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,run_id,step_index),
  FOREIGN KEY(tenant_id,run_id) REFERENCES automation_workflow_runs(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,resolved_by) REFERENCES users(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS automation_workflow_alerts_open_idx ON automation_workflow_alerts(tenant_id,status,severity,created_at DESC);

CREATE TABLE IF NOT EXISTS automation_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  name text NOT NULL,
  provider_type text NOT NULL CHECK (provider_type IN ('WEBHOOK','REST_API','SMS','PAYMENT','NETWORK_CONTROLLER')),
  base_url text,
  secret_ref uuid,
  config jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config)='object'),
  enabled boolean NOT NULL DEFAULT false,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,name),
  FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,updated_by) REFERENCES users(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,secret_ref) REFERENCES tenant_secrets(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS automation_integrations_tenant_idx ON automation_integrations(tenant_id,created_at DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['automation_workflows','automation_workflow_runs','automation_workflow_approvals','automation_workflow_alerts','automation_integrations'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS jaslyn_financial_audit ON %I',t);
    EXECUTE format('CREATE TRIGGER jaslyn_financial_audit AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION jaslyn_financial_audit_trigger()',t);
  END LOOP;
END $$;

INSERT INTO permission_catalog(permission_key,description) VALUES
 ('automation.workflow.read','Read workflow definitions, executions, approvals and integrations'),
 ('automation.workflow.manage','Create and edit workflow definitions and integrations'),
 ('automation.workflow.approve','Approve or reject gated workflow actions')
ON CONFLICT(permission_key) DO UPDATE SET description=EXCLUDED.description;

COMMIT;
