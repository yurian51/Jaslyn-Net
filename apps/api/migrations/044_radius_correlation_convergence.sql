BEGIN;

-- Correlation IDs are cross-domain tracing identifiers, not RADIUS-only UUIDs.
-- Preserve historical values while allowing the same lifecycle identifier to
-- flow through payments, purchases, access, sessions and RADIUS evidence.
ALTER TABLE radius_events
  ALTER COLUMN correlation_id DROP DEFAULT;

ALTER TABLE radius_events
  ALTER COLUMN correlation_id TYPE text
  USING correlation_id::text;

ALTER TABLE radius_events
  ALTER COLUMN correlation_id SET DEFAULT gen_random_uuid()::text;

CREATE INDEX IF NOT EXISTS radius_events_tenant_correlation_idx
  ON radius_events (tenant_id, correlation_id, created_at DESC)
  WHERE correlation_id IS NOT NULL;

COMMIT;
