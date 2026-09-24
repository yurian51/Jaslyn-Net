BEGIN;

CREATE TABLE IF NOT EXISTS upesilipa_site_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id uuid NOT NULL,
  logo_url text,
  primary_color text,
  secondary_color text,
  support_phone text,
  portal_theme text NOT NULL DEFAULT 'MINIMAL',
  grace_period_seconds integer NOT NULL DEFAULT 0,
  health_check_enabled boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, location_id),
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations(tenant_id, id) ON DELETE CASCADE,
  CHECK (portal_theme IN ('MINIMAL','DARK','BOLD','COASTAL','MARKET')),
  CHECK (grace_period_seconds BETWEEN 0 AND 86400),
  CHECK (primary_color IS NULL OR primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  CHECK (secondary_color IS NULL OR secondary_color ~ '^#[0-9A-Fa-f]{6}$')
);

CREATE INDEX IF NOT EXISTS upesilipa_site_settings_tenant_idx
  ON upesilipa_site_settings (tenant_id, enabled);

COMMIT;
