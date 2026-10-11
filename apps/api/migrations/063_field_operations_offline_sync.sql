BEGIN;

-- Idempotency ledger for field devices syncing queued work while offline.
CREATE TABLE IF NOT EXISTS network_job_sync_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  operation_id uuid NOT NULL,
  job_id uuid NOT NULL,
  operation_type text NOT NULL CHECK (operation_type IN ('NOTE_ADDED','STATUS_CHANGED','CHECKLIST_ITEM_SET')),
  client_occurred_at timestamptz,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, operation_id),
  FOREIGN KEY (tenant_id, job_id) REFERENCES network_jobs(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS network_job_sync_receipts_job_idx
  ON network_job_sync_receipts (tenant_id,job_id,received_at DESC);

CREATE TABLE IF NOT EXISTS network_job_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_id uuid NOT NULL,
  item_key text NOT NULL CHECK (length(item_key) BETWEEN 1 AND 120),
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 240),
  is_checked boolean NOT NULL DEFAULT false,
  checked_by uuid,
  checked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,job_id,item_key),
  FOREIGN KEY (tenant_id,job_id) REFERENCES network_jobs(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,checked_by) REFERENCES users(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS network_job_checklist_job_idx
  ON network_job_checklist_items (tenant_id,job_id,updated_at DESC);

-- Images are stored as bounded binary objects in PostgreSQL for portable
-- self-hosted deployments. The API enforces file signature and MIME validation.
CREATE TABLE IF NOT EXISTS network_job_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_id uuid NOT NULL,
  file_name text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 180),
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg','image/png','image/webp')),
  content bytea NOT NULL,
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 5242880),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,job_id) REFERENCES network_jobs(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,created_by) REFERENCES users(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS network_job_attachments_job_idx
  ON network_job_attachments (tenant_id,job_id,created_at DESC);

COMMIT;
