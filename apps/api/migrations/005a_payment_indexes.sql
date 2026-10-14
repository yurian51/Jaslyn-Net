BEGIN;

CREATE INDEX IF NOT EXISTS payments_tenant_purchase_status_idx
  ON payments (tenant_id, purchase_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS payment_events_tenant_created_idx
  ON payment_events (tenant_id, created_at DESC);

COMMIT;
