BEGIN;

CREATE TABLE IF NOT EXISTS network_topology_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('ROUTER','FIBER_ASSET','SITE','SWITCH','OLT','ONU','SUBSCRIBER')),
  source_id uuid NOT NULL,
  target_type text NOT NULL CHECK (target_type IN ('ROUTER','FIBER_ASSET','SITE','SWITCH','OLT','ONU','SUBSCRIBER')),
  target_id uuid NOT NULL,
  link_type text NOT NULL DEFAULT 'PHYSICAL' CHECK (link_type IN ('PHYSICAL','UPLINK','PARENT_CHILD','WIRELESS','SERVICE_DEPENDENCY')),
  capacity_bps bigint CHECK (capacity_bps IS NULL OR capacity_bps > 0),
  status text NOT NULL DEFAULT 'UNKNOWN' CHECK (status IN ('UP','DEGRADED','DOWN','UNKNOWN')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source_type, source_id, target_type, target_id, link_type),
  FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id,id) ON DELETE SET NULL (created_by)
);
CREATE INDEX IF NOT EXISTS network_topology_links_source_idx ON network_topology_links(tenant_id,source_type,source_id);
CREATE INDEX IF NOT EXISTS network_topology_links_target_idx ON network_topology_links(tenant_id,target_type,target_id);

CREATE TABLE IF NOT EXISTS device_config_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  router_id uuid NOT NULL,
  version_number integer NOT NULL CHECK (version_number > 0),
  encrypted_payload text NOT NULL,
  payload_sha256 char(64) NOT NULL,
  encryption_key_id text NOT NULL,
  source text NOT NULL CHECK (source IN ('MANUAL','DEVICE_READ','PRE_CHANGE','ROLLBACK_CAPTURE')),
  change_summary text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, router_id, version_number),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, router_id) REFERENCES routers(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id,id) ON DELETE SET NULL (created_by)
);
CREATE INDEX IF NOT EXISTS device_config_versions_router_time_idx ON device_config_versions(tenant_id,router_id,created_at DESC);

CREATE TABLE IF NOT EXISTS device_config_restore_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  router_id uuid NOT NULL,
  target_version_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK (status IN ('PENDING_APPROVAL','APPROVED','EXECUTING','VERIFIED','FAILED','CANCELLED')),
  requested_by uuid NOT NULL,
  approved_by uuid,
  execution_result jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(execution_result)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, router_id) REFERENCES routers(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, target_version_id) REFERENCES device_config_versions(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, requested_by) REFERENCES users(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, approved_by) REFERENCES users(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS device_config_restore_queue_idx ON device_config_restore_requests(tenant_id,status,created_at);

COMMIT;
