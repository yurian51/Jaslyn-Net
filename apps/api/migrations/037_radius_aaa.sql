BEGIN;

CREATE TABLE IF NOT EXISTS radius_nas_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  address inet NOT NULL,
  secret_encrypted text NOT NULL,
  auth_port integer NOT NULL DEFAULT 1812 CHECK (auth_port BETWEEN 1 AND 65535),
  accounting_port integer NOT NULL DEFAULT 1813 CHECK (accounting_port BETWEEN 1 AND 65535),
  coa_port integer NOT NULL DEFAULT 3799 CHECK (coa_port BETWEEN 1 AND 65535),
  enabled boolean NOT NULL DEFAULT true,
  protocol text NOT NULL DEFAULT 'UDP' CHECK (protocol IN ('UDP')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, address)
);
CREATE INDEX IF NOT EXISTS radius_nas_clients_address_idx ON radius_nas_clients (address) WHERE enabled=true;

CREATE TABLE IF NOT EXISTS radius_user_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  access_binding_id uuid NOT NULL,
  password_salt text NOT NULL,
  password_hash text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, access_binding_id),
  FOREIGN KEY (tenant_id, access_binding_id) REFERENCES customer_access_bindings(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS radius_accounting_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nas_client_id uuid REFERENCES radius_nas_clients(id) ON DELETE SET NULL,
  username text,
  acct_session_id text,
  status_type text NOT NULL CHECK (status_type IN ('START','INTERIM_UPDATE','STOP','ON'),
  ),
  nas_ip inet,
  framed_ip inet,
  calling_station_id text,
  input_octets bigint,
  output_octets bigint,
  session_time bigint,
  terminate_cause text,
  received_at timestamptz NOT NULL DEFAULT now(),
  raw_attributes jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS radius_accounting_session_idx
  ON radius_accounting_events (tenant_id, acct_session_id, received_at DESC);
CREATE INDEX IF NOT EXISTS radius_accounting_user_idx
  ON radius_accounting_events (tenant_id, username, received_at DESC);

CREATE TABLE IF NOT EXISTS radius_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  nas_client_id uuid REFERENCES radius_nas_clients(id) ON DELETE SET NULL,
  packet_code integer NOT NULL,
  packet_identifier integer NOT NULL,
  username text,
  result text NOT NULL,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS radius_events_tenant_created_idx ON radius_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS radius_events_correlation_idx ON radius_events (correlation_id);

COMMIT;
