BEGIN;

CREATE TABLE IF NOT EXISTS upesipay_callback_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider_event_id text NOT NULL,
  merchant_request_id text,
  checkout_request_id text,
  reference_id text,
  status text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  verification_status text NOT NULL DEFAULT 'PENDING',
  received_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  UNIQUE (tenant_id, provider_event_id),
  CHECK (status IN ('success','failed','cancelled','timeout','unknown')),
  CHECK (verification_status IN ('PENDING','VERIFIED','REJECTED'))
);

CREATE INDEX IF NOT EXISTS upesipay_callback_reference_idx
  ON upesipay_callback_events (tenant_id, reference_id)
  WHERE reference_id IS NOT NULL;

COMMIT;
