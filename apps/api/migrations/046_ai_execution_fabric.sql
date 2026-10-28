BEGIN;

ALTER TABLE ai_runs ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'deterministic';
ALTER TABLE ai_runs ADD COLUMN IF NOT EXISTS model text;
ALTER TABLE ai_runs ADD COLUMN IF NOT EXISTS input_tokens integer;
ALTER TABLE ai_runs ADD COLUMN IF NOT EXISTS output_tokens integer;
ALTER TABLE ai_runs ADD COLUMN IF NOT EXISTS started_by text;
ALTER TABLE ai_actions ADD COLUMN IF NOT EXISTS correlation_id text;
ALTER TABLE ai_actions ADD COLUMN IF NOT EXISTS rollback jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE ai_actions ADD COLUMN IF NOT EXISTS error text;
CREATE INDEX IF NOT EXISTS ai_actions_tenant_status_idx ON ai_actions(tenant_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS ai_actions_tenant_correlation_idx ON ai_actions(tenant_id,correlation_id);

COMMIT;