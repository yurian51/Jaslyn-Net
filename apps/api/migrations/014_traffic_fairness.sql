BEGIN;

CREATE TABLE IF NOT EXISTS router_bandwidth_profiles (
  tenant_id uuid NOT NULL,
  router_id uuid NOT NULL,
  capacity_mbps numeric(12,3) NOT NULL CHECK (capacity_mbps > 0),
  activate_threshold_percent numeric(5,2) NOT NULL DEFAULT 80 CHECK (activate_threshold_percent >= 0 AND activate_threshold_percent <= 100),
  aggressive_threshold_percent numeric(5,2) NOT NULL DEFAULT 90 CHECK (aggressive_threshold_percent >= 0 AND aggressive_threshold_percent <= 100),
  recovery_threshold_percent numeric(5,2) NOT NULL DEFAULT 60 CHECK (recovery_threshold_percent >= 0 AND recovery_threshold_percent <= 100),
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, router_id),
  FOREIGN KEY (tenant_id, router_id) REFERENCES routers(tenant_id, id) ON DELETE CASCADE,
  CHECK (recovery_threshold_percent < activate_threshold_percent),
  CHECK (activate_threshold_percent <= aggressive_threshold_percent)
);

CREATE TABLE IF NOT EXISTS traffic_fairness_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  router_id uuid NOT NULL,
  mode text NOT NULL CHECK (mode IN ('NORMAL','FAIRNESS_ACTIVE','AGGRESSIVE','RECOVERING')),
  utilization_percent numeric(7,3) NOT NULL CHECK (utilization_percent >= 0),
  capacity_mbps numeric(12,3) NOT NULL CHECK (capacity_mbps >= 0),
  allocations jsonb NOT NULL DEFAULT '[]'::jsonb,
  observed_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, router_id) REFERENCES routers(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS traffic_fairness_events_router_time_idx
  ON traffic_fairness_events (tenant_id, router_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS traffic_fairness_events_mode_time_idx
  ON traffic_fairness_events (tenant_id, mode, observed_at DESC)
  WHERE mode <> 'NORMAL';

COMMIT;
