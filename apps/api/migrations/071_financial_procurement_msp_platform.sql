BEGIN;

-- Financial documents are tenant-scoped and use immutable identifiers.
CREATE TABLE IF NOT EXISTS customer_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL,
  invoice_number text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ISSUED','PARTIALLY_PAID','PAID','VOID','OVERDUE')),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  subtotal numeric(20,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tax_total numeric(20,2) NOT NULL DEFAULT 0 CHECK (tax_total >= 0),
  total numeric(20,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  amount_paid numeric(20,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0 AND amount_paid <= total),
  issued_at timestamptz,
  due_at timestamptz,
  voided_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, invoice_number),
  FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS customer_invoices_ar_idx ON customer_invoices(tenant_id,status,due_at);
CREATE INDEX IF NOT EXISTS customer_invoices_customer_idx ON customer_invoices(tenant_id,customer_id,created_at DESC);

CREATE TABLE IF NOT EXISTS customer_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL,
  description text NOT NULL,
  quantity numeric(20,4) NOT NULL CHECK (quantity > 0),
  unit_price numeric(20,4) NOT NULL CHECK (unit_price >= 0),
  tax_rate numeric(7,4) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  line_total numeric(20,2) NOT NULL CHECK (line_total >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,invoice_id) REFERENCES customer_invoices(tenant_id,id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,id)
);
CREATE INDEX IF NOT EXISTS customer_invoice_lines_invoice_idx ON customer_invoice_lines(tenant_id,invoice_id);

CREATE TABLE IF NOT EXISTS customer_credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL,
  credit_number text NOT NULL,
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  amount numeric(20,2) NOT NULL CHECK (amount > 0),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ISSUED','APPLIED','VOID')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  issued_at timestamptz,
  FOREIGN KEY (tenant_id,invoice_id) REFERENCES customer_invoices(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,created_by) REFERENCES users(tenant_id,id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,credit_number)
);
CREATE INDEX IF NOT EXISTS customer_credit_notes_invoice_idx ON customer_credit_notes(tenant_id,invoice_id,status);

CREATE TABLE IF NOT EXISTS payment_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  payment_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  provider_refund_reference text,
  amount numeric(20,2) NOT NULL CHECK (amount > 0),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED','PENDING','SUCCEEDED','FAILED','CANCELLED')),
  requested_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  FOREIGN KEY (tenant_id,payment_id) REFERENCES payments(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,requested_by) REFERENCES users(tenant_id,id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,idempotency_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS payment_refunds_provider_ref_uq ON payment_refunds(tenant_id,provider_refund_reference) WHERE provider_refund_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_refunds_payment_idx ON payment_refunds(tenant_id,payment_id,status);

CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  supplier_code text NOT NULL,
  name text NOT NULL,
  tax_number text,
  email text,
  phone text,
  address jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,supplier_code)
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  supplier_id uuid NOT NULL,
  po_number text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','PARTIALLY_RECEIVED','RECEIVED','CANCELLED')),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  subtotal numeric(20,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tax_total numeric(20,2) NOT NULL DEFAULT 0 CHECK (tax_total >= 0),
  total numeric(20,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  ordered_at timestamptz,
  expected_at timestamptz,
  approved_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,supplier_id) REFERENCES suppliers(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,approved_by) REFERENCES users(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,created_by) REFERENCES users(tenant_id,id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,po_number)
);
CREATE INDEX IF NOT EXISTS purchase_orders_supplier_idx ON purchase_orders(tenant_id,supplier_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  purchase_order_id uuid NOT NULL,
  item_code text NOT NULL,
  description text NOT NULL,
  quantity_ordered numeric(20,4) NOT NULL CHECK (quantity_ordered > 0),
  quantity_received numeric(20,4) NOT NULL DEFAULT 0 CHECK (quantity_received >= 0 AND quantity_received <= quantity_ordered),
  unit_cost numeric(20,4) NOT NULL CHECK (unit_cost >= 0),
  tax_rate numeric(7,4) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,purchase_order_id) REFERENCES purchase_orders(tenant_id,id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,id)
);

CREATE TABLE IF NOT EXISTS supplier_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  supplier_id uuid NOT NULL,
  purchase_order_id uuid,
  invoice_number text NOT NULL,
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  subtotal numeric(20,2) NOT NULL CHECK (subtotal >= 0),
  tax_total numeric(20,2) NOT NULL DEFAULT 0 CHECK (tax_total >= 0),
  total numeric(20,2) NOT NULL CHECK (total >= 0),
  status text NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED','APPROVED','PARTIALLY_PAID','PAID','DISPUTED','VOID')),
  invoice_date date NOT NULL,
  due_date date,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,supplier_id) REFERENCES suppliers(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,purchase_order_id) REFERENCES purchase_orders(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,created_by) REFERENCES users(tenant_id,id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,supplier_id,invoice_number)
);
CREATE INDEX IF NOT EXISTS supplier_invoices_ap_idx ON supplier_invoices(tenant_id,status,due_date);

CREATE TABLE IF NOT EXISTS inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sku text NOT NULL,
  name text NOT NULL,
  description text,
  unit text NOT NULL DEFAULT 'each',
  valuation_method text NOT NULL DEFAULT 'WEIGHTED_AVERAGE' CHECK (valuation_method IN ('WEIGHTED_AVERAGE','FIFO')),
  reorder_level numeric(20,4) NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  quantity_on_hand numeric(20,4) NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  average_unit_cost numeric(20,4) NOT NULL DEFAULT 0 CHECK (average_unit_cost >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,sku)
);
CREATE INDEX IF NOT EXISTS inventory_items_reorder_idx ON inventory_items(tenant_id,quantity_on_hand,reorder_level) WHERE active;

CREATE TABLE IF NOT EXISTS inventory_stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  item_id uuid NOT NULL,
  movement_type text NOT NULL CHECK (movement_type IN ('RECEIPT','ISSUE','RETURN','ADJUSTMENT','TRANSFER')),
  quantity_delta numeric(20,4) NOT NULL CHECK (quantity_delta <> 0),
  unit_cost numeric(20,4) NOT NULL CHECK (unit_cost >= 0),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  reference_type text NOT NULL,
  reference_id uuid,
  idempotency_key text NOT NULL,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,item_id) REFERENCES inventory_items(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,created_by) REFERENCES users(tenant_id,id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,idempotency_key),
  UNIQUE (tenant_id,id)
);
CREATE INDEX IF NOT EXISTS inventory_movements_item_idx ON inventory_stock_movements(tenant_id,item_id,created_at DESC);

-- Operator branding, parent/reseller relationships and tenant quotas.
CREATE TABLE IF NOT EXISTS tenant_branding (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE RESTRICT,
  display_name text NOT NULL,
  logo_url text,
  primary_color text NOT NULL DEFAULT '#174ea6' CHECK (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  support_email text,
  support_phone text,
  portal_domain text,
  notification_templates jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,updated_by) REFERENCES users(tenant_id,id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_branding_portal_domain_uq ON tenant_branding(lower(portal_domain)) WHERE portal_domain IS NOT NULL;

CREATE TABLE IF NOT EXISTS tenant_reseller_relationships (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE RESTRICT,
  parent_tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  relationship_type text NOT NULL DEFAULT 'RESELLER' CHECK (relationship_type IN ('RESELLER','MANAGED_OPERATOR','FRANCHISE')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','ENDED')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (tenant_id <> parent_tenant_id),
  FOREIGN KEY (tenant_id,created_by) REFERENCES users(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS tenant_reseller_parent_idx ON tenant_reseller_relationships(parent_tenant_id,status);

CREATE TABLE IF NOT EXISTS tenant_usage_counters (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  metric_key text NOT NULL,
  period_start date NOT NULL,
  usage_count bigint NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,metric_key,period_start)
);

-- API credentials are stored as one-way digests; raw tokens must be shown only once at creation.
CREATE TABLE IF NOT EXISTS platform_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  name text NOT NULL,
  token_prefix text NOT NULL,
  token_digest text NOT NULL,
  scopes text[] NOT NULL DEFAULT '{}',
  rate_limit_per_minute integer NOT NULL DEFAULT 60 CHECK (rate_limit_per_minute BETWEEN 1 AND 60000),
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,created_by) REFERENCES users(tenant_id,id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,id),
  UNIQUE (token_digest)
);
CREATE INDEX IF NOT EXISTS platform_api_keys_active_idx ON platform_api_keys(tenant_id,created_at DESC) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS tenant_webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  name text NOT NULL,
  endpoint_url text NOT NULL,
  secret_reference uuid,
  event_types text[] NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,created_by) REFERENCES users(tenant_id,id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,id)
);
CREATE INDEX IF NOT EXISTS tenant_webhook_endpoints_active_idx ON tenant_webhook_endpoints(tenant_id,enabled) WHERE enabled;

CREATE TABLE IF NOT EXISTS webhook_delivery_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  endpoint_id uuid NOT NULL,
  event_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','DELIVERING','DELIVERED','RETRY','DEAD')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_http_status integer,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  FOREIGN KEY (tenant_id,endpoint_id) REFERENCES tenant_webhook_endpoints(tenant_id,id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,endpoint_id,event_id)
);
CREATE INDEX IF NOT EXISTS webhook_delivery_due_idx ON webhook_delivery_outbox(status,next_attempt_at) WHERE status IN ('PENDING','RETRY');

-- Append-only evidence for changes to the newly introduced financial records.
CREATE TABLE IF NOT EXISTS financial_change_audit (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  actor_user_id uuid,
  request_id text,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
  before_data jsonb,
  after_data jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,actor_user_id) REFERENCES users(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS financial_change_audit_tenant_time_idx ON financial_change_audit(tenant_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS financial_change_audit_entity_idx ON financial_change_audit(tenant_id,entity_type,entity_id,occurred_at DESC);

CREATE OR REPLACE FUNCTION jaslyn_financial_audit_trigger() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_tenant uuid; v_id uuid; v_before jsonb; v_after jsonb; v_actor uuid; v_request text;
BEGIN
  v_before := CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  v_after := CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  v_tenant := COALESCE((v_after->>'tenant_id')::uuid,(v_before->>'tenant_id')::uuid);
  v_id := COALESCE((v_after->>'id')::uuid,(v_before->>'id')::uuid);
  v_actor := NULLIF(current_setting('jaslyn.actor_user_id',true),'')::uuid;
  v_request := NULLIF(current_setting('jaslyn.request_id',true),'');
  INSERT INTO financial_change_audit(tenant_id,actor_user_id,request_id,entity_type,entity_id,operation,before_data,after_data)
  VALUES(v_tenant,v_actor,v_request,TG_TABLE_NAME,v_id,TG_OP,v_before,v_after);
  RETURN COALESCE(NEW,OLD);
END; $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['customer_invoices','customer_invoice_lines','customer_credit_notes','payment_refunds','suppliers','purchase_orders','purchase_order_lines','supplier_invoices','inventory_items','inventory_stock_movements','tenant_branding','tenant_reseller_relationships','platform_api_keys','tenant_webhook_endpoints','webhook_delivery_outbox'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS jaslyn_financial_audit ON %I',t);
    EXECUTE format('CREATE TRIGGER jaslyn_financial_audit AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION jaslyn_financial_audit_trigger()',t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION jaslyn_reject_financial_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'financial_change_audit is append-only';
END; $$;
DROP TRIGGER IF EXISTS financial_change_audit_no_update ON financial_change_audit;
CREATE TRIGGER financial_change_audit_no_update BEFORE UPDATE OR DELETE ON financial_change_audit FOR EACH ROW EXECUTE FUNCTION jaslyn_reject_financial_audit_mutation();

COMMIT;
