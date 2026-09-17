BEGIN;

CREATE TABLE IF NOT EXISTS incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  fingerprint text NOT NULL,
  category text NOT NULL CHECK (category IN ('NETWORK_DOWN','DEVICE_OFFLINE','RADIUS_FAILURE','AUTHENTICATION_FAILURE','BANDWIDTH_CONGESTION','UPSTREAM_FAILURE','PAYMENT_FAILURE','SERVICE_IMPACT','OTHER')),
  severity text NOT NULL CHECK (severity IN ('INFO','WARNING','CRITICAL')),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ACKNOWLEDGED','RESOLVED')),
  title text NOT NULL,
  summary text,
  root_resource_type text,
  root_resource_id uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  resolution text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, fingerprint, status)
);

CREATE TABLE IF NOT EXISTS incident_impacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  resource_type text NOT NULL CHECK (resource_type IN ('ROUTER','LOCATION','CUSTOMER','SESSION','PURCHASE','REVENUE')),
  resource_id uuid,
  impact_type text NOT NULL CHECK (impact_type IN ('INFRASTRUCTURE','CUSTOMER','SESSION','SERVICE','REVENUE')),
  state text NOT NULL DEFAULT 'AFFECTED' CHECK (state IN ('AFFECTED','RECOVERED','UNKNOWN')),
  estimated_revenue numeric(14,2) CHECK (estimated_revenue IS NULL OR estimated_revenue >= 0),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  recovered_at timestamptz
);

CREATE INDEX IF NOT EXISTS incidents_tenant_status_idx ON incidents (tenant_id, status, severity, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS incidents_tenant_root_idx ON incidents (tenant_id, root_resource_type, root_resource_id, status);
CREATE INDEX IF NOT EXISTS incident_impacts_incident_idx ON incident_impacts (tenant_id, incident_id, state, impact_type);
CREATE INDEX IF NOT EXISTS incident_impacts_resource_idx ON incident_impacts (tenant_id, resource_type, resource_id, state);

COMMIT;
