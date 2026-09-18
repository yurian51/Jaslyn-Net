BEGIN;

CREATE TABLE IF NOT EXISTS organization_profiles (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  business_name text NOT NULL,
  contact_name text,
  phone text,
  email text,
  address text,
  logo_url text,
  brand_color text NOT NULL DEFAULT '#1769E0',
  support_phone text,
  support_whatsapp text,
  support_email text,
  portal_headline text NOT NULL DEFAULT 'Choose your WiFi plan',
  portal_subtitle text NOT NULL DEFAULT 'Select a package to get connected.',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS account_lifecycle (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'OPEN' CHECK (state IN ('OPEN','CLOSING','CLOSED','DELETION_PENDING')),
  close_requested_at timestamptz,
  deletion_requested_at timestamptz,
  deletion_execute_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_payment_settings (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  accept_vouchers boolean NOT NULL DEFAULT true,
  accept_online_payments boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','RESOLVED','CLOSED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, user_id) REFERENCES users(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS support_tickets_tenant_created_idx ON support_tickets (tenant_id, created_at DESC);

INSERT INTO organization_profiles (tenant_id, business_name, contact_name, email)
SELECT t.id, t.name, u.full_name, u.email
FROM tenants t
LEFT JOIN LATERAL (
  SELECT full_name, email FROM users WHERE tenant_id=t.id ORDER BY created_at ASC LIMIT 1
) u ON true
ON CONFLICT (tenant_id) DO NOTHING;

INSERT INTO account_lifecycle (tenant_id) SELECT id FROM tenants ON CONFLICT DO NOTHING;
INSERT INTO workspace_payment_settings (tenant_id) SELECT id FROM tenants ON CONFLICT DO NOTHING;

COMMIT;
