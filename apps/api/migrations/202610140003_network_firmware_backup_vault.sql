CREATE TABLE IF NOT EXISTS network_firmware_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  router_id uuid NOT NULL REFERENCES routers(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES network_firmware_upgrade_jobs(id) ON DELETE CASCADE,
  encrypted_payload text NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  file_name text NOT NULL,
  status text NOT NULL DEFAULT 'STORED' CHECK (status IN ('STORED','RESTORE_TESTED','EXPIRED','DELETED')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT network_firmware_backups_job_unique UNIQUE (tenant_id, job_id)
);

CREATE INDEX IF NOT EXISTS network_firmware_backups_tenant_router_idx
  ON network_firmware_backups (tenant_id, router_id, created_at DESC);
