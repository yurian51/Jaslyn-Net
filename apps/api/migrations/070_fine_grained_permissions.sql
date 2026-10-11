BEGIN;

CREATE TABLE IF NOT EXISTS permission_catalog (
  permission_key text PRIMARY KEY CHECK (permission_key ~ '^[a-z][a-z0-9._-]{2,99}$'),
  description text NOT NULL
);
INSERT INTO permission_catalog(permission_key,description) VALUES
 ('secrets.read','Read secret metadata; plaintext is never returned by the API'),
 ('secrets.write','Create or rotate encrypted secrets'),
 ('network.policy.read','Read desired-state network policies and evaluations'),
 ('network.policy.write','Create or modify desired-state policies'),
 ('network.policy.evaluate','Evaluate a desired-state policy against stored device configuration'),
 ('compliance.read','Read compliance scans and findings'),
 ('compliance.scan','Start or schedule compliance scans'),
 ('compliance.manage','Resolve or accept compliance findings'),
 ('synthetic.read','Read synthetic monitors and check history'),
 ('synthetic.write','Create, pause or enable synthetic monitors'),
 ('synthetic.check','Execute a manual synthetic check'),
 ('revenue.read','Read revenue reconciliation runs and discrepancies'),
 ('revenue.reconcile','Run financial reconciliation'),
 ('revenue.manage','Resolve or accept revenue discrepancies'),
 ('incident.read','Read incidents and timelines'),
 ('incident.manage','Assign owners and update incident state'),
 ('status.manage','Publish the customer-facing status page'),
 ('maintenance.read','Read maintenance windows'),
 ('maintenance.manage','Create or cancel maintenance windows'),
 ('field.read','Read field work orders and attachments'),
 ('field.write','Create field notes, checklist changes and photo uploads'),
 ('field.sync','Synchronize offline field operations'),
 ('network.changes.read','Read network configuration and command change intelligence'),
 ('audit.read','Read audit records and security alerts')
ON CONFLICT(permission_key) DO UPDATE SET description=EXCLUDED.description;

CREATE TABLE IF NOT EXISTS tenant_role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  role text NOT NULL,
  permission_key text NOT NULL REFERENCES permission_catalog(permission_key) ON DELETE RESTRICT,
  allowed boolean NOT NULL,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,role,permission_key),
  FOREIGN KEY (tenant_id,updated_by) REFERENCES users(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS tenant_role_permissions_lookup_idx
  ON tenant_role_permissions(tenant_id,role,permission_key);

CREATE TABLE IF NOT EXISTS user_permission_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  permission_key text NOT NULL REFERENCES permission_catalog(permission_key) ON DELETE RESTRICT,
  allowed boolean NOT NULL,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,user_id,permission_key),
  FOREIGN KEY (tenant_id,user_id) REFERENCES users(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,updated_by) REFERENCES users(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS user_permission_overrides_lookup_idx
  ON user_permission_overrides(tenant_id,user_id,permission_key);

COMMIT;
