BEGIN;

CREATE TABLE IF NOT EXISTS traffic_enforcement_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  router_id uuid NOT NULL,
  mode text NOT NULL CHECK (mode IN ('NORMAL','FAIRNESS_ACTIVE','AGGRESSIVE','RECOVERING')),
  command_count integer NOT NULL CHECK (command_count >= 0),
  applied boolean NOT NULL,
  commands jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, router_id) REFERENCES routers(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS traffic_enforcement_events_router_time_idx
  ON traffic_enforcement_events (tenant_id, router_id, created_at DESC);

CREATE INDEX IF NOT EXISTS traffic_enforcement_events_failures_idx
  ON traffic_enforcement_events (tenant_id, router_id, created_at DESC)
  WHERE applied = false OR error IS NOT NULL;

COMMIT;
