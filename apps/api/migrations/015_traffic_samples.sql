BEGIN;

CREATE TABLE IF NOT EXISTS traffic_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  router_id uuid NOT NULL,
  customer_id uuid,
  session_id uuid,
  bytes_in bigint NOT NULL CHECK (bytes_in >= 0),
  bytes_out bigint NOT NULL CHECK (bytes_out >= 0),
  sampled_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, router_id) REFERENCES routers(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, session_id) REFERENCES sessions(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id) ON DELETE CASCADE,
  CHECK (customer_id IS NOT NULL OR session_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS traffic_samples_router_time_idx
  ON traffic_samples (tenant_id, router_id, sampled_at DESC);

CREATE INDEX IF NOT EXISTS traffic_samples_session_time_idx
  ON traffic_samples (tenant_id, session_id, sampled_at DESC)
  WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS traffic_samples_customer_time_idx
  ON traffic_samples (tenant_id, customer_id, sampled_at DESC)
  WHERE customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS traffic_samples_session_sample_time_uq
  ON traffic_samples (tenant_id, session_id, sampled_at)
  WHERE session_id IS NOT NULL;

COMMIT;
