BEGIN;
CREATE TABLE IF NOT EXISTS sms_provider_configs (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'beem' CHECK (provider IN ('beem','custom_rest')),
  endpoint text,
  sender_id text NOT NULL DEFAULT '',
  auth_type text NOT NULL DEFAULT 'basic' CHECK (auth_type IN ('none','bearer','api_key','basic')),
  credentials_ciphertext text,
  api_key_header text NOT NULL DEFAULT 'X-API-Key',
  recipient_field text NOT NULL DEFAULT 'to',
  message_field text NOT NULL DEFAULT 'message',
  sender_field text NOT NULL DEFAULT 'sender',
  response_id_field text NOT NULL DEFAULT 'messageId',
  response_success_field text,
  response_success_value text NOT NULL DEFAULT 'true',
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(sender_id) <= 16)
);
CREATE INDEX IF NOT EXISTS sms_provider_configs_enabled_idx ON sms_provider_configs (enabled, updated_at DESC);
COMMIT;
