BEGIN;

CREATE TABLE IF NOT EXISTS network_policy_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  policy_key text NOT NULL CHECK (length(policy_key) BETWEEN 2 AND 100),
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 160),
  description text,
  scope_type text NOT NULL DEFAULT 'TENANT' CHECK (scope_type IN ('TENANT','ROUTER')),
  scope_id uuid,
  desired_state jsonb NOT NULL CHECK (jsonb_typeof(desired_state)='object'),
  enforcement_mode text NOT NULL DEFAULT 'MONITOR' CHECK (enforcement_mode IN ('MONITOR','REQUIRE_APPROVAL')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAUSED')),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,policy_key),
  UNIQUE (tenant_id,id),
  CHECK ((scope_type='TENANT' AND scope_id IS NULL) OR (scope_type='ROUTER' AND scope_id IS NOT NULL)),
  FOREIGN KEY (tenant_id,scope_id) REFERENCES routers(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,created_by) REFERENCES users(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,updated_by) REFERENCES users(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS network_policy_active_idx
  ON network_policy_definitions (tenant_id,status,scope_type);

CREATE TABLE IF NOT EXISTS network_policy_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  policy_id uuid NOT NULL,
  router_id uuid NOT NULL,
  result text NOT NULL CHECK (result IN ('IN_SYNC','DRIFT','UNVERIFIED','FAILED')),
  observed_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  drift jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'DATABASE_CONFIGURATION',
  live_device_verified boolean NOT NULL DEFAULT false,
  error text,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,policy_id) REFERENCES network_policy_definitions(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,router_id) REFERENCES routers(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS network_policy_evaluations_recent_idx
  ON network_policy_evaluations (tenant_id,policy_id,evaluated_at DESC);

CREATE TABLE IF NOT EXISTS compliance_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING','COMPLETED','FAILED')),
  scanned_resources integer NOT NULL DEFAULT 0,
  high_findings integer NOT NULL DEFAULT 0,
  medium_findings integer NOT NULL DEFAULT 0,
  low_findings integer NOT NULL DEFAULT 0,
  unverified_resources integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  error text,
  created_by uuid,
  FOREIGN KEY (tenant_id,created_by) REFERENCES users(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS compliance_scans_recent_idx
  ON compliance_scans (tenant_id,started_at DESC);

CREATE TABLE IF NOT EXISTS compliance_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  scan_id uuid NOT NULL,
  rule_key text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('HIGH','MEDIUM','LOW','INFO')),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED','ACCEPTED')),
  resource_type text NOT NULL,
  resource_id uuid NOT NULL,
  title text NOT NULL,
  details text NOT NULL,
  resolution_note text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  FOREIGN KEY (tenant_id,scan_id) REFERENCES compliance_scans(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,resource_id) REFERENCES routers(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS compliance_findings_status_idx
  ON compliance_findings (tenant_id,status,severity,created_at DESC);

COMMIT;
