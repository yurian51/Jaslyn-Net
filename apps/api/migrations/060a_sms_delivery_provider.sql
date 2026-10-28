BEGIN;

ALTER TABLE notification_outbox
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'TRANSACTIONAL'
    CHECK (category IN ('TRANSACTIONAL','EXPIRY','PAYMENT','PURCHASE','MARKETING'));

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS sms_marketing_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_marketing_consent_at timestamptz;

CREATE INDEX IF NOT EXISTS notification_outbox_sms_claim_idx
  ON notification_outbox (available_at, created_at)
  WHERE channel = 'SMS' AND status = 'PENDING';

CREATE INDEX IF NOT EXISTS customers_tenant_phone_marketing_idx
  ON customers (tenant_id, phone)
  WHERE sms_marketing_consent = true AND phone IS NOT NULL;

COMMIT;
