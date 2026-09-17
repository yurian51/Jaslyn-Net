CREATE TABLE IF NOT EXISTS fiber_line_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  fiber_line_id uuid NOT NULL,
  previous_status text,
  new_status text NOT NULL,
  reason text NOT NULL,
  source text NOT NULL DEFAULT 'API',
  actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fiber_line_events_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fiber_line_events_line_fk FOREIGN KEY (tenant_id, fiber_line_id) REFERENCES fiber_lines(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fiber_line_events_actor_fk FOREIGN KEY (tenant_id, actor_user_id) REFERENCES users(tenant_id, id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS fiber_line_events_line_created_idx
  ON fiber_line_events (tenant_id, fiber_line_id, created_at DESC);

CREATE INDEX IF NOT EXISTS fiber_line_events_tenant_created_idx
  ON fiber_line_events (tenant_id, created_at DESC);
