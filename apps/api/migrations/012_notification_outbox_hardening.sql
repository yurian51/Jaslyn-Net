BEGIN;

-- Prevent an item from being claimed again after its retry budget is exhausted.
CREATE INDEX IF NOT EXISTS notification_outbox_dead_letter_idx
  ON notification_outbox (tenant_id, updated_at DESC)
  WHERE status = 'FAILED' AND attempts >= 8;

-- Worker-safe idempotency key for integrations that need to enqueue the same
-- business event more than once without creating duplicate deliveries.
ALTER TABLE notification_outbox
  ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE UNIQUE INDEX IF NOT EXISTS notification_outbox_tenant_dedupe_uq
  ON notification_outbox (tenant_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

COMMIT;
