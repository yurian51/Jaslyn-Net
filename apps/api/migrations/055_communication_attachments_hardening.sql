BEGIN;

ALTER TABLE message_attachments
  ADD COLUMN IF NOT EXISTS size_bytes bigint,
  ADD COLUMN IF NOT EXISTS duration_ms integer,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS scan_status text NOT NULL DEFAULT 'PENDING' CHECK (scan_status IN ('PENDING','CLEAN','INFECTED','SKIPPED')),
  ADD COLUMN IF NOT EXISTS uploaded_at timestamptz;

CREATE INDEX IF NOT EXISTS message_attachments_scan_idx
  ON message_attachments(tenant_id,scan_status,created_at DESC);

COMMIT;
