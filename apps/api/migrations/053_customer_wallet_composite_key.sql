-- Ensure customer wallet composite foreign keys remain valid for databases
-- where the commerce parity migration was already recorded before this hardening.

CREATE UNIQUE INDEX IF NOT EXISTS customer_wallets_tenant_id_unique_idx
  ON customer_wallets (tenant_id, id);
