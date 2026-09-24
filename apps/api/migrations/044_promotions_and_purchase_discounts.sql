BEGIN;

CREATE TABLE IF NOT EXISTS promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  type text NOT NULL,
  value numeric(20,6) NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  expires_at timestamptz,
  usage_limit_total integer,
  usage_limit_per_customer integer,
  times_redeemed integer NOT NULL DEFAULT 0,
  min_amount numeric(20,6),
  max_discount numeric(20,6),
  eligible_package_ids jsonb,
  first_payment_only boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  CHECK (type IN ('PERCENTAGE','FIXED')),
  CHECK (value > 0),
  CHECK (status IN ('ACTIVE','EXPIRED','DISABLED','EXHAUSTED')),
  CHECK (usage_limit_total IS NULL OR usage_limit_total > 0),
  CHECK (usage_limit_per_customer IS NULL OR usage_limit_per_customer > 0),
  CHECK (times_redeemed >= 0),
  CHECK (min_amount IS NULL OR min_amount >= 0),
  CHECK (max_discount IS NULL OR max_discount >= 0),
  CHECK (type <> 'PERCENTAGE' OR value <= 100)
);

CREATE TABLE IF NOT EXISTS promo_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  promo_code_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  purchase_id uuid,
  discount_amount numeric(20,6) NOT NULL,
  correlation_id text,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, promo_code_id, purchase_id),
  FOREIGN KEY (tenant_id, promo_code_id) REFERENCES promo_codes(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, purchase_id) REFERENCES wifi_plan_purchases(tenant_id, id) ON DELETE RESTRICT,
  CHECK (discount_amount >= 0)
);

CREATE INDEX IF NOT EXISTS promo_codes_tenant_status_idx ON promo_codes (tenant_id, status, expires_at);
CREATE INDEX IF NOT EXISTS promo_redemptions_customer_idx ON promo_redemptions (tenant_id, customer_id, redeemed_at DESC);
CREATE INDEX IF NOT EXISTS promo_redemptions_code_idx ON promo_redemptions (tenant_id, promo_code_id, redeemed_at DESC);

ALTER TABLE wifi_plan_purchases
  ADD COLUMN IF NOT EXISTS promo_code_id uuid,
  ADD COLUMN IF NOT EXISTS discount_amount numeric(20,6) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wifi_plan_purchases_promo_fk') THEN
    ALTER TABLE wifi_plan_purchases
      ADD CONSTRAINT wifi_plan_purchases_promo_fk
      FOREIGN KEY (tenant_id, promo_code_id) REFERENCES promo_codes(tenant_id, id) ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE wifi_plan_purchases
  DROP CONSTRAINT IF EXISTS wifi_plan_purchases_discount_chk;
ALTER TABLE wifi_plan_purchases
  ADD CONSTRAINT wifi_plan_purchases_discount_chk CHECK (discount_amount >= 0 AND discount_amount <= price);

CREATE INDEX IF NOT EXISTS wifi_plan_purchases_promo_idx ON wifi_plan_purchases (tenant_id, promo_code_id, created_at DESC);

COMMIT;
