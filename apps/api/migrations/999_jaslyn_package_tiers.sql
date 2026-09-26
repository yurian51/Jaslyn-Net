ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS tier_code text,
  ADD COLUMN IF NOT EXISTS tier_rank integer,
  ADD COLUMN IF NOT EXISTS tagline text,
  ADD COLUMN IF NOT EXISTS feature_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS packages_tenant_tier_code_unique
  ON packages (tenant_id, tier_code)
  WHERE tier_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS packages_tenant_tier_rank_idx
  ON packages (tenant_id, tier_rank)
  WHERE tier_rank IS NOT NULL;
