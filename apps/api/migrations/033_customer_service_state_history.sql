BEGIN;

CREATE TABLE IF NOT EXISTS customer_service_state_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  previous_state text,
  new_state text NOT NULL CHECK (new_state IN ('PENDING','ACTIVE','GRACE','SUSPENDED','BLOCKED','DISCONNECTED','FAULT')),
  reason text NOT NULL,
  source text NOT NULL,
  effective_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS customer_service_state_events_customer_idx
  ON customer_service_state_events (tenant_id, customer_id, created_at DESC);

COMMIT;
