BEGIN;

CREATE TABLE IF NOT EXISTS commerce_renewal_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  renewal_schedule_id uuid NOT NULL,
  execution_id uuid NOT NULL,
  purchase_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','RESOLVED','FAILED')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, execution_id),
  FOREIGN KEY (tenant_id, renewal_schedule_id) REFERENCES commerce_renewal_schedules(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, purchase_id) REFERENCES wifi_plan_purchases(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS commerce_renewal_reconciliation_due_idx
  ON commerce_renewal_reconciliations (tenant_id, status, next_attempt_at);

COMMIT;
