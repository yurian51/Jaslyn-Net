-- JASLYN NET automation fabric: EVENT -> RULE -> POLICY -> ACTION -> RESULT -> AUDIT
--
-- Builds on the existing automation tables (074/075) and the transactional outbox
-- (communication_domain_events). Adds:
--   * rule policy columns (scope, cooldown, retries, timeout, concurrency, run-as, autonomy)
--   * automation_jobs / automation_job_attempts / automation_dead_letters
--   * automation_cooldowns / automation_worker_heartbeats
--   * AFTER triggers on the authoritative state tables that emit canonical events into the outbox
--
-- Hard invariants enforced by the database (not only by application code):
--   * automation_jobs.attempts <= max_attempts            (no unbounded retries)
--   * automation_jobs.max_attempts BETWEEN 1 AND 5
--   * automation_jobs.requeue_count <= 3                  (dead-letter requeue is bounded)
--   * one job per (tenant_id, idempotency_key)            (exactly-once enqueue)
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Rule policy columns (additive; existing rules keep working with safe defaults)
-- ---------------------------------------------------------------------------
ALTER TABLE automation_rules
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  ADD COLUMN IF NOT EXISTS scope jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(scope) = 'object'),
  ADD COLUMN IF NOT EXISTS cooldown_seconds integer NOT NULL DEFAULT 0 CHECK (cooldown_seconds BETWEEN 0 AND 604800),
  ADD COLUMN IF NOT EXISTS cooldown_scope text NOT NULL DEFAULT 'SUBJECT' CHECK (cooldown_scope IN ('RULE','SUBJECT')),
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS timeout_ms integer NOT NULL DEFAULT 15000 CHECK (timeout_ms BETWEEN 1000 AND 120000),
  ADD COLUMN IF NOT EXISTS max_concurrency integer NOT NULL DEFAULT 2 CHECK (max_concurrency BETWEEN 1 AND 10),
  ADD COLUMN IF NOT EXISTS run_as_user_id uuid,
  ADD COLUMN IF NOT EXISTS extra_permissions text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS autonomy text NOT NULL DEFAULT 'APPROVAL_REQUIRED' CHECK (autonomy IN ('APPROVAL_REQUIRED','AUTO')),
  ADD COLUMN IF NOT EXISTS definition_hash text,
  ADD COLUMN IF NOT EXISTS standing_approval_by uuid,
  ADD COLUMN IF NOT EXISTS standing_approval_at timestamptz,
  ADD COLUMN IF NOT EXISTS standing_approval_hash text;

UPDATE automation_rules SET run_as_user_id = created_by WHERE run_as_user_id IS NULL AND created_by IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'automation_rules_run_as_fk') THEN
    ALTER TABLE automation_rules ADD CONSTRAINT automation_rules_run_as_fk
      FOREIGN KEY (tenant_id, run_as_user_id) REFERENCES users(tenant_id, id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'automation_rules_standing_approval_fk') THEN
    ALTER TABLE automation_rules ADD CONSTRAINT automation_rules_standing_approval_fk
      FOREIGN KEY (tenant_id, standing_approval_by) REFERENCES users(tenant_id, id) ON DELETE RESTRICT;
  END IF;
END $$;

-- The rule evaluation trail gains the outcomes the new pipeline produces.
ALTER TABLE automation_rule_runs DROP CONSTRAINT IF EXISTS automation_rule_runs_status_check;
ALTER TABLE automation_rule_runs ADD CONSTRAINT automation_rule_runs_status_check
  CHECK (status IN ('NO_MATCH','MATCHED','SUCCEEDED','FAILED','OUT_OF_SCOPE','SUPPRESSED','DENIED','QUEUED'));
ALTER TABLE automation_rule_runs
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS job_count integer NOT NULL DEFAULT 0 CHECK (job_count >= 0);

-- Event fan-out receipts: bounded attempts, terminal DEAD state, bounded requeue.
ALTER TABLE automation_event_receipts DROP CONSTRAINT IF EXISTS automation_event_receipts_status_check;
ALTER TABLE automation_event_receipts ADD CONSTRAINT automation_event_receipts_status_check
  CHECK (status IN ('PENDING','PROCESSING','COMPLETED','FAILED','DEAD'));
ALTER TABLE automation_event_receipts
  ADD COLUMN IF NOT EXISTS requeue_count integer NOT NULL DEFAULT 0 CHECK (requeue_count BETWEEN 0 AND 3);
-- Receipts that exhausted the legacy 8-attempt ceiling were stranded forever; surface them as DEAD.
UPDATE automation_event_receipts SET status = 'DEAD', locked_at = NULL
 WHERE status IN ('FAILED','PROCESSING') AND attempts >= 5;

ALTER TABLE automation_alerts ADD COLUMN IF NOT EXISTS job_id uuid;

-- ---------------------------------------------------------------------------
-- 2. Jobs: one durable unit of work per (rule, event, action)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS automation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  rule_id uuid NOT NULL,
  rule_version integer NOT NULL CHECK (rule_version >= 1),
  event_id uuid NOT NULL REFERENCES communication_domain_events(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  action_index integer NOT NULL CHECK (action_index BETWEEN 0 AND 9),
  action_type text NOT NULL,
  action jsonb NOT NULL CHECK (jsonb_typeof(action) = 'object'),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  risk text NOT NULL CHECK (risk IN ('LOW','MEDIUM','DESTRUCTIVE')),
  subject_key text,
  concurrency_key text,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','WAITING_APPROVAL','RUNNING','SUCCEEDED','DENIED','CANCELLED','EXPIRED','DEAD')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL CHECK (max_attempts BETWEEN 1 AND 5),
  timeout_ms integer NOT NULL CHECK (timeout_ms BETWEEN 1000 AND 120000),
  requeue_count integer NOT NULL DEFAULT 0 CHECK (requeue_count BETWEEN 0 AND 3),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  lease_expires_at timestamptz,
  approval_expires_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  approval_note text,
  last_error text,
  last_error_code text,
  result jsonb,
  decision jsonb,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT automation_jobs_attempts_bounded CHECK (attempts <= max_attempts),
  CONSTRAINT automation_jobs_running_has_lease CHECK (status <> 'RUNNING' OR (lease_expires_at IS NOT NULL AND locked_by IS NOT NULL)),
  FOREIGN KEY (tenant_id, rule_id) REFERENCES automation_rules(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, approved_by) REFERENCES users(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS automation_jobs_claim_idx ON automation_jobs (next_attempt_at, created_at) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS automation_jobs_lease_idx ON automation_jobs (lease_expires_at) WHERE status = 'RUNNING';
CREATE INDEX IF NOT EXISTS automation_jobs_approval_idx ON automation_jobs (approval_expires_at) WHERE status = 'WAITING_APPROVAL';
CREATE INDEX IF NOT EXISTS automation_jobs_tenant_recent_idx ON automation_jobs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS automation_jobs_tenant_status_idx ON automation_jobs (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS automation_jobs_tenant_rule_idx ON automation_jobs (tenant_id, rule_id, created_at DESC);
CREATE INDEX IF NOT EXISTS automation_jobs_running_rule_idx ON automation_jobs (tenant_id, rule_id) WHERE status = 'RUNNING';
CREATE INDEX IF NOT EXISTS automation_jobs_running_key_idx ON automation_jobs (tenant_id, concurrency_key) WHERE status = 'RUNNING' AND concurrency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS automation_jobs_destructive_idx ON automation_jobs (tenant_id, started_at) WHERE risk = 'DESTRUCTIVE' AND started_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS automation_job_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  job_id uuid NOT NULL,
  cycle integer NOT NULL DEFAULT 0 CHECK (cycle >= 0),
  attempt integer NOT NULL CHECK (attempt >= 1),
  worker_id text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  outcome text CHECK (outcome IN ('SUCCEEDED','NOOP','FAILED','TIMEOUT','LEASE_EXPIRED','DENIED')),
  error_code text,
  error_message text,
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  UNIQUE (job_id, cycle, attempt),
  FOREIGN KEY (tenant_id, job_id) REFERENCES automation_jobs(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS automation_job_attempts_job_idx ON automation_job_attempts (tenant_id, job_id, cycle, attempt);

-- ---------------------------------------------------------------------------
-- 3. Dead letters: jobs/events that will not be retried automatically again
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS automation_dead_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('JOB','EVENT')),
  job_id uuid,
  event_id uuid,
  rule_id uuid,
  reason text NOT NULL CHECK (reason IN ('RETRIES_EXHAUSTED','NON_RETRYABLE','LEASE_EXPIRED_EXHAUSTED','FANOUT_EXHAUSTED')),
  error_code text,
  error_message text,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','REQUEUED','DISMISSED')),
  resolved_by uuid,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CONSTRAINT automation_dead_letters_target CHECK ((kind = 'JOB' AND job_id IS NOT NULL) OR (kind = 'EVENT' AND event_id IS NOT NULL)),
  FOREIGN KEY (tenant_id, resolved_by) REFERENCES users(tenant_id, id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS automation_dead_letters_open_job_uq ON automation_dead_letters (tenant_id, job_id) WHERE kind = 'JOB' AND status = 'OPEN';
CREATE UNIQUE INDEX IF NOT EXISTS automation_dead_letters_open_event_uq ON automation_dead_letters (tenant_id, event_id) WHERE kind = 'EVENT' AND status = 'OPEN';
CREATE INDEX IF NOT EXISTS automation_dead_letters_tenant_idx ON automation_dead_letters (tenant_id, status, created_at DESC);

-- ---------------------------------------------------------------------------
-- 4. Cooldowns and worker heartbeats
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS automation_cooldowns (
  tenant_id uuid NOT NULL,
  rule_id uuid NOT NULL,
  cooldown_key text NOT NULL,
  last_fired_at timestamptz NOT NULL DEFAULT now(),
  fire_count bigint NOT NULL DEFAULT 1,
  suppressed_count bigint NOT NULL DEFAULT 0,
  last_suppressed_at timestamptz,
  PRIMARY KEY (tenant_id, rule_id, cooldown_key),
  FOREIGN KEY (tenant_id, rule_id) REFERENCES automation_rules(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS automation_cooldowns_age_idx ON automation_cooldowns (last_fired_at);

CREATE TABLE IF NOT EXISTS automation_worker_heartbeats (
  worker_id text PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_tick_at timestamptz NOT NULL DEFAULT now(),
  last_tick_ms integer,
  last_error text,
  last_error_at timestamptz,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- ---------------------------------------------------------------------------
-- 5. Permissions
-- ---------------------------------------------------------------------------
INSERT INTO permission_catalog(permission_key, description) VALUES
 ('automation.operate', 'Cancel, retry and requeue automation jobs and dead letters'),
 ('automation.approve', 'Approve destructive automation jobs and grant standing rule approval')
ON CONFLICT (permission_key) DO UPDATE SET description = EXCLUDED.description;

-- ---------------------------------------------------------------------------
-- 6. Canonical event emission
--
-- Each canonical automation event is emitted by an AFTER trigger on the table that is the
-- authoritative record of the state change, in the same transaction as the change. This covers
-- every code path (current and future), cannot lose an event on crash, and needs no service
-- changes. Event keys are namespaced ('auto:') so they can never collide with the keys that
-- application code writes into the same outbox.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jaslyn_automation_emit(
  p_tenant uuid, p_key text, p_type text, p_aggregate_type text, p_aggregate uuid, p_payload jsonb
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO communication_domain_events (tenant_id, event_key, event_type, aggregate_type, aggregate_id, payload)
  VALUES (p_tenant, p_key, p_type, p_aggregate_type, p_aggregate, p_payload)
  ON CONFLICT (tenant_id, event_key) DO NOTHING;
END $$;

-- device.offline / device.recovered
CREATE OR REPLACE FUNCTION jaslyn_automation_router_status() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'OFFLINE' THEN
    PERFORM jaslyn_automation_emit(NEW.tenant_id, 'auto:device.offline:' || NEW.id || ':' || txid_current(),
      'DEVICE.OFFLINE', 'router', NEW.id,
      jsonb_build_object('routerId', NEW.id, 'locationId', NEW.location_id, 'name', NEW.name, 'vendor', NEW.vendor,
                         'previousStatus', OLD.status, 'status', NEW.status, 'source', 'ROUTERS'));
  ELSIF NEW.status = 'ONLINE' AND OLD.status IN ('OFFLINE','DEGRADED') THEN
    PERFORM jaslyn_automation_emit(NEW.tenant_id, 'auto:device.recovered:' || NEW.id || ':' || txid_current(),
      'DEVICE.RECOVERED', 'router', NEW.id,
      jsonb_build_object('routerId', NEW.id, 'locationId', NEW.location_id, 'name', NEW.name, 'vendor', NEW.vendor,
                         'previousStatus', OLD.status, 'status', NEW.status, 'source', 'ROUTERS'));
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS jaslyn_automation_router_status_trg ON routers;
CREATE TRIGGER jaslyn_automation_router_status_trg AFTER UPDATE OF status ON routers
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION jaslyn_automation_router_status();

-- subscriber.auth_failed: bounded to one event per (NAS, username, minute) so a credential-stuffing
-- storm cannot flood the outbox or the rule engine. The existence probe makes the hot path one index lookup.
CREATE OR REPLACE FUNCTION jaslyn_automation_radius_reject() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_key text; v_customer uuid;
BEGIN
  v_key := 'auto:subscriber.auth_failed:' || COALESCE(NEW.nas_client_id::text, '-') || ':' || lower(NEW.username)
           || ':' || floor(extract(epoch FROM NEW.created_at) / 60)::bigint;
  IF EXISTS (SELECT 1 FROM communication_domain_events WHERE tenant_id = NEW.tenant_id AND event_key = v_key) THEN
    RETURN NULL;
  END IF;
  SELECT b.customer_id INTO v_customer FROM customer_access_bindings b
   WHERE b.tenant_id = NEW.tenant_id AND b.username = NEW.username LIMIT 1;
  PERFORM jaslyn_automation_emit(NEW.tenant_id, v_key, 'SUBSCRIBER.AUTH_FAILED', 'radius_event', NEW.id,
    jsonb_build_object('username', NEW.username, 'customerId', v_customer, 'nasClientId', NEW.nas_client_id,
                       'source', 'RADIUS', 'windowSeconds', 60));
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS jaslyn_automation_radius_reject_trg ON radius_events;
CREATE TRIGGER jaslyn_automation_radius_reject_trg AFTER INSERT ON radius_events
  FOR EACH ROW WHEN (NEW.result = 'REJECT' AND NEW.tenant_id IS NOT NULL AND NEW.username IS NOT NULL)
  EXECUTE FUNCTION jaslyn_automation_radius_reject();

-- session.started (session.ended is derived from the existing SESSION.ENDED event: sessions.service is the
-- only writer of status='ENDED', so a second emitter would double-fire)
CREATE OR REPLACE FUNCTION jaslyn_automation_session_started() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM jaslyn_automation_emit(NEW.tenant_id, 'auto:session.started:' || NEW.id, 'SESSION.STARTED', 'session', NEW.id,
    jsonb_build_object('sessionId', NEW.id, 'customerId', NEW.customer_id, 'routerId', NEW.router_id,
                       'username', NEW.username, 'source', 'SESSIONS'));
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS jaslyn_automation_session_started_trg ON sessions;
CREATE TRIGGER jaslyn_automation_session_started_trg AFTER INSERT ON sessions
  FOR EACH ROW WHEN (NEW.status = 'ACTIVE')
  EXECUTE FUNCTION jaslyn_automation_session_started();

-- bandwidth.threshold: escalation of a router's fairness mode into FAIRNESS_ACTIVE or AGGRESSIVE, i.e. the
-- router's own configured activate/aggressive utilization thresholds were crossed.
CREATE OR REPLACE FUNCTION jaslyn_automation_bandwidth_threshold() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_prev text; v_prev_rank int; v_new_rank int; v_location uuid;
BEGIN
  SELECT e.mode INTO v_prev FROM traffic_enforcement_events e
   WHERE e.tenant_id = NEW.tenant_id AND e.router_id = NEW.router_id AND e.id <> NEW.id
   ORDER BY e.created_at DESC LIMIT 1;
  v_prev_rank := CASE COALESCE(v_prev, 'NORMAL') WHEN 'NORMAL' THEN 0 WHEN 'RECOVERING' THEN 1 WHEN 'FAIRNESS_ACTIVE' THEN 2 ELSE 3 END;
  v_new_rank  := CASE NEW.mode WHEN 'NORMAL' THEN 0 WHEN 'RECOVERING' THEN 1 WHEN 'FAIRNESS_ACTIVE' THEN 2 ELSE 3 END;
  IF NEW.mode IN ('FAIRNESS_ACTIVE','AGGRESSIVE') AND v_new_rank > v_prev_rank THEN
    SELECT r.location_id INTO v_location FROM routers r WHERE r.tenant_id = NEW.tenant_id AND r.id = NEW.router_id;
    PERFORM jaslyn_automation_emit(NEW.tenant_id, 'auto:bandwidth.threshold:' || NEW.id, 'BANDWIDTH.THRESHOLD',
      'router', NEW.router_id,
      jsonb_build_object('routerId', NEW.router_id, 'locationId', v_location, 'mode', NEW.mode,
                         'previousMode', COALESCE(v_prev, 'NORMAL'), 'direction', 'UP',
                         'commandCount', NEW.command_count, 'applied', NEW.applied, 'source', 'TRAFFIC_ORCHESTRATOR'));
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS jaslyn_automation_bandwidth_threshold_trg ON traffic_enforcement_events;
CREATE TRIGGER jaslyn_automation_bandwidth_threshold_trg AFTER INSERT ON traffic_enforcement_events
  FOR EACH ROW EXECUTE FUNCTION jaslyn_automation_bandwidth_threshold();

-- payment.completed / payment.failed (payments has an enforced state machine; these are its terminal outcomes)
CREATE OR REPLACE FUNCTION jaslyn_automation_payment_status() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_type text;
BEGIN
  v_type := CASE NEW.status WHEN 'PAID' THEN 'PAYMENT.COMPLETED' WHEN 'FAILED' THEN 'PAYMENT.FAILED' ELSE NULL END;
  IF v_type IS NOT NULL THEN
    PERFORM jaslyn_automation_emit(NEW.tenant_id, 'auto:' || lower(v_type) || ':' || NEW.id || ':' || txid_current(),
      v_type, 'payment', NEW.id,
      jsonb_build_object('paymentId', NEW.id, 'purchaseId', NEW.purchase_id, 'customerId', NEW.customer_id,
                         'provider', NEW.provider, 'amount', NEW.amount, 'currency', NEW.currency,
                         'previousStatus', OLD.status, 'status', NEW.status,
                         'verificationStatus', NEW.verification_status, 'source', 'PAYMENTS'));
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS jaslyn_automation_payment_status_trg ON payments;
CREATE TRIGGER jaslyn_automation_payment_status_trg AFTER UPDATE OF status ON payments
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('PAID','FAILED'))
  EXECUTE FUNCTION jaslyn_automation_payment_status();

-- entitlement.expired
CREATE OR REPLACE FUNCTION jaslyn_automation_entitlement_expired() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM jaslyn_automation_emit(NEW.tenant_id, 'auto:entitlement.expired:' || NEW.id || ':' || txid_current(),
    'ENTITLEMENT.EXPIRED', 'access_grant', NEW.id,
    jsonb_build_object('grantId', NEW.id, 'purchaseId', NEW.purchase_id, 'customerId', NEW.customer_id,
                       'routerId', NEW.router_id, 'endsAt', NEW.ends_at, 'previousStatus', OLD.status, 'source', 'ACCESS_GRANTS'));
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS jaslyn_automation_entitlement_expired_trg ON access_grants;
CREATE TRIGGER jaslyn_automation_entitlement_expired_trg AFTER UPDATE OF status ON access_grants
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'EXPIRED')
  EXECUTE FUNCTION jaslyn_automation_entitlement_expired();

-- incident.created / incident.resolved. Resolved uses raw type INCIDENT.STATUS_RESOLVED because the
-- application already emits a different INCIDENT.RESOLVED (router-recovery path only; manual resolves emit nothing).
CREATE OR REPLACE FUNCTION jaslyn_automation_incident_created() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM jaslyn_automation_emit(NEW.tenant_id, 'auto:incident.created:' || NEW.id, 'INCIDENT.CREATED', 'incident', NEW.id,
    jsonb_build_object('incidentId', NEW.id, 'severity', NEW.severity, 'category', NEW.category, 'title', NEW.title,
                       'rootResourceType', NEW.root_resource_type, 'rootResourceId', NEW.root_resource_id,
                       'routerId', CASE WHEN lower(COALESCE(NEW.root_resource_type, '')) = 'router' THEN NEW.root_resource_id ELSE NULL END,
                       'source', 'INCIDENTS'));
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS jaslyn_automation_incident_created_trg ON incidents;
CREATE TRIGGER jaslyn_automation_incident_created_trg AFTER INSERT ON incidents
  FOR EACH ROW EXECUTE FUNCTION jaslyn_automation_incident_created();

CREATE OR REPLACE FUNCTION jaslyn_automation_incident_resolved() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM jaslyn_automation_emit(NEW.tenant_id, 'auto:incident.resolved:' || NEW.id || ':' || txid_current(),
    'INCIDENT.STATUS_RESOLVED', 'incident', NEW.id,
    jsonb_build_object('incidentId', NEW.id, 'severity', NEW.severity, 'category', NEW.category, 'title', NEW.title,
                       'resolution', NEW.resolution, 'previousStatus', OLD.status,
                       'routerId', CASE WHEN lower(COALESCE(NEW.root_resource_type, '')) = 'router' THEN NEW.root_resource_id ELSE NULL END,
                       'source', 'INCIDENTS'));
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS jaslyn_automation_incident_resolved_trg ON incidents;
CREATE TRIGGER jaslyn_automation_incident_resolved_trg AFTER UPDATE OF status ON incidents
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'RESOLVED')
  EXECUTE FUNCTION jaslyn_automation_incident_resolved();

-- provider.degraded: an uplink provider (WAN connection) entered DEGRADED or UNAVAILABLE
CREATE OR REPLACE FUNCTION jaslyn_automation_provider_degraded() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_location uuid;
BEGIN
  SELECT r.location_id INTO v_location FROM routers r WHERE r.tenant_id = NEW.tenant_id AND r.id = NEW.router_id;
  PERFORM jaslyn_automation_emit(NEW.tenant_id, 'auto:provider.degraded:' || NEW.id || ':' || txid_current(),
    'PROVIDER.DEGRADED', 'wan_connection', NEW.id,
    jsonb_build_object('wanConnectionId', NEW.id, 'routerId', NEW.router_id, 'locationId', v_location,
                       'provider', NEW.provider, 'name', NEW.name, 'state', NEW.health_state,
                       'previousState', OLD.health_state, 'latencyMs', NEW.latency_ms,
                       'packetLossPercent', NEW.packet_loss_percent,
                       'utilizationPercent', NEW.observed_utilization_percent, 'source', 'WAN_HEALTH'));
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS jaslyn_automation_provider_degraded_trg ON wan_connections;
CREATE TRIGGER jaslyn_automation_provider_degraded_trg AFTER UPDATE OF health_state ON wan_connections
  FOR EACH ROW WHEN (OLD.health_state IS DISTINCT FROM NEW.health_state AND NEW.health_state IN ('DEGRADED','UNAVAILABLE'))
  EXECUTE FUNCTION jaslyn_automation_provider_degraded();

COMMIT;
