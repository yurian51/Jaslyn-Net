BEGIN;

-- Revocable application sessions. JWTs remain short-lived; every API request
-- checks this server-side record so a revoked session stops working immediately.
CREATE TABLE IF NOT EXISTS auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  user_agent text,
  ip_address inet,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoke_reason text,
  FOREIGN KEY (tenant_id, user_id) REFERENCES users(tenant_id, id) ON DELETE CASCADE,
  UNIQUE (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS auth_sessions_user_active_idx
  ON auth_sessions (tenant_id, user_id, last_seen_at DESC)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS auth_sessions_expiry_idx
  ON auth_sessions (expires_at)
  WHERE revoked_at IS NULL;

-- Tamper-evident, per-tenant append-only audit chain.
-- pgcrypto is used for SHA-256. Existing audit entries are backfilled in
-- deterministic order before write protection is enabled.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS chain_sequence bigint,
  ADD COLUMN IF NOT EXISTS previous_hash text,
  ADD COLUMN IF NOT EXISTS entry_hash text;

-- Audit records are immutable; prevent parent/actor deletion from cascading updates or deletes.
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_tenant_id_fkey;
ALTER TABLE audit_logs
  ADD CONSTRAINT audit_logs_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_tenant_id_actor_user_id_fkey;
ALTER TABLE audit_logs
  ADD CONSTRAINT audit_logs_tenant_id_actor_user_id_fkey
  FOREIGN KEY (tenant_id, actor_user_id) REFERENCES users(tenant_id,id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS audit_chain_heads (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  last_sequence bigint NOT NULL DEFAULT 0,
  last_hash text NOT NULL DEFAULT repeat('0',64),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE
  tenant_row record;
  audit_row record;
  seq bigint;
  prev_hash text;
  next_hash text;
  payload text;
BEGIN
  FOR tenant_row IN SELECT DISTINCT tenant_id FROM audit_logs ORDER BY tenant_id LOOP
    seq := 0;
    prev_hash := repeat('0',64);
    FOR audit_row IN
      SELECT id, tenant_id, actor_user_id, action, resource_type, resource_id,
             request_id, correlation_id, ip_address, user_agent, metadata, created_at
      FROM audit_logs
      WHERE tenant_id=tenant_row.tenant_id
      ORDER BY created_at, id
    LOOP
      seq := seq + 1;
      payload := jsonb_build_object(
        'id', audit_row.id,
        'tenantId', audit_row.tenant_id,
        'actorUserId', audit_row.actor_user_id,
        'action', audit_row.action,
        'resourceType', audit_row.resource_type,
        'resourceId', audit_row.resource_id,
        'requestId', audit_row.request_id,
        'correlationId', audit_row.correlation_id,
        'ipAddress', audit_row.ip_address::text,
        'userAgent', audit_row.user_agent,
        'metadata', audit_row.metadata,
        'createdAtEpoch', extract(epoch from audit_row.created_at)::text
      )::text;
      next_hash := encode(digest(prev_hash || payload, 'sha256'), 'hex');
      UPDATE audit_logs
      SET chain_sequence=seq, previous_hash=prev_hash, entry_hash=next_hash
      WHERE id=audit_row.id;
      prev_hash := next_hash;
    END LOOP;
    INSERT INTO audit_chain_heads(tenant_id,last_sequence,last_hash)
    VALUES (tenant_row.tenant_id,seq,prev_hash)
    ON CONFLICT (tenant_id) DO UPDATE
      SET last_sequence=EXCLUDED.last_sequence,last_hash=EXCLUDED.last_hash,updated_at=now();
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION jaslyn_audit_chain_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  chain_head audit_chain_heads%ROWTYPE;
  payload text;
BEGIN
  INSERT INTO audit_chain_heads(tenant_id,last_sequence,last_hash)
  VALUES (NEW.tenant_id,0,repeat('0',64))
  ON CONFLICT (tenant_id) DO NOTHING;

  SELECT * INTO chain_head
  FROM audit_chain_heads
  WHERE tenant_id=NEW.tenant_id
  FOR UPDATE;

  NEW.chain_sequence := chain_head.last_sequence + 1;
  NEW.previous_hash := chain_head.last_hash;
  payload := jsonb_build_object(
    'id', NEW.id,
    'tenantId', NEW.tenant_id,
    'actorUserId', NEW.actor_user_id,
    'action', NEW.action,
    'resourceType', NEW.resource_type,
    'resourceId', NEW.resource_id,
    'requestId', NEW.request_id,
    'correlationId', NEW.correlation_id,
    'ipAddress', NEW.ip_address::text,
    'userAgent', NEW.user_agent,
    'metadata', NEW.metadata,
    'createdAtEpoch', extract(epoch from NEW.created_at)::text
  )::text;
  NEW.entry_hash := encode(digest(NEW.previous_hash || payload, 'sha256'), 'hex');

  UPDATE audit_chain_heads
  SET last_sequence=NEW.chain_sequence,last_hash=NEW.entry_hash,updated_at=now()
  WHERE tenant_id=NEW.tenant_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION jaslyn_audit_chain_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit log entries are append-only and cannot be changed'
    USING ERRCODE='55000';
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_chain_insert_trg ON audit_logs;
CREATE TRIGGER audit_logs_chain_insert_trg
BEFORE INSERT ON audit_logs
FOR EACH ROW EXECUTE FUNCTION jaslyn_audit_chain_insert();

DROP TRIGGER IF EXISTS audit_logs_immutable_update_trg ON audit_logs;
CREATE TRIGGER audit_logs_immutable_update_trg
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION jaslyn_audit_chain_immutable();

CREATE TABLE IF NOT EXISTS security_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  audit_log_id uuid NOT NULL REFERENCES audit_logs(id) ON DELETE RESTRICT,
  severity text NOT NULL CHECK (severity IN ('WARNING','HIGH','CRITICAL')),
  category text NOT NULL,
  summary text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ACKNOWLEDGED','RESOLVED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  UNIQUE (tenant_id,audit_log_id)
);
CREATE INDEX IF NOT EXISTS security_alerts_tenant_status_idx
  ON security_alerts (tenant_id,status,severity,created_at DESC);

CREATE OR REPLACE FUNCTION jaslyn_audit_security_alert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  severity_value text;
  category_value text;
BEGIN
  IF NEW.action ~ '(REVOKE|ROTATE|DELETE|DISABLE|PERMISSION|ROLE|SECRET|CREDENTIAL|EXPORT|LOGIN_FAILED|POLICY_CHANGE|FIREWALL|REBOOT|BULK|ESCALATION|DISCREPANCY_ACCEPTED)' THEN
    severity_value := CASE
      WHEN NEW.action ~ '(DELETE|SECRET|CREDENTIAL|FIREWALL|BULK|ROLE|PERMISSION|ESCALATION|DISCREPANCY_ACCEPTED)' THEN 'HIGH'
      WHEN NEW.action ~ '(REVOKE|ROTATE|DISABLE|REBOOT)' THEN 'WARNING'
      ELSE 'WARNING'
    END;
    category_value := split_part(NEW.action,'_',1);
    INSERT INTO security_alerts(tenant_id,audit_log_id,severity,category,summary)
    VALUES (NEW.tenant_id,NEW.id,severity_value,category_value,
            left('High-risk action: ' || NEW.action || ' on ' || NEW.resource_type,500))
    ON CONFLICT (tenant_id,audit_log_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_security_alert_trg ON audit_logs;
CREATE TRIGGER audit_logs_security_alert_trg
AFTER INSERT ON audit_logs
FOR EACH ROW EXECUTE FUNCTION jaslyn_audit_security_alert();

COMMIT;
