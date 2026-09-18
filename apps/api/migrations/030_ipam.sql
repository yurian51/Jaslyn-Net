BEGIN;

CREATE TABLE IF NOT EXISTS ipam_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  network cidr NOT NULL,
  gateway inet,
  role text NOT NULL DEFAULT 'CUSTOMER' CHECK (role IN ('CUSTOMER','WAN','VLAN','LOOPBACK','MANAGEMENT','OTHER')),
  allocation_mode text NOT NULL DEFAULT 'INVENTORY' CHECK (allocation_mode IN ('INVENTORY','DYNAMIC')),
  vlan_id integer CHECK (vlan_id IS NULL OR (vlan_id BETWEEN 1 AND 4094)),
  description text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS ipam_pools_tenant_role_idx
  ON ipam_pools (tenant_id, role, enabled);

CREATE INDEX IF NOT EXISTS ipam_pools_network_gist_idx
  ON ipam_pools USING gist (network inet_ops);

CREATE TABLE IF NOT EXISTS ipam_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pool_id uuid NOT NULL,
  address inet NOT NULL,
  status text NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE','RESERVED','ALLOCATED','QUARANTINED')),
  assignment_type text NOT NULL DEFAULT 'DYNAMIC' CHECK (assignment_type IN ('DYNAMIC','STATIC','RESERVED')),
  customer_id uuid,
  router_id uuid,
  session_id uuid,
  mac_address macaddr,
  lease_expires_at timestamptz,
  reservation_ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  allocated_at timestamptz,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, address),
  FOREIGN KEY (tenant_id, pool_id) REFERENCES ipam_pools(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ipam_addresses_pool_status_idx
  ON ipam_addresses (tenant_id, pool_id, status, address);

CREATE INDEX IF NOT EXISTS ipam_addresses_customer_idx
  ON ipam_addresses (tenant_id, customer_id, status);

CREATE INDEX IF NOT EXISTS ipam_addresses_lease_expiry_idx
  ON ipam_addresses (tenant_id, lease_expires_at)
  WHERE status='ALLOCATED';

COMMIT;