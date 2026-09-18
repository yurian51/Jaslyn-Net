BEGIN;

-- 041: canonical financial/commercial control plane.
-- Financial records keep original transaction currency immutable. Conversion is
-- represented explicitly by settlement fields and an auditable FX rate snapshot.

ALTER TABLE payments
  ADD CONSTRAINT payments_tenant_id_uq UNIQUE (tenant_id, id);

ALTER TABLE wifi_plan_purchases
  ADD CONSTRAINT wifi_plan_purchases_tenant_id_uq UNIQUE (tenant_id, id);

ALTER TABLE customers
  ADD CONSTRAINT customers_tenant_id_uq UNIQUE (tenant_id, id);

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS settlement_amount numeric(20,6),
  ADD COLUMN IF NOT EXISTS settlement_currency char(3),
  ADD COLUMN IF NOT EXISTS fx_rate numeric(30,12),
  ADD COLUMN IF NOT EXISTS fx_rate_source text,
  ADD COLUMN IF NOT EXISTS fx_rate_at timestamptz;

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_currency_code_chk;
ALTER TABLE payments ADD CONSTRAINT payments_currency_code_chk
  CHECK (currency ~ '^[A-Z]{3}$');

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_settlement_currency_code_chk;
ALTER TABLE payments ADD CONSTRAINT payments_settlement_currency_code_chk
  CHECK (settlement_currency IS NULL OR settlement_currency ~ '^[A-Z]{3}$');

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_fx_rate_chk;
ALTER TABLE payments ADD CONSTRAINT payments_fx_rate_chk
  CHECK (fx_rate IS NULL OR fx_rate > 0);

CREATE TABLE IF NOT EXISTS resellers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  email text,
  phone text,
  status text NOT NULL DEFAULT 'ACTIVE',
  commission_rate numeric(9,6) NOT NULL DEFAULT 0,
  settlement_currency char(3) NOT NULL DEFAULT 'TZS',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  CHECK (status IN ('ACTIVE','SUSPENDED','CLOSED')),
  CHECK (commission_rate >= 0 AND commission_rate <= 100),
  CHECK (settlement_currency ~ '^[A-Z]{3}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS resellers_tenant_id_uq ON resellers (tenant_id, id);

CREATE INDEX IF NOT EXISTS resellers_tenant_status_idx
  ON resellers (tenant_id, status);

CREATE TABLE IF NOT EXISTS financial_ledger_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  account_type text NOT NULL,
  currency char(3) NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  CHECK (account_type IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),
  CHECK (status IN ('ACTIVE','CLOSED')),
  CHECK (currency ~ '^[A-Z]{3}$')
);

CREATE TABLE IF NOT EXISTS financial_ledger_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  transaction_type text NOT NULL,
  reference_type text,
  reference_id uuid,
  correlation_id text,
  description text,
  posted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (transaction_type IN ('PAYMENT','REFUND','COMMISSION','ADJUSTMENT','TAX','RESELLER_SETTLEMENT','TRANSFER','OTHER'))
);

CREATE UNIQUE INDEX IF NOT EXISTS financial_ledger_transactions_tenant_id_uq ON financial_ledger_transactions (tenant_id, id);

CREATE INDEX IF NOT EXISTS financial_ledger_transactions_ref_idx
  ON financial_ledger_transactions (tenant_id, reference_type, reference_id);

CREATE INDEX IF NOT EXISTS financial_ledger_transactions_correlation_idx
  ON financial_ledger_transactions (tenant_id, correlation_id)
  WHERE correlation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS financial_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL,
  FOREIGN KEY (tenant_id, transaction_id) REFERENCES financial_ledger_transactions(tenant_id, id) ON DELETE RESTRICT,
  account_id uuid NOT NULL,
  FOREIGN KEY (tenant_id, account_id) REFERENCES financial_ledger_accounts(tenant_id, id) ON DELETE RESTRICT,
  currency char(3) NOT NULL,
  debit numeric(20,6) NOT NULL DEFAULT 0,
  credit numeric(20,6) NOT NULL DEFAULT 0,
  exchange_rate numeric(30,12),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (currency ~ '^[A-Z]{3}$'),
  CHECK (debit >= 0 AND credit >= 0),
  CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)),
  CHECK (exchange_rate IS NULL OR exchange_rate > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS financial_ledger_accounts_tenant_id_uq ON financial_ledger_accounts (tenant_id, id);

CREATE INDEX IF NOT EXISTS financial_ledger_entries_account_idx
  ON financial_ledger_entries (tenant_id, account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS financial_ledger_entries_transaction_idx
  ON financial_ledger_entries (tenant_id, transaction_id);

CREATE TABLE IF NOT EXISTS commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reseller_id uuid NOT NULL,
  FOREIGN KEY (tenant_id, reseller_id) REFERENCES resellers(tenant_id, id) ON DELETE RESTRICT,
  purchase_id uuid,
  FOREIGN KEY (tenant_id, purchase_id) REFERENCES wifi_plan_purchases(tenant_id, id) ON DELETE RESTRICT,
  payment_id uuid,
  FOREIGN KEY (tenant_id, payment_id) REFERENCES payments(tenant_id, id) ON DELETE RESTRICT,
  basis_amount numeric(20,6) NOT NULL,
  currency char(3) NOT NULL,
  rate numeric(9,6) NOT NULL,
  commission_amount numeric(20,6) NOT NULL,
  status text NOT NULL DEFAULT 'ACCRUED',
  ledger_transaction_id uuid,
  FOREIGN KEY (tenant_id, ledger_transaction_id) REFERENCES financial_ledger_transactions(tenant_id, id) ON DELETE RESTRICT,
  approved_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (basis_amount >= 0),
  CHECK (commission_amount >= 0),
  CHECK (rate >= 0 AND rate <= 100),
  CHECK (currency ~ '^[A-Z]{3}$'),
  CHECK (status IN ('ACCRUED','APPROVED','PAID','VOIDED')),
  UNIQUE (tenant_id, payment_id, reseller_id)
);

CREATE INDEX IF NOT EXISTS commissions_tenant_status_idx
  ON commissions (tenant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL,
  FOREIGN KEY (tenant_id, payment_id) REFERENCES payments(tenant_id, id) ON DELETE RESTRICT,
  amount numeric(20,6) NOT NULL,
  currency char(3) NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'REQUESTED',
  provider_reference text,
  ledger_transaction_id uuid,
  FOREIGN KEY (tenant_id, ledger_transaction_id) REFERENCES financial_ledger_transactions(tenant_id, id) ON DELETE RESTRICT,
  requested_by uuid,
  approved_by uuid,
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (amount > 0),
  CHECK (currency ~ '^[A-Z]{3}$'),
  CHECK (status IN ('REQUESTED','APPROVED','PROCESSING','SUCCEEDED','FAILED','CANCELLED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS tax_rates_tenant_id_uq ON tax_rates (tenant_id, id);

CREATE INDEX IF NOT EXISTS refunds_payment_idx
  ON refunds (tenant_id, payment_id, created_at DESC);

CREATE TABLE IF NOT EXISTS financial_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid,
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id) ON DELETE RESTRICT,
  purchase_id uuid REFERENCES wifi_plan_purchases(id) ON DELETE RESTRICT,
  amount numeric(20,6) NOT NULL,
  currency char(3) NOT NULL,
  direction text NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  ledger_transaction_id uuid REFERENCES financial_ledger_transactions(id) ON DELETE RESTRICT,
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (amount > 0),
  CHECK (currency ~ '^[A-Z]{3}$'),
  CHECK (direction IN ('DEBIT','CREDIT')),
  CHECK (status IN ('PENDING','APPROVED','POSTED','REJECTED','VOIDED'))
);

CREATE INDEX IF NOT EXISTS financial_adjustments_customer_idx
  ON financial_adjustments (tenant_id, customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS payment_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  provider_case_id text,
  amount numeric(20,6),
  currency char(3),
  reason_code text,
  reason text,
  status text NOT NULL DEFAULT 'OPEN',
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolution text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (amount IS NULL OR amount > 0),
  CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  CHECK (status IN ('OPEN','UNDER_REVIEW','WON','LOST','ACCEPTED','CLOSED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_disputes_provider_case_uq
  ON payment_disputes (tenant_id, provider_case_id)
  WHERE provider_case_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payment_disputes_payment_idx
  ON payment_disputes (tenant_id, payment_id, created_at DESC);

CREATE TABLE IF NOT EXISTS reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider text,
  currency char(3),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'RUNNING',
  matched_count integer NOT NULL DEFAULT 0,
  unmatched_count integer NOT NULL DEFAULT 0,
  mismatch_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  CHECK (period_end > period_start),
  CHECK (status IN ('RUNNING','COMPLETED','PARTIAL','FAILED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS reconciliation_runs_tenant_id_uq ON reconciliation_runs (tenant_id, id);

CREATE INDEX IF NOT EXISTS reconciliation_runs_tenant_period_idx
  ON reconciliation_runs (tenant_id, period_end DESC);

CREATE TABLE IF NOT EXISTS reconciliation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  run_id uuid NOT NULL,
  FOREIGN KEY (tenant_id, run_id) REFERENCES reconciliation_runs(tenant_id, id) ON DELETE CASCADE,
  payment_id uuid REFERENCES payments(id) ON DELETE RESTRICT,
  provider text,
  provider_reference text,
  provider_amount numeric(20,6),
  provider_currency char(3),
  internal_amount numeric(20,6),
  internal_currency char(3),
  status text NOT NULL,
  reason text,
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (provider_currency IS NULL OR provider_currency ~ '^[A-Z]{3}$'),
  CHECK (internal_currency IS NULL OR internal_currency ~ '^[A-Z]{3}$'),
  CHECK (status IN ('MATCHED','UNMATCHED_PROVIDER','UNMATCHED_INTERNAL','AMOUNT_MISMATCH','CURRENCY_MISMATCH','DUPLICATE','REVIEWED'))
);

CREATE INDEX IF NOT EXISTS reconciliation_items_run_status_idx
  ON reconciliation_items (tenant_id, run_id, status);

CREATE TABLE IF NOT EXISTS tax_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  rate numeric(9,6) NOT NULL,
  currency char(3),
  country_code char(2),
  is_inclusive boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (rate >= 0 AND rate <= 100),
  CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE RESTRICT,
  purchase_id uuid REFERENCES wifi_plan_purchases(id) ON DELETE RESTRICT,
  invoice_number text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  currency char(3) NOT NULL,
  subtotal numeric(20,6) NOT NULL DEFAULT 0,
  tax_total numeric(20,6) NOT NULL DEFAULT 0,
  total numeric(20,6) NOT NULL DEFAULT 0,
  issued_at timestamptz,
  due_at timestamptz,
  paid_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (currency ~ '^[A-Z]{3}$'),
  CHECK (subtotal >= 0 AND tax_total >= 0 AND total >= 0),
  CHECK (total = subtotal + tax_total),
  CHECK (status IN ('DRAFT','ISSUED','PARTIALLY_PAID','PAID','VOID','OVERDUE')),
  UNIQUE (tenant_id, invoice_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS invoices_purchase_uq
  ON invoices (tenant_id, purchase_id)
  WHERE purchase_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_tenant_id_uq ON invoices (tenant_id, id);

CREATE INDEX IF NOT EXISTS invoices_customer_status_idx
  ON invoices (tenant_id, customer_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL,
  FOREIGN KEY (tenant_id, invoice_id) REFERENCES invoices(tenant_id, id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric(20,6) NOT NULL DEFAULT 1,
  unit_price numeric(20,6) NOT NULL,
  subtotal numeric(20,6) NOT NULL,
  tax_rate_id uuid,
  FOREIGN KEY (tenant_id, tax_rate_id) REFERENCES tax_rates(tenant_id, id) ON DELETE RESTRICT,
  tax_amount numeric(20,6) NOT NULL DEFAULT 0,
  total numeric(20,6) NOT NULL,
  currency char(3) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (quantity > 0),
  CHECK (unit_price >= 0 AND subtotal >= 0 AND tax_amount >= 0 AND total >= 0),
  CHECK (total = subtotal + tax_amount),
  CHECK (currency ~ '^[A-Z]{3}$')
);

CREATE INDEX IF NOT EXISTS invoice_lines_invoice_idx
  ON invoice_lines (tenant_id, invoice_id);

CREATE TABLE IF NOT EXISTS fx_rate_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  base_currency char(3) NOT NULL,
  quote_currency char(3) NOT NULL,
  rate numeric(30,12) NOT NULL,
  source text NOT NULL,
  observed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (base_currency ~ '^[A-Z]{3}$'),
  CHECK (quote_currency ~ '^[A-Z]{3}$'),
  CHECK (base_currency <> quote_currency),
  CHECK (rate > 0)
);

CREATE INDEX IF NOT EXISTS fx_rate_snapshots_pair_time_idx
  ON fx_rate_snapshots (base_currency, quote_currency, observed_at DESC);

COMMIT;
