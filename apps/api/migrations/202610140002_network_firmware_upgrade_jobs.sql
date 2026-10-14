CREATE TABLE IF NOT EXISTS network_firmware_upgrade_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  router_id uuid NOT NULL REFERENCES routers(id) ON DELETE CASCADE,
  vendor text NOT NULL,
  management_protocol text NOT NULL,
  model text NOT NULL,
  hardware_revision text,
  installed_version text NOT NULL,
  target_version text NOT NULL,
  release_source_url text NOT NULL,
  release_source_verified boolean NOT NULL DEFAULT false,
  artifact_sha256 text,
  artifact_signature_verified boolean NOT NULL DEFAULT false,
  maintenance_window_start timestamptz,
  maintenance_window_end timestamptz,
  status text NOT NULL DEFAULT 'PREVIEW'
    CHECK (status IN ('PREVIEW','AWAITING_APPROVAL','APPROVED','QUEUED','RUNNING','VERIFYING','SUCCEEDED','FAILED','BLOCKED','CANCELLED','RECOVERY_REQUIRED')),
  preview jsonb NOT NULL DEFAULT '{}'::jsonb,
  approval_required boolean NOT NULL DEFAULT true,
  requested_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  idempotency_key text NOT NULL,
  execution_started_at timestamptz,
  execution_finished_at timestamptz,
  observed_version_after text,
  verification_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT network_firmware_upgrade_job_idempotency UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS network_firmware_upgrade_jobs_tenant_status_idx
  ON network_firmware_upgrade_jobs (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS network_firmware_upgrade_jobs_router_idx
  ON network_firmware_upgrade_jobs (tenant_id, router_id, created_at DESC);

CREATE TABLE IF NOT EXISTS network_firmware_upgrade_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  job_id uuid NOT NULL REFERENCES network_firmware_upgrade_jobs(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  stage text NOT NULL,
  status text NOT NULL CHECK (status IN ('STARTED','SUCCEEDED','FAILED','BLOCKED')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  error_message text,
  CONSTRAINT network_firmware_upgrade_attempt_unique UNIQUE (job_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS network_firmware_upgrade_attempts_tenant_job_idx
  ON network_firmware_upgrade_attempts (tenant_id, job_id, started_at DESC);
