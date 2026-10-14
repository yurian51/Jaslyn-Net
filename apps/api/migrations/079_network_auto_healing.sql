CREATE TABLE IF NOT EXISTS network_auto_heal_policies (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  max_auto_retries smallint NOT NULL DEFAULT 1 CHECK (max_auto_retries BETWEEN 1 AND 3),
  cooldown_seconds integer NOT NULL DEFAULT 60 CHECK (cooldown_seconds BETWEEN 30 AND 3600),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS network_auto_heal_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  command_id uuid NOT NULL REFERENCES network_commands(id) ON DELETE CASCADE,
  failed_attempt_number integer NOT NULL CHECK (failed_attempt_number BETWEEN 1 AND 1000),
  command_type text NOT NULL CHECK (command_type IN ('BANDWIDTH_ENFORCEMENT')),
  status text NOT NULL CHECK (status IN ('PROCESSING','REQUEUED','VERIFIED','FAILED','SKIPPED')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT network_auto_heal_run_attempt_unique UNIQUE (tenant_id, command_id, failed_attempt_number)
);

CREATE INDEX IF NOT EXISTS network_auto_heal_runs_tenant_recent_idx
  ON network_auto_heal_runs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS network_auto_heal_runs_command_idx
  ON network_auto_heal_runs (command_id, created_at DESC);

CREATE OR REPLACE FUNCTION network_auto_heal_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS network_auto_heal_policy_touch_trigger ON network_auto_heal_policies;
CREATE TRIGGER network_auto_heal_policy_touch_trigger
  BEFORE UPDATE ON network_auto_heal_policies
  FOR EACH ROW EXECUTE FUNCTION network_auto_heal_touch_updated_at();
