CREATE TABLE IF NOT EXISTS captive_portal_settings (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  title text,
  welcome_message text,
  terms_text text NOT NULL DEFAULT 'By connecting, you agree to the network usage policy.',
  support_phone text,
  support_email text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS packages_portal_public_idx ON packages (tenant_id, is_active, show_on_portal, price) WHERE is_active=true AND show_on_portal=true;
