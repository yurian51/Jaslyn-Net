BEGIN;

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS correlation_id text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS correlation_id text;
ALTER TABLE wifi_plan_purchases ADD COLUMN IF NOT EXISTS correlation_id text;
ALTER TABLE access_grants ADD COLUMN IF NOT EXISTS correlation_id text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS correlation_id text;
ALTER TABLE payment_events ADD COLUMN IF NOT EXISTS correlation_id text;
ALTER TABLE radius_events ADD COLUMN IF NOT EXISTS correlation_id text;
ALTER TABLE radius_accounting_events ADD COLUMN IF NOT EXISTS correlation_id text;

CREATE INDEX IF NOT EXISTS audit_logs_tenant_correlation_idx
  ON audit_logs (tenant_id, correlation_id, created_at DESC)
  WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payments_tenant_correlation_idx
  ON payments (tenant_id, correlation_id, created_at DESC)
  WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS purchases_tenant_correlation_idx
  ON wifi_plan_purchases (tenant_id, correlation_id, created_at DESC)
  WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS access_grants_tenant_correlation_idx
  ON access_grants (tenant_id, correlation_id, created_at DESC)
  WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sessions_tenant_correlation_idx
  ON sessions (tenant_id, correlation_id, created_at DESC)
  WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_events_tenant_correlation_idx
  ON payment_events (tenant_id, correlation_id, created_at DESC)
  WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS radius_events_tenant_correlation_idx
  ON radius_events (tenant_id, correlation_id, created_at DESC)
  WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS radius_accounting_tenant_correlation_idx
  ON radius_accounting_events (tenant_id, correlation_id, created_at DESC)
  WHERE correlation_id IS NOT NULL;

COMMIT;
