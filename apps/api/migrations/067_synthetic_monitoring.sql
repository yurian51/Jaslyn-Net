BEGIN;

CREATE TABLE IF NOT EXISTS synthetic_monitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 160),
  check_type text NOT NULL CHECK (check_type IN ('HTTP','DNS','CAPTIVE_PORTAL')),
  target text NOT NULL CHECK (length(target) BETWEEN 3 AND 2048),
  expected_status integer NOT NULL DEFAULT 200 CHECK (expected_status BETWEEN 100 AND 599),
  interval_seconds integer NOT NULL DEFAULT 300 CHECK (interval_seconds BETWEEN 30 AND 3600),
  timeout_ms integer NOT NULL DEFAULT 5000 CHECK (timeout_ms BETWEEN 1000 AND 10000),
  enabled boolean NOT NULL DEFAULT true,
  next_check_at timestamptz NOT NULL DEFAULT now(),
  last_status text CHECK (last_status IN ('PASS','FAIL','UNKNOWN')),
  last_latency_ms integer,
  last_response_code integer,
  last_error text,
  last_checked_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,created_by) REFERENCES users(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS synthetic_monitors_due_idx
  ON synthetic_monitors (next_check_at) WHERE enabled=true;
CREATE INDEX IF NOT EXISTS synthetic_monitors_tenant_idx
  ON synthetic_monitors (tenant_id,enabled,created_at DESC);

CREATE TABLE IF NOT EXISTS synthetic_check_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  monitor_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('PASS','FAIL','UNKNOWN')),
  latency_ms integer,
  response_code integer,
  error text,
  checked_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,monitor_id) REFERENCES synthetic_monitors(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS synthetic_check_results_history_idx
  ON synthetic_check_results (tenant_id,monitor_id,checked_at DESC);

COMMIT;
