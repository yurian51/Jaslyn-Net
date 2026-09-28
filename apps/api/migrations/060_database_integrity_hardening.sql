BEGIN;

-- 060: database-level tenant isolation and integrity hardening.
-- Minimal/additive: preflight existing data, then replace only unsafe global FKs.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM users
    GROUP BY tenant_id, lower(email)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot tenant-scope users.email: duplicate email exists within a tenant';
  END IF;
END $$;

DROP INDEX IF EXISTS users_email_lower_uq;
CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_email_lower_uq
  ON users (tenant_id, lower(email));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM network_commands nc
    WHERE nc.router_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM routers r
        WHERE r.id = nc.router_id AND r.tenant_id = nc.tenant_id
      )
  ) THEN RAISE EXCEPTION 'Cannot harden network_commands.router_id: cross-tenant/orphan rows exist'; END IF;

  IF EXISTS (
    SELECT 1 FROM incident_impacts ii
    WHERE NOT EXISTS (
      SELECT 1 FROM incidents i
      WHERE i.id = ii.incident_id AND i.tenant_id = ii.tenant_id
    )
  ) THEN RAISE EXCEPTION 'Cannot harden incident_impacts.incident_id: cross-tenant/orphan rows exist'; END IF;

  IF EXISTS (
    SELECT 1 FROM vouchers v
    WHERE v.batch_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM voucher_batches b
        WHERE b.id = v.batch_id AND b.tenant_id = v.tenant_id
      )
  ) THEN RAISE EXCEPTION 'Cannot harden vouchers.batch_id: cross-tenant/orphan rows exist'; END IF;

  IF EXISTS (
    SELECT 1 FROM ipam_addresses a
    WHERE (a.customer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM customers c WHERE c.id=a.customer_id AND c.tenant_id=a.tenant_id))
       OR (a.router_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM routers r WHERE r.id=a.router_id AND r.tenant_id=a.tenant_id))
       OR (a.session_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.id=a.session_id AND s.tenant_id=a.tenant_id))
  ) THEN RAISE EXCEPTION 'Cannot harden ipam_addresses relations: cross-tenant/orphan rows exist'; END IF;

  IF EXISTS (
    SELECT 1 FROM radius_accounting_events e
    WHERE e.nas_client_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM radius_nas_clients n WHERE n.id=e.nas_client_id AND n.tenant_id=e.tenant_id)
  ) THEN RAISE EXCEPTION 'Cannot harden radius_accounting_events.nas_client_id: cross-tenant/orphan rows exist'; END IF;

  IF EXISTS (
    SELECT 1 FROM radius_events e
    WHERE e.nas_client_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM radius_nas_clients n WHERE n.id=e.nas_client_id AND n.tenant_id=e.tenant_id)
  ) THEN RAISE EXCEPTION 'Cannot harden radius_events.nas_client_id: cross-tenant/orphan rows exist'; END IF;

  IF EXISTS (
    SELECT 1 FROM ai_runs r
    WHERE (r.actor_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id=r.actor_user_id AND u.tenant_id=r.tenant_id))
       OR (r.parent_run_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ai_runs p WHERE p.id=r.parent_run_id AND p.tenant_id=r.tenant_id))
  ) THEN RAISE EXCEPTION 'Cannot harden ai_runs relations: cross-tenant/orphan rows exist'; END IF;

  IF EXISTS (
    SELECT 1 FROM ai_actions a
    WHERE NOT EXISTS (SELECT 1 FROM ai_runs r WHERE r.id=a.run_id AND r.tenant_id=a.tenant_id)
       OR (a.approved_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id=a.approved_by AND u.tenant_id=a.tenant_id))
  ) THEN RAISE EXCEPTION 'Cannot harden ai_actions relations: cross-tenant/orphan rows exist'; END IF;
END $$;

DROP CONSTRAINT IF EXISTS network_commands_router_id_fkey;
ALTER TABLE network_commands
  ADD CONSTRAINT network_commands_router_tenant_fk
  FOREIGN KEY (tenant_id, router_id) REFERENCES routers(tenant_id, id) ON DELETE SET NULL;

DROP CONSTRAINT IF EXISTS incident_impacts_incident_id_fkey;
ALTER TABLE incident_impacts
  ADD CONSTRAINT incident_impacts_incident_tenant_fk
  FOREIGN KEY (tenant_id, incident_id) REFERENCES incidents(tenant_id, id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS voucher_batches_tenant_id_uq
  ON voucher_batches (tenant_id, id);
DROP CONSTRAINT IF EXISTS vouchers_batch_fk;
ALTER TABLE vouchers
  ADD CONSTRAINT vouchers_batch_tenant_fk
  FOREIGN KEY (tenant_id, batch_id) REFERENCES voucher_batches(tenant_id, id) ON DELETE SET NULL;

ALTER TABLE ipam_addresses
  ADD CONSTRAINT ipam_addresses_customer_tenant_fk
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id) ON DELETE SET NULL,
  ADD CONSTRAINT ipam_addresses_router_tenant_fk
  FOREIGN KEY (tenant_id, router_id) REFERENCES routers(tenant_id, id) ON DELETE SET NULL,
  ADD CONSTRAINT ipam_addresses_session_tenant_fk
  FOREIGN KEY (tenant_id, session_id) REFERENCES sessions(tenant_id, id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ipam_addresses_router_idx
  ON ipam_addresses (tenant_id, router_id, status)
  WHERE router_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ipam_addresses_session_idx
  ON ipam_addresses (tenant_id, session_id, status)
  WHERE session_id IS NOT NULL;

DROP CONSTRAINT IF EXISTS radius_accounting_events_nas_client_id_fkey;
ALTER TABLE radius_accounting_events
  ADD CONSTRAINT radius_accounting_events_nas_tenant_fk
  FOREIGN KEY (tenant_id, nas_client_id) REFERENCES radius_nas_clients(tenant_id, id) ON DELETE SET NULL;

DROP CONSTRAINT IF EXISTS radius_events_nas_client_id_fkey;
ALTER TABLE radius_events
  ADD CONSTRAINT radius_events_nas_tenant_fk
  FOREIGN KEY (tenant_id, nas_client_id) REFERENCES radius_nas_clients(tenant_id, id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS radius_accounting_nas_idx
  ON radius_accounting_events (tenant_id, nas_client_id, received_at DESC)
  WHERE nas_client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS radius_events_nas_idx
  ON radius_events (tenant_id, nas_client_id, created_at DESC)
  WHERE nas_client_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ai_runs_tenant_id_uq
  ON ai_runs (tenant_id, id);

DROP CONSTRAINT IF EXISTS ai_runs_actor_user_id_fkey;
ALTER TABLE ai_runs
  ADD CONSTRAINT ai_runs_actor_tenant_fk
  FOREIGN KEY (tenant_id, actor_user_id) REFERENCES users(tenant_id, id) ON DELETE SET NULL;

DROP CONSTRAINT IF EXISTS ai_runs_parent_run_id_fkey;
ALTER TABLE ai_runs
  ADD CONSTRAINT ai_runs_parent_tenant_fk
  FOREIGN KEY (tenant_id, parent_run_id) REFERENCES ai_runs(tenant_id, id) ON DELETE SET NULL;

DROP CONSTRAINT IF EXISTS ai_actions_run_id_fkey;
ALTER TABLE ai_actions
  ADD CONSTRAINT ai_actions_run_tenant_fk
  FOREIGN KEY (tenant_id, run_id) REFERENCES ai_runs(tenant_id, id) ON DELETE CASCADE;

DROP CONSTRAINT IF EXISTS ai_actions_approved_by_fkey;
ALTER TABLE ai_actions
  ADD CONSTRAINT ai_actions_approved_tenant_fk
  FOREIGN KEY (tenant_id, approved_by) REFERENCES users(tenant_id, id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ai_runs_tenant_parent_idx
  ON ai_runs (tenant_id, parent_run_id)
  WHERE parent_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_runs_tenant_actor_idx
  ON ai_runs (tenant_id, actor_user_id)
  WHERE actor_user_id IS NOT NULL;

COMMIT;
