CREATE TABLE IF NOT EXISTS customer_portal_credentials (
  tenant_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  password_hash text NOT NULL,
  failed_login_attempts integer NOT NULL DEFAULT 0 CHECK (failed_login_attempts BETWEEN 0 AND 1000),
  locked_until timestamptz,
  last_login_at timestamptz,
  password_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, customer_id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS customer_portal_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id, id) ON DELETE SET NULL (created_by)
);
CREATE INDEX IF NOT EXISTS customer_portal_invitation_customer_idx
  ON customer_portal_invitations (tenant_id, customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS customer_portal_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id) ON DELETE CASCADE,
  UNIQUE (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS customer_portal_sessions_customer_idx
  ON customer_portal_sessions (tenant_id, customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS customer_portal_sessions_expiry_idx
  ON customer_portal_sessions (expires_at) WHERE revoked_at IS NULL;

CREATE OR REPLACE FUNCTION customer_portal_credentials_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS customer_portal_credentials_touch_trigger ON customer_portal_credentials;
CREATE TRIGGER customer_portal_credentials_touch_trigger
  BEFORE UPDATE ON customer_portal_credentials
  FOR EACH ROW EXECUTE FUNCTION customer_portal_credentials_touch_updated_at();
