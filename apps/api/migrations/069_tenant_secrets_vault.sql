BEGIN;

CREATE TABLE IF NOT EXISTS tenant_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  secret_key text NOT NULL CHECK (secret_key ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{1,99}$'),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 2 AND 160),
  purpose text NOT NULL CHECK (length(purpose) BETWEEN 2 AND 120),
  encrypted_value text NOT NULL,
  encryption_key_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1 CHECK (version>=1),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_rotated_at timestamptz,
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,secret_key),
  FOREIGN KEY (tenant_id,created_by) REFERENCES users(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,updated_by) REFERENCES users(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS tenant_secrets_tenant_updated_idx
  ON tenant_secrets (tenant_id,updated_at DESC);

COMMIT;
