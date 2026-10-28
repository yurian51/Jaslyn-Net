BEGIN;

ALTER TABLE network_commands
  ADD CONSTRAINT network_commands_tenant_id_uq UNIQUE (tenant_id,id);

ALTER TABLE ai_executions
  ADD COLUMN IF NOT EXISTS network_command_id uuid,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

ALTER TABLE ai_executions
  DROP CONSTRAINT IF EXISTS ai_executions_network_command_fk;

ALTER TABLE ai_executions
  ADD CONSTRAINT ai_executions_network_command_fk
  FOREIGN KEY (tenant_id,network_command_id)
  REFERENCES network_commands (tenant_id,id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ai_executions_network_command_idx
  ON ai_executions (tenant_id,network_command_id)
  WHERE network_command_id IS NOT NULL;

COMMIT;
