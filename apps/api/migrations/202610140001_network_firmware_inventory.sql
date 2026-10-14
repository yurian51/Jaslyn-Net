CREATE TABLE IF NOT EXISTS network_firmware_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  router_id uuid NOT NULL REFERENCES routers(id) ON DELETE CASCADE,
  vendor text NOT NULL,
  model text,
  hardware_revision text,
  installed_version text,
  observed_at timestamptz,
  observation_source text NOT NULL DEFAULT 'MANUAL',
  latest_version text,
  release_source_url text,
  release_source_verified boolean NOT NULL DEFAULT false,
  release_published_at timestamptz,
  release_notes text,
  status text NOT NULL DEFAULT 'UNKNOWN'
    CHECK (status IN ('UNKNOWN','CURRENT','UPDATE_AVAILABLE','BLOCKED_INCOMPATIBLE','STALE','CHECK_FAILED','UPDATE_PENDING','UPDATING','VERIFYING','SUCCEEDED','FAILED','RECOVERY_REQUIRED')),
  status_reason text NOT NULL DEFAULT 'Firmware release metadata has not been verified against an authoritative vendor source.',
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT network_firmware_inventory_tenant_router_key UNIQUE (tenant_id, router_id)
);

CREATE INDEX IF NOT EXISTS network_firmware_inventory_tenant_status_idx
  ON network_firmware_inventory (tenant_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS network_firmware_inventory_router_idx
  ON network_firmware_inventory (tenant_id, router_id);
