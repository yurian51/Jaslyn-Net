BEGIN;

CREATE TABLE IF NOT EXISTS wan_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  router_id uuid NOT NULL,
  name text NOT NULL,
  provider text,
  interface_name text,
  gateway inet,
  address cidr,
  capacity_mbps numeric(14,3) NOT NULL CHECK (capacity_mbps > 0),
  configured_weight integer NOT NULL DEFAULT 1 CHECK (configured_weight > 0),
  priority integer NOT NULL DEFAULT 100 CHECK (priority >= 0),
  failover_priority integer NOT NULL DEFAULT 100 CHECK (failover_priority >= 0),
  enabled boolean NOT NULL DEFAULT true,
  drain_requested boolean NOT NULL DEFAULT false,
  health_state text NOT NULL DEFAULT 'UNKNOWN' CHECK (health_state IN ('HEALTHY','DEGRADED','UNAVAILABLE','RECOVERING','DISABLED','DRAINING','UNKNOWN')),
  latency_ms numeric(12,3),
  jitter_ms numeric(12,3),
  packet_loss_percent numeric(7,4),
  observed_utilization_percent numeric(7,4),
  observed_upload_bps bigint,
  observed_download_bps bigint,
  active_sessions integer NOT NULL DEFAULT 0 CHECK (active_sessions >= 0),
  last_health_check_at timestamptz,
  last_state_change_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, router_id) REFERENCES routers(tenant_id, id) ON DELETE CASCADE,
  UNIQUE (tenant_id, router_id, name)
);

CREATE INDEX IF NOT EXISTS wan_connections_tenant_router_idx
  ON wan_connections (tenant_id, router_id, enabled, health_state, priority);

CREATE TABLE IF NOT EXISTS wan_health_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  wan_connection_id uuid NOT NULL,
  method text NOT NULL CHECK (method IN ('GATEWAY_ICMP','ICMP','TCP','DNS','HTTP','HTTPS')),
  target text NOT NULL,
  interval_seconds integer NOT NULL DEFAULT 10 CHECK (interval_seconds BETWEEN 1 AND 3600),
  timeout_ms integer NOT NULL DEFAULT 3000 CHECK (timeout_ms BETWEEN 250 AND 30000),
  failure_threshold integer NOT NULL DEFAULT 3 CHECK (failure_threshold BETWEEN 1 AND 20),
  recovery_threshold integer NOT NULL DEFAULT 3 CHECK (recovery_threshold BETWEEN 1 AND 20),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, wan_connection_id) REFERENCES wan_connections(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS wan_health_checks_active_idx
  ON wan_health_checks (tenant_id, wan_connection_id, enabled);

CREATE TABLE IF NOT EXISTS load_balance_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  router_id uuid NOT NULL,
  name text NOT NULL,
  strategy text NOT NULL CHECK (strategy IN ('WEIGHTED','PRIMARY_SECONDARY','LEAST_UTILIZED','CONNECTION_BASED','POLICY_BASED','SERVICE_BASED','DESTINATION_BASED','SOURCE_BASED','SUBNET_BASED','CUSTOMER_BASED')),
  enabled boolean NOT NULL DEFAULT true,
  capacity_aware boolean NOT NULL DEFAULT true,
  rebalance_threshold_percent numeric(7,4) NOT NULL DEFAULT 15 CHECK (rebalance_threshold_percent >= 0 AND rebalance_threshold_percent <= 100),
  degrade_threshold_percent numeric(7,4) NOT NULL DEFAULT 80 CHECK (degrade_threshold_percent >= 0 AND degrade_threshold_percent <= 100),
  unavailable_after_failures integer NOT NULL DEFAULT 3 CHECK (unavailable_after_failures BETWEEN 1 AND 20),
  recover_after_successes integer NOT NULL DEFAULT 3 CHECK (recover_after_successes BETWEEN 1 AND 20),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, router_id, name),
  FOREIGN KEY (tenant_id, router_id) REFERENCES routers(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS load_balance_policies_router_idx
  ON load_balance_policies (tenant_id, router_id, enabled);

CREATE TABLE IF NOT EXISTS load_balance_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  policy_id uuid NOT NULL,
  wan_connection_id uuid NOT NULL,
  configured_weight integer NOT NULL DEFAULT 1 CHECK (configured_weight > 0),
  priority integer NOT NULL DEFAULT 100 CHECK (priority >= 0),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, policy_id, wan_connection_id),
  FOREIGN KEY (tenant_id, policy_id) REFERENCES load_balance_policies(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, wan_connection_id) REFERENCES wan_connections(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS load_balance_members_policy_idx
  ON load_balance_members (tenant_id, policy_id, enabled, priority);

CREATE TABLE IF NOT EXISTS load_balance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  router_id uuid NOT NULL,
  wan_connection_id uuid,
  policy_id uuid,
  event_type text NOT NULL CHECK (event_type IN ('WAN_MEMBER_UP','WAN_MEMBER_DOWN','WAN_MEMBER_DEGRADED','WAN_MEMBER_RECOVERING','WAN_MEMBER_DISABLED','WAN_MEMBER_DRAINING','LOAD_BALANCE_POLICY_CHANGED','TRAFFIC_REBALANCED','FAILOVER_STARTED','FAILOVER_COMPLETED','FAILOVER_RECOVERY_STARTED','FAILOVER_RECOVERED','GATEWAY_HEALTH_CHANGED','PACKET_LOSS_THRESHOLD_EXCEEDED','LATENCY_THRESHOLD_EXCEEDED','BANDWIDTH_THRESHOLD_EXCEEDED','ROUTE_CHANGED')),
  correlation_id text,
  previous_state text,
  new_state text,
  observed_traffic_share_percent numeric(7,4),
  configured_weight integer,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, router_id) REFERENCES routers(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, wan_connection_id) REFERENCES wan_connections(tenant_id, id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id, policy_id) REFERENCES load_balance_policies(tenant_id, id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS load_balance_events_router_idx
  ON load_balance_events (tenant_id, router_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS load_balance_events_correlation_uq
  ON load_balance_events (tenant_id, event_type, correlation_id)
  WHERE correlation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS load_balance_telemetry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  wan_connection_id uuid NOT NULL,
  sampled_at timestamptz NOT NULL DEFAULT now(),
  upload_bps bigint NOT NULL DEFAULT 0 CHECK (upload_bps >= 0),
  download_bps bigint NOT NULL DEFAULT 0 CHECK (download_bps >= 0),
  active_sessions integer NOT NULL DEFAULT 0 CHECK (active_sessions >= 0),
  latency_ms numeric(12,3),
  jitter_ms numeric(12,3),
  packet_loss_percent numeric(7,4),
  capacity_mbps numeric(14,3) NOT NULL CHECK (capacity_mbps > 0),
  health_state text NOT NULL CHECK (health_state IN ('HEALTHY','DEGRADED','UNAVAILABLE','RECOVERING','DISABLED','DRAINING','UNKNOWN')),
  FOREIGN KEY (tenant_id, wan_connection_id) REFERENCES wan_connections(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS load_balance_telemetry_recent_idx
  ON load_balance_telemetry (tenant_id, wan_connection_id, sampled_at DESC);

COMMIT;
