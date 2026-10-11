BEGIN;

CREATE TABLE IF NOT EXISTS revenue_reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING','COMPLETED','FAILED')),
  checked_purchases integer NOT NULL DEFAULT 0,
  checked_payments integer NOT NULL DEFAULT 0,
  checked_entitlements integer NOT NULL DEFAULT 0,
  discrepancies_found integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  error text,
  created_by uuid,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,created_by) REFERENCES users(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS revenue_reconciliation_runs_recent_idx
  ON revenue_reconciliation_runs (tenant_id,started_at DESC);

CREATE TABLE IF NOT EXISTS revenue_reconciliation_discrepancies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  category text NOT NULL,
  severity text NOT NULL DEFAULT 'HIGH' CHECK (severity IN ('HIGH','MEDIUM','LOW','INFO')),
  reference_type text NOT NULL,
  reference_id uuid NOT NULL,
  first_seen_run_id uuid NOT NULL,
  last_seen_run_id uuid NOT NULL,
  occurrences integer NOT NULL DEFAULT 1 CHECK (occurrences>=1),
  expected_amount numeric(20,6),
  actual_amount numeric(20,6),
  currency char(3),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED','ACCEPTED')),
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  FOREIGN KEY (tenant_id,first_seen_run_id) REFERENCES revenue_reconciliation_runs(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,last_seen_run_id) REFERENCES revenue_reconciliation_runs(tenant_id,id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS revenue_reconciliation_open_key_uq
  ON revenue_reconciliation_discrepancies(tenant_id,category,reference_type,reference_id)
  WHERE status='OPEN';
CREATE INDEX IF NOT EXISTS revenue_reconciliation_discrepancies_status_idx
  ON revenue_reconciliation_discrepancies(tenant_id,status,severity,last_seen_at DESC);

COMMIT;
