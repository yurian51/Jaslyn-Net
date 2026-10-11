BEGIN;

CREATE TABLE IF NOT EXISTS sms_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('EXPIRY','PAYMENT','PURCHASE','MARKETING','TRANSACTIONAL')),
  message text NOT NULL CHECK (length(message) BETWEEN 1 AND 1600),
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','PROCESSING','COMPLETED','PARTIAL','FAILED','CANCELED')),
  recipient_count integer NOT NULL DEFAULT 0 CHECK (recipient_count >= 0),
  queued_count integer NOT NULL DEFAULT 0 CHECK (queued_count >= 0),
  created_by_user_id uuid,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,idempotency_key),
  FOREIGN KEY (tenant_id,created_by_user_id) REFERENCES users(tenant_id,id) ON DELETE SET NULL
);

ALTER TABLE notification_outbox ADD COLUMN IF NOT EXISTS campaign_id uuid;
DO $$ BEGIN
  ALTER TABLE notification_outbox ADD CONSTRAINT notification_outbox_campaign_fk
    FOREIGN KEY (tenant_id,campaign_id) REFERENCES sms_campaigns(tenant_id,id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS sms_campaigns_tenant_created_idx ON sms_campaigns(tenant_id,created_at DESC);
CREATE INDEX IF NOT EXISTS notification_outbox_campaign_idx ON notification_outbox(tenant_id,campaign_id,created_at)
  WHERE campaign_id IS NOT NULL;

COMMIT;
