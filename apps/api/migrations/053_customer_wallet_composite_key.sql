-- Ensure customer wallet composite foreign keys remain valid for databases
-- where the commerce parity migration was already recorded before this hardening.

ALTER TABLE customer_wallets
  ADD CONSTRAINT customer_wallets_tenant_id_unique UNIQUE (tenant_id, id);
