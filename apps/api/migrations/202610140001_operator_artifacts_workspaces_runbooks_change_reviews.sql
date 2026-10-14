-- Persistent operator workspaces, operational artifacts, runbooks, connector registry,
-- and governed change reviews. Tenant IDs are carried on every row and every access
-- path must scope queries by tenant_id. Connector credentials are deliberately not stored here.

CREATE TABLE IF NOT EXISTS operational_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  owner_user_id uuid,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 180),
  artifact_type text NOT NULL CHECK (artifact_type IN ('DASHBOARD','REPORT','SNAPSHOT','PLAYBOOK','DOCUMENT')),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  visibility text NOT NULL DEFAULT 'PRIVATE' CHECK (visibility IN ('PRIVATE','TENANT')),
  current_version integer NOT NULL DEFAULT 1 CHECK (current_version > 0),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS operational_artifact_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  artifact_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  content jsonb NOT NULL,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  change_note text NOT NULL DEFAULT '' CHECK (length(change_note) <= 1000),
  UNIQUE (tenant_id, artifact_id, version),
  FOREIGN KEY (tenant_id, artifact_id) REFERENCES operational_artifacts(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS operational_artifacts_tenant_updated_idx
  ON operational_artifacts (tenant_id, updated_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS operational_artifact_versions_history_idx
  ON operational_artifact_versions (tenant_id, artifact_id, version DESC);

CREATE TABLE IF NOT EXISTS operator_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  layout jsonb NOT NULL DEFAULT '{}'::jsonb,
  pinned_routes jsonb NOT NULL DEFAULT '[]'::jsonb,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, name)
);
CREATE UNIQUE INDEX IF NOT EXISTS operator_workspaces_one_default_idx
  ON operator_workspaces (tenant_id, user_id) WHERE is_default = true;
CREATE INDEX IF NOT EXISTS operator_workspaces_user_idx
  ON operator_workspaces (tenant_id, user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS operational_runbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 180),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  category text NOT NULL DEFAULT 'GENERAL',
  severity text NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN ('CRITICAL','HIGH','MEDIUM','LOW','INFO')),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','RETIRED')),
  current_version integer NOT NULL DEFAULT 1 CHECK (current_version > 0),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS operational_runbook_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  runbook_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  steps jsonb NOT NULL CHECK (jsonb_typeof(steps) = 'array'),
  preconditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  rollback_steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  change_note text NOT NULL DEFAULT '' CHECK (length(change_note) <= 1000),
  UNIQUE (tenant_id, runbook_id, version),
  FOREIGN KEY (tenant_id, runbook_id) REFERENCES operational_runbooks(tenant_id, id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS operational_runbook_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  runbook_id uuid NOT NULL,
  runbook_version integer NOT NULL,
  requested_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK (status IN ('PENDING_APPROVAL','APPROVED','RUNNING','SUCCEEDED','FAILED','CANCELLED','ROLLED_BACK')),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  input_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  step_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, runbook_id) REFERENCES operational_runbooks(tenant_id, id)
);
CREATE INDEX IF NOT EXISTS operational_runbooks_tenant_status_idx
  ON operational_runbooks (tenant_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS operational_runbook_executions_tenant_idx
  ON operational_runbook_executions (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS integration_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  provider_key text NOT NULL CHECK (provider_key ~ '^[a-z0-9][a-z0-9_.-]{1,99}$'),
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 160),
  status text NOT NULL DEFAULT 'DISCONNECTED' CHECK (status IN ('DISCONNECTED','CONNECTED','DEGRADED','ERROR','DISABLED')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  credential_reference text,
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_error_code text,
  last_error_summary text CHECK (last_error_summary IS NULL OR length(last_error_summary) <= 1000),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, provider_key)
);
-- Composite FK targets must have a matching unique key. Keep this idempotent because
-- a failed deployment can leave the table present before the migration is retried.
DO $
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'integration_connections'::regclass
      AND conname = 'integration_connections_tenant_id_id_key'
  ) THEN
    ALTER TABLE integration_connections
      ADD CONSTRAINT integration_connections_tenant_id_id_key UNIQUE (tenant_id, id);
  END IF;
END $;
CREATE TABLE IF NOT EXISTS integration_action_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  action_type text NOT NULL,
  status text NOT NULL CHECK (status IN ('PENDING','SUCCEEDED','FAILED','REJECTED')),
  request_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_summary jsonb,
  error_code text,
  actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (tenant_id, connection_id, idempotency_key),
  FOREIGN KEY (tenant_id, connection_id) REFERENCES integration_connections(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS integration_connections_tenant_status_idx
  ON integration_connections (tenant_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS integration_action_receipts_history_idx
  ON integration_action_receipts (tenant_id, connection_id, created_at DESC);

CREATE TABLE IF NOT EXISTS operational_change_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  change_type text NOT NULL CHECK (change_type IN ('NETWORK_CONFIG','WORKFLOW','INTEGRATION','POLICY','RELEASE')),
  target_type text NOT NULL,
  target_id text NOT NULL,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 180),
  proposed_change jsonb NOT NULL,
  before_snapshot jsonb,
  after_snapshot jsonb,
  diff_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  backup_reference text,
  rollback_plan jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','APPLIED','FAILED','ROLLED_BACK','CANCELLED')),
  risk_level text NOT NULL DEFAULT 'MEDIUM' CHECK (risk_level IN ('CRITICAL','HIGH','MEDIUM','LOW')),
  requested_by uuid NOT NULL,
  reviewed_by uuid,
  review_note text CHECK (review_note IS NULL OR length(review_note) <= 2000),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  applied_at timestamptz,
  rolled_back_at timestamptz,
  UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS operational_change_reviews_queue_idx
  ON operational_change_reviews (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS operational_change_reviews_target_idx
  ON operational_change_reviews (tenant_id, target_type, target_id, created_at DESC);

CREATE TABLE IF NOT EXISTS operational_change_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  change_review_id uuid NOT NULL REFERENCES operational_change_reviews(id) ON DELETE CASCADE,
  evidence_type text NOT NULL CHECK (evidence_type IN ('BACKUP','DIFF','TEST','APPROVAL','DEPLOYMENT','ROLLBACK','AUDIT')),
  evidence jsonb NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS operational_change_evidence_history_idx
  ON operational_change_evidence (tenant_id, change_review_id, created_at ASC);

-- Guardrails: reject cross-tenant evidence references at insert/update time.
CREATE OR REPLACE FUNCTION enforce_operational_change_evidence_tenant()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM operational_change_reviews r
    WHERE r.id = NEW.change_review_id AND r.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'change review tenant mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS operational_change_evidence_tenant_guard ON operational_change_evidence;
CREATE TRIGGER operational_change_evidence_tenant_guard
  BEFORE INSERT OR UPDATE OF tenant_id, change_review_id ON operational_change_evidence
  FOR EACH ROW EXECUTE FUNCTION enforce_operational_change_evidence_tenant();
