BEGIN;

CREATE TABLE IF NOT EXISTS automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  name text NOT NULL,
  event_type text NOT NULL,
  conditions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(conditions)='array'),
  actions jsonb NOT NULL CHECK (jsonb_typeof(actions)='array' AND jsonb_array_length(actions)>0),
  enabled boolean NOT NULL DEFAULT false,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,name),
  FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,updated_by) REFERENCES users(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS automation_rules_event_idx ON automation_rules(tenant_id,event_type,enabled);

CREATE TABLE IF NOT EXISTS automation_rule_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  rule_id uuid NOT NULL,
  event_id uuid NOT NULL,
  event_type text NOT NULL,
  status text NOT NULL CHECK (status IN ('NO_MATCH','MATCHED','SUCCEEDED','FAILED')),
  condition_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  action_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_code text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,rule_id,event_id),
  FOREIGN KEY(tenant_id,rule_id) REFERENCES automation_rules(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS automation_rule_runs_recent_idx ON automation_rule_runs(tenant_id,started_at DESC,status);

CREATE TABLE IF NOT EXISTS automation_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  rule_id uuid NOT NULL,
  event_id uuid NOT NULL,
  severity text NOT NULL CHECK (severity IN ('CRITICAL','HIGH','MEDIUM','LOW','INFO')),
  title text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ACKNOWLEDGED','RESOLVED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,rule_id,event_id),
  FOREIGN KEY(tenant_id,rule_id) REFERENCES automation_rules(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS automation_alerts_open_idx ON automation_alerts(tenant_id,status,severity,created_at DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['automation_rules','automation_rule_runs','automation_alerts'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS jaslyn_financial_audit ON %I',t);
    EXECUTE format('CREATE TRIGGER jaslyn_financial_audit AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION jaslyn_financial_audit_trigger()',t);
  END LOOP;
END $$;

INSERT INTO permission_catalog(permission_key,description) VALUES
 ('automation.read','Read event-driven automation rules, runs and alerts'),
 ('automation.manage','Create, enable and manage deterministic automation rules')
ON CONFLICT(permission_key) DO UPDATE SET description=EXCLUDED.description;

COMMIT;
