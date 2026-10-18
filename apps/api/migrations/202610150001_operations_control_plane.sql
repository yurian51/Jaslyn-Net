-- Expanded ISP operations control plane. Tenant-scoped records only.
CREATE TABLE IF NOT EXISTS network_topology_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  node_type text NOT NULL CHECK (node_type IN ('ROUTER','SWITCH','OLT','ACCESS_POINT','SITE','LINK','SERVER')),
  resource_id uuid, name text NOT NULL, status text NOT NULL DEFAULT 'UNKNOWN' CHECK (status IN ('UP','DEGRADED','DOWN','UNKNOWN')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb, observed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,node_type,resource_id)
);
CREATE INDEX IF NOT EXISTS network_topology_nodes_tenant_status_idx ON network_topology_nodes(tenant_id,status,node_type);
CREATE TABLE IF NOT EXISTS network_topology_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_node_id uuid NOT NULL, target_node_id uuid NOT NULL, relation text NOT NULL DEFAULT 'DEPENDS_ON',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_node_id <> target_node_id),
  UNIQUE (tenant_id,source_node_id,target_node_id,relation),
  FOREIGN KEY (tenant_id,source_node_id) REFERENCES network_topology_nodes(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,target_node_id) REFERENCES network_topology_nodes(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS operations_control_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  record_type text NOT NULL CHECK (record_type IN ('CONFIG_SNAPSHOT','CHANGE_PLAN','TICKET','RUNBOOK','INTEGRATION','ASSET','MAINTENANCE','SECURITY_EVENT','BACKUP_DRILL','COMMUNICATION','REVENUE_FINDING','SLA_EVENT','FIELD_WORK_ORDER')),
  status text NOT NULL DEFAULT 'OPEN', priority text NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH','CRITICAL')),
  title text NOT NULL, description text, resource_type text, resource_id uuid, customer_id uuid,
  due_at timestamptz, idempotency_key text, payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid, updated_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,record_type,idempotency_key),
  UNIQUE (tenant_id,id)
);
CREATE INDEX IF NOT EXISTS operations_control_records_tenant_type_status_idx ON operations_control_records(tenant_id,record_type,status,created_at DESC);
CREATE INDEX IF NOT EXISTS operations_control_records_tenant_due_idx ON operations_control_records(tenant_id,due_at) WHERE due_at IS NOT NULL;
CREATE TABLE IF NOT EXISTS operations_control_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  record_id uuid NOT NULL, actor_user_id uuid, event_type text NOT NULL, note text, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,record_id) REFERENCES operations_control_records(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS operations_control_events_record_idx ON operations_control_events(tenant_id,record_id,created_at DESC);
