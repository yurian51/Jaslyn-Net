BEGIN;

CREATE INDEX IF NOT EXISTS wifi_plan_purchases_active_customer_router_idx
  ON wifi_plan_purchases (tenant_id, customer_id, router_id, status, ends_at DESC)
  WHERE status IN ('PAID', 'ACTIVE');

CREATE INDEX IF NOT EXISTS sessions_customer_started_idx
  ON sessions (tenant_id, customer_id, started_at DESC);

COMMIT;
