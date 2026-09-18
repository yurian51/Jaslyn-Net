BEGIN;

ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS devices_per_code integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS show_on_portal boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_free_trial boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS free_trial_frequency text NOT NULL DEFAULT 'ONCE_PER_PHONE';

ALTER TABLE packages DROP CONSTRAINT IF EXISTS packages_devices_per_code_chk;
ALTER TABLE packages ADD CONSTRAINT packages_devices_per_code_chk CHECK (devices_per_code BETWEEN 1 AND 100);

ALTER TABLE packages DROP CONSTRAINT IF EXISTS packages_free_trial_frequency_chk;
ALTER TABLE packages ADD CONSTRAINT packages_free_trial_frequency_chk CHECK (free_trial_frequency IN ('ONCE_PER_PHONE','ONCE_PER_CUSTOMER','UNLIMITED'));

CREATE INDEX IF NOT EXISTS packages_portal_idx ON packages (tenant_id, show_on_portal, is_active);
CREATE INDEX IF NOT EXISTS packages_trial_idx ON packages (tenant_id, is_free_trial, free_trial_frequency);
CREATE INDEX IF NOT EXISTS payments_tenant_created_idx ON payments (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wifi_plan_purchases_tenant_created_idx ON wifi_plan_purchases (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wifi_plan_purchases_tenant_customer_idx ON wifi_plan_purchases (tenant_id, customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS vouchers_tenant_used_idx ON vouchers (tenant_id, used_at DESC);

CREATE TABLE IF NOT EXISTS voucher_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  package_id uuid NOT NULL,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 10000),
  code_format text NOT NULL DEFAULT 'LETTERS_NUMBERS',
  print_size text NOT NULL DEFAULT 'MINI',
  print_style text NOT NULL DEFAULT 'CLASSIC',
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, package_id) REFERENCES packages(tenant_id, id) ON DELETE RESTRICT
);

ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS batch_id uuid;
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS device_limit integer NOT NULL DEFAULT 1;
ALTER TABLE access_grants ADD COLUMN IF NOT EXISTS device_limit integer NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vouchers_batch_fk') THEN
    ALTER TABLE vouchers ADD CONSTRAINT vouchers_batch_fk FOREIGN KEY (batch_id) REFERENCES voucher_batches(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE access_grants DROP CONSTRAINT IF EXISTS access_grants_device_limit_chk;
ALTER TABLE access_grants ADD CONSTRAINT access_grants_device_limit_chk CHECK (device_limit BETWEEN 1 AND 100);

ALTER TABLE vouchers DROP CONSTRAINT IF EXISTS vouchers_device_limit_chk;
ALTER TABLE vouchers ADD CONSTRAINT vouchers_device_limit_chk CHECK (device_limit BETWEEN 1 AND 100);
CREATE INDEX IF NOT EXISTS vouchers_tenant_batch_idx ON vouchers (tenant_id, batch_id);
CREATE INDEX IF NOT EXISTS access_grants_device_limit_idx ON access_grants (tenant_id, customer_id, device_limit);

COMMIT;