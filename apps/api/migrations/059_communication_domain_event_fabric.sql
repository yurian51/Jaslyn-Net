BEGIN;

CREATE TABLE IF NOT EXISTS communication_domain_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_key text NOT NULL,
  event_type text NOT NULL,
  aggregate_type text,
  aggregate_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','PROCESSED','FAILED')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  processed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,event_key)
);

CREATE INDEX IF NOT EXISTS communication_domain_events_claim_idx
  ON communication_domain_events(status,available_at,created_at)
  WHERE status IN ('PENDING','FAILED');

CREATE INDEX IF NOT EXISTS communication_domain_events_tenant_created_idx
  ON communication_domain_events(tenant_id,created_at DESC);

ALTER TABLE communication_notifications
  ADD COLUMN IF NOT EXISTS source_event_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS communication_notifications_source_event_uq
  ON communication_notifications(tenant_id,user_id,source_event_id)
  WHERE source_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS communication_notifications_source_event_idx
  ON communication_notifications(tenant_id,source_event_id)
  WHERE source_event_id IS NOT NULL;

COMMIT;
