BEGIN;

ALTER TABLE fiber_lines
  ADD CONSTRAINT fiber_lines_customer_or_location_ck CHECK (customer_id IS NOT NULL OR location_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS fiber_lines_status_idx
  ON fiber_lines (tenant_id, service_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS network_sites_parent_idx
  ON network_sites (tenant_id, parent_site_id);

CREATE INDEX IF NOT EXISTS customer_service_state_customer_idx
  ON customer_service_state (tenant_id, customer_id, state, effective_at DESC);

COMMIT;
