-- Harden composite tenant-scoped foreign-key targets created by customer commerce migrations.

CREATE UNIQUE INDEX IF NOT EXISTS customer_wallets_tenant_id_unique_idx
  ON customer_wallets (tenant_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS customer_beneficiaries_tenant_id_unique_idx
  ON customer_beneficiaries (tenant_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS commerce_saved_purchases_tenant_id_unique_idx
  ON commerce_saved_purchases (tenant_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS commerce_renewal_schedules_tenant_id_unique_idx
  ON commerce_renewal_schedules (tenant_id, id);
