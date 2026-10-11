-- Durable workflow snapshots and immutable definition history.
ALTER TABLE automation_workflows
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

ALTER TABLE automation_workflow_runs
  ADD COLUMN IF NOT EXISTS steps_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS execution_payload jsonb;

UPDATE automation_workflow_runs r
SET steps_snapshot = COALESCE(r.steps_snapshot,w.steps),
    execution_payload = COALESCE(r.execution_payload,r.trigger_payload)
FROM automation_workflows w
WHERE r.workflow_id = w.id
  AND r.tenant_id = w.tenant_id
  AND (r.steps_snapshot IS NULL OR r.execution_payload IS NULL);

CREATE TABLE IF NOT EXISTS automation_workflow_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  workflow_id uuid NOT NULL REFERENCES automation_workflows(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  definition jsonb NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automation_workflow_versions_tenant_workflow_version_key
    UNIQUE (tenant_id, workflow_id, version)
);

INSERT INTO automation_workflow_versions
  (tenant_id, workflow_id, version, definition, created_by, created_at)
SELECT tenant_id, id, version,
       jsonb_build_object(
         'name', name,
         'description', description,
         'triggerType', trigger_type,
         'triggerConfig', trigger_config,
         'steps', steps
       ),
       created_by, created_at
FROM automation_workflows
ON CONFLICT (tenant_id, workflow_id, version) DO NOTHING;

CREATE INDEX IF NOT EXISTS automation_workflow_versions_history_idx
  ON automation_workflow_versions (tenant_id, workflow_id, version DESC);

CREATE INDEX IF NOT EXISTS automation_workflow_runs_snapshot_idx
  ON automation_workflow_runs (tenant_id, workflow_id, created_at DESC);
