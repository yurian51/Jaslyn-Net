BEGIN;

-- A deterministic correlation id represents one logical network operation.
-- Retries and reconciliation passes must reuse that operation instead of creating
-- duplicate router side effects.
CREATE UNIQUE INDEX IF NOT EXISTS network_commands_correlation_command_uq
  ON network_commands (tenant_id, command_type, correlation_id)
  WHERE correlation_id IS NOT NULL;

COMMIT;
