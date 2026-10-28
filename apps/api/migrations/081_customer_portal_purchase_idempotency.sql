CREATE UNIQUE INDEX IF NOT EXISTS wifi_plan_purchases_customer_portal_idempotency_idx
  ON wifi_plan_purchases (tenant_id, correlation_id)
  WHERE correlation_id LIKE 'customer-portal:%';
