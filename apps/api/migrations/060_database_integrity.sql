BEGIN;

-- Database-level tenant-scope hardening. Existing rows are never rewritten.
-- Preflight fails closed if current data would violate the stronger relationships.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM network_commands c
    LEFT JOIN routers r ON r.id=c.router_id
    WHERE c.router_id IS NOT NULL AND (r.id IS NULL OR r.tenant_id<>c.tenant_id)
  ) THEN RAISE EXCEPTION 'Cannot harden network_commands.router_id tenant scope';
  END IF;
  IF EXISTS (
    SELECT 1 FROM incident_impacts i
    LEFT JOIN incidents x ON x.id=i.incident_id
    WHERE x.id IS NULL OR x.tenant_id<>i.tenant_id
  ) THEN RAISE EXCEPTION 'Cannot harden incident_impacts.incident_id tenant scope';
  END IF;
  IF EXISTS (
    SELECT 1 FROM vouchers v
    LEFT JOIN voucher_batches b ON b.id=v.batch_id
    WHERE v.batch_id IS NOT NULL AND (b.id IS NULL OR b.tenant_id<>v.tenant_id)
  ) THEN RAISE EXCEPTION 'Cannot harden vouchers.batch_id tenant scope';
  END IF;
  IF EXISTS (
    SELECT 1 FROM radius_accounting_events e
    LEFT JOIN radius_nas_clients n ON n.id=e.nas_client_id
    WHERE e.nas_client_id IS NOT NULL AND (n.id IS NULL OR n.tenant_id<>e.tenant_id)
  ) THEN RAISE EXCEPTION 'Cannot harden radius_accounting_events.nas_client_id tenant scope';
  END IF;
  IF EXISTS (
    SELECT 1 FROM radius_events e
    LEFT JOIN radius_nas_clients n ON n.id=e.nas_client_id
    WHERE e.nas_client_id IS NOT NULL AND (n.id IS NULL OR n.tenant_id<>e.tenant_id)
  ) THEN RAISE EXCEPTION 'Cannot harden radius_events.nas_client_id tenant scope';
  END IF;
  IF EXISTS (
    SELECT 1 FROM ipam_addresses a
    LEFT JOIN customers c ON c.id=a.customer_id
    WHERE a.customer_id IS NOT NULL AND (c.id IS NULL OR c.tenant_id<>a.tenant_id)
  ) THEN RAISE EXCEPTION 'Cannot harden ipam_addresses.customer_id tenant scope';
  END IF;
  IF EXISTS (
    SELECT 1 FROM ipam_addresses a
    LEFT JOIN routers r ON r.id=a.router_id
    WHERE a.router_id IS NOT NULL AND (r.id IS NULL OR r.tenant_id<>a.tenant_id)
  ) THEN RAISE EXCEPTION 'Cannot harden ipam_addresses.router_id tenant scope';
  END IF;
  IF EXISTS (
    SELECT 1 FROM ipam_addresses a
    LEFT JOIN sessions s ON s.id=a.session_id
    WHERE a.session_id IS NOT NULL AND (s.id IS NULL OR s.tenant_id<>a.tenant_id)
  ) THEN RAISE EXCEPTION 'Cannot harden ipam_addresses.session_id tenant scope';
  END IF;
END $$;

-- Replace weak global FKs with tenant-scoped composite FKs.
ALTER TABLE network_commands DROP CONSTRAINT IF EXISTS network_commands_router_id_fkey;
ALTER TABLE incident_impacts DROP CONSTRAINT IF EXISTS incident_impacts_incident_id_fkey;
ALTER TABLE vouchers DROP CONSTRAINT IF EXISTS vouchers_batch_fk;
ALTER TABLE radius_accounting_events DROP CONSTRAINT IF EXISTS radius_accounting_events_nas_client_id_fkey;
ALTER TABLE radius_events DROP CONSTRAINT IF EXISTS radius_events_nas_client_id_fkey;

ALTER TABLE ipam_addresses
  DROP CONSTRAINT IF EXISTS ipam_addresses_customer_id_fkey,
  DROP CONSTRAINT IF EXISTS ipam_addresses_router_id_fkey,
  DROP CONSTRAINT IF EXISTS ipam_addresses_session_id_fkey;

CREATE UNIQUE INDEX IF NOT EXISTS voucher_batches_tenant_id_uq
  ON voucher_batches (tenant_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS ai_runs_tenant_id_uq
  ON ai_runs (tenant_id,id);

ALTER TABLE network_commands
  ADD CONSTRAINT network_commands_tenant_router_fk
  FOREIGN KEY (tenant_id,router_id) REFERENCES routers(tenant_id,id) ON DELETE SET NULL;

ALTER TABLE incident_impacts
  ADD CONSTRAINT incident_impacts_tenant_incident_fk
  FOREIGN KEY (tenant_id,incident_id) REFERENCES incidents(tenant_id,id) ON DELETE CASCADE;

ALTER TABLE vouchers
  ADD CONSTRAINT vouchers_tenant_batch_fk
  FOREIGN KEY (tenant_id,batch_id) REFERENCES voucher_batches(tenant_id,id) ON DELETE SET NULL;

ALTER TABLE ipam_addresses
  ADD CONSTRAINT ipam_addresses_tenant_customer_fk
  FOREIGN KEY (tenant_id,customer_id) REFERENCES customers(tenant_id,id) ON DELETE SET NULL,
  ADD CONSTRAINT ipam_addresses_tenant_router_fk
  FOREIGN KEY (tenant_id,router_id) REFERENCES routers(tenant_id,id) ON DELETE SET NULL,
  ADD CONSTRAINT ipam_addresses_tenant_session_fk
  FOREIGN KEY (tenant_id,session_id) REFERENCES sessions(tenant_id,id) ON DELETE SET NULL;

ALTER TABLE radius_accounting_events
  ADD CONSTRAINT radius_accounting_tenant_nas_fk
  FOREIGN KEY (tenant_id,nas_client_id) REFERENCES radius_nas_clients(tenant_id,id) ON DELETE SET NULL;

ALTER TABLE radius_events
  ADD CONSTRAINT radius_events_tenant_nas_fk
  FOREIGN KEY (tenant_id,nas_client_id) REFERENCES radius_nas_clients(tenant_id,id) ON DELETE SET NULL;

-- Query-path indexes for the hardened relations and reconciliation checks.
CREATE INDEX IF NOT EXISTS ipam_addresses_router_idx
  ON ipam_addresses (tenant_id,router_id,status)
  WHERE router_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ipam_addresses_session_idx
  ON ipam_addresses (tenant_id,session_id,status)
  WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS radius_accounting_nas_idx
  ON radius_accounting_events (tenant_id,nas_client_id,received_at DESC)
  WHERE nas_client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS radius_events_nas_idx
  ON radius_events (tenant_id,nas_client_id,created_at DESC)
  WHERE nas_client_id IS NOT NULL;

-- Prevent concurrent duplicate invoice issuance for the same purchase.
CREATE UNIQUE INDEX IF NOT EXISTS invoices_purchase_uq
  ON invoices (tenant_id,purchase_id)
  WHERE purchase_id IS NOT NULL;

-- Ensure audit actor references cannot cross tenants at the database layer.
-- audit_logs already has this composite FK; add its supporting index for trace/list.
CREATE INDEX IF NOT EXISTS audit_logs_tenant_correlation_idx
  ON audit_logs (tenant_id,correlation_id,created_at DESC)
  WHERE correlation_id IS NOT NULL;

COMMIT;
