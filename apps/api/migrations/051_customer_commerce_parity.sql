BEGIN;

CREATE TABLE IF NOT EXISTS customer_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  currency text NOT NULL DEFAULT 'TZS',
  balance numeric(14,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','FROZEN','CLOSED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, customer_id, currency),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS customer_wallet_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  wallet_id uuid NOT NULL,
  entry_type text NOT NULL CHECK (entry_type IN ('TOPUP','PURCHASE','REFUND','ADJUSTMENT','TRANSFER_IN','TRANSFER_OUT','COMMISSION')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL,
  reference_type text,
  reference_id uuid,
  idempotency_key text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, wallet_id) REFERENCES customer_wallets(tenant_id, id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS customer_beneficiaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  beneficiary_customer_id uuid,
  display_name text NOT NULL,
  phone text,
  package_id uuid,
  router_id uuid,
  is_favorite boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, customer_id, beneficiary_customer_id, phone),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, beneficiary_customer_id) REFERENCES customers(tenant_id, id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id, package_id) REFERENCES packages(tenant_id, id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id, router_id) REFERENCES routers(tenant_id, id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS commerce_saved_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  beneficiary_id uuid,
  package_id uuid NOT NULL,
  router_id uuid,
  label text NOT NULL,
  auto_renew boolean NOT NULL DEFAULT false,
  renewal_days integer NOT NULL DEFAULT 0 CHECK (renewal_days BETWEEN 0 AND 365),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, customer_id, label),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, beneficiary_id) REFERENCES customer_beneficiaries(tenant_id, id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id, package_id) REFERENCES packages(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, router_id) REFERENCES routers(tenant_id, id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS commerce_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  referrer_customer_id uuid NOT NULL,
  referred_customer_id uuid,
  code text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REDEEMED','EXPIRED','CANCELED')),
  reward_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (reward_amount >= 0),
  currency text NOT NULL DEFAULT 'TZS',
  redeemed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, referred_customer_id),
  FOREIGN KEY (tenant_id, referrer_customer_id) REFERENCES customers(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, referred_customer_id) REFERENCES customers(tenant_id, id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS commerce_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  reward_type text NOT NULL CHECK (reward_type IN ('REFERRAL','PROMOTION','LOYALTY','COMPENSATION')),
  points bigint NOT NULL DEFAULT 0,
  amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'TZS',
  status text NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE','USED','EXPIRED','REVOKED')),
  reference_id uuid,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS commerce_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  daily_amount numeric(14,2) NOT NULL DEFAULT 500000 CHECK (daily_amount >= 0),
  daily_transactions integer NOT NULL DEFAULT 20 CHECK (daily_transactions >= 0),
  monthly_amount numeric(14,2) NOT NULL DEFAULT 5000000 CHECK (monthly_amount >= 0),
  require_verification_above numeric(14,2) NOT NULL DEFAULT 100000 CHECK (require_verification_above >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, customer_id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS commerce_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  verification_type text NOT NULL CHECK (verification_type IN ('PHONE','EMAIL','IDENTITY','DEVICE')),
  status text NOT NULL DEFAULT 'UNVERIFIED' CHECK (status IN ('UNVERIFIED','PENDING','VERIFIED','REJECTED')),
  verified_at timestamptz,
  evidence_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, customer_id, verification_type),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS commerce_notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  transaction_alerts boolean NOT NULL DEFAULT true,
  access_alerts boolean NOT NULL DEFAULT true,
  promotion_alerts boolean NOT NULL DEFAULT true,
  security_alerts boolean NOT NULL DEFAULT true,
  preferred_channel text NOT NULL DEFAULT 'SMS' CHECK (preferred_channel IN ('SMS','EMAIL','WHATSAPP','WEB')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, customer_id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS commerce_support_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  category text NOT NULL,
  subject text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','RESOLVED','CLOSED')),
  priority text NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
  purchase_id uuid,
  payment_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, purchase_id) REFERENCES wifi_plan_purchases(tenant_id, id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id, payment_id) REFERENCES payments(tenant_id, id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS commerce_renewal_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  saved_purchase_id uuid NOT NULL,
  next_run_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAUSED','PROCESSING','COMPLETED','FAILED','CANCELED')),
  failure_count integer NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  last_run_at timestamptz,\n  claimed_at timestamptz,\n  execution_id uuid,\n  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, saved_purchase_id),\n  UNIQUE (tenant_id, execution_id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, saved_purchase_id) REFERENCES commerce_saved_purchases(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS customer_wallet_entries_lookup_idx ON customer_wallet_entries (tenant_id, wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS customer_beneficiaries_lookup_idx ON customer_beneficiaries (tenant_id, customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS commerce_saved_purchases_lookup_idx ON commerce_saved_purchases (tenant_id, customer_id, active);
CREATE INDEX IF NOT EXISTS commerce_support_lookup_idx ON commerce_support_cases (tenant_id, customer_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS commerce_renewal_due_idx ON commerce_renewal_schedules (tenant_id, status, next_run_at);\nCREATE INDEX IF NOT EXISTS commerce_renewal_claim_idx ON commerce_renewal_schedules (status, claimed_at);
COMMIT;