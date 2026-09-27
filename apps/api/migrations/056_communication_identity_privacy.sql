BEGIN;

CREATE TABLE IF NOT EXISTS communication_profiles (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  username text NOT NULL,
  phone_visibility text NOT NULL DEFAULT 'CONTACTS' CHECK (phone_visibility IN ('EVERYONE','CONTACTS','NOBODY')),
  discoverable_by_username boolean NOT NULL DEFAULT true,
  discoverable_by_phone boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,user_id),
  UNIQUE (tenant_id,username),
  FOREIGN KEY (tenant_id,user_id) REFERENCES users(tenant_id,id) ON DELETE CASCADE,
  CHECK (username ~ '^[a-z0-9_][a-z0-9_.-]{2,31}$')
);
CREATE INDEX IF NOT EXISTS communication_profiles_username_idx ON communication_profiles(tenant_id,lower(username));
CREATE INDEX IF NOT EXISTS communication_profiles_discovery_idx ON communication_profiles(tenant_id,discoverable_by_username,username);

COMMIT;