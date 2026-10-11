BEGIN;

ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS owner_user_id uuid,
  ADD COLUMN IF NOT EXISTS sla_target_minutes integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS escalation_level smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_escalated_at timestamptz,
  ADD COLUMN IF NOT EXISTS public_visible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_summary text;
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_sla_target_minutes_check;
ALTER TABLE incidents ADD CONSTRAINT incidents_sla_target_minutes_check CHECK (sla_target_minutes BETWEEN 1 AND 10080);
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_owner_user_fk;
ALTER TABLE incidents ADD CONSTRAINT incidents_owner_user_fk
  FOREIGN KEY (tenant_id,owner_user_id) REFERENCES users(tenant_id,id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS incidents_tenant_owner_idx
  ON incidents (tenant_id,owner_user_id,status);
CREATE INDEX IF NOT EXISTS incidents_public_active_idx
  ON incidents (tenant_id,status,started_at DESC) WHERE public_visible=true;

CREATE TABLE IF NOT EXISTS incident_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  incident_id uuid NOT NULL,
  actor_user_id uuid,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  note text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,incident_id) REFERENCES incidents(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,actor_user_id) REFERENCES users(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS incident_events_timeline_idx
  ON incident_events (tenant_id,incident_id,created_at,id);

CREATE OR REPLACE FUNCTION jaslyn_incident_timeline()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    INSERT INTO incident_events(tenant_id,incident_id,event_type,to_status,note,metadata)
    VALUES (NEW.tenant_id,NEW.id,'INCIDENT_OPENED',NEW.status,NEW.summary,
      jsonb_build_object('severity',NEW.severity,'category',NEW.category,'rootResourceType',NEW.root_resource_type,'rootResourceId',NEW.root_resource_id));
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO incident_events(tenant_id,incident_id,event_type,from_status,to_status,note,metadata)
    VALUES (NEW.tenant_id,NEW.id,CASE WHEN NEW.status='RESOLVED' THEN 'INCIDENT_RESOLVED' WHEN NEW.status='ACKNOWLEDGED' THEN 'INCIDENT_ACKNOWLEDGED' ELSE 'STATUS_CHANGED' END,OLD.status,NEW.status,NEW.resolution,jsonb_build_object('severity',NEW.severity));
  END IF;
  IF NEW.severity IS DISTINCT FROM OLD.severity THEN
    INSERT INTO incident_events(tenant_id,incident_id,event_type,note,metadata)
    VALUES (NEW.tenant_id,NEW.id,'SEVERITY_CHANGED','Incident severity changed',jsonb_build_object('from',OLD.severity,'to',NEW.severity));
  END IF;
  IF NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id THEN
    INSERT INTO incident_events(tenant_id,incident_id,event_type,note,metadata)
    VALUES (NEW.tenant_id,NEW.id,'OWNER_CHANGED','Incident owner changed',jsonb_build_object('fromUserId',OLD.owner_user_id,'toUserId',NEW.owner_user_id));
  END IF;
  IF NEW.public_visible IS DISTINCT FROM OLD.public_visible THEN
    INSERT INTO incident_events(tenant_id,incident_id,event_type,note,metadata)
    VALUES (NEW.tenant_id,NEW.id,'PUBLIC_VISIBILITY_CHANGED','Public status visibility changed',jsonb_build_object('publicVisible',NEW.public_visible));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS incidents_timeline_insert_trg ON incidents;
CREATE TRIGGER incidents_timeline_insert_trg
AFTER INSERT ON incidents
FOR EACH ROW EXECUTE FUNCTION jaslyn_incident_timeline();
DROP TRIGGER IF EXISTS incidents_timeline_update_trg ON incidents;
CREATE TRIGGER incidents_timeline_update_trg
AFTER UPDATE OF status,severity,owner_user_id,public_visible ON incidents
FOR EACH ROW EXECUTE FUNCTION jaslyn_incident_timeline();

CREATE OR REPLACE FUNCTION jaslyn_incident_events_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'incident timeline events are append-only'
    USING ERRCODE='55000';
END;
$$;
DROP TRIGGER IF EXISTS incident_events_immutable_trg ON incident_events;
CREATE TRIGGER incident_events_immutable_trg
BEFORE UPDATE OR DELETE ON incident_events
FOR EACH ROW EXECUTE FUNCTION jaslyn_incident_events_immutable();

CREATE TABLE IF NOT EXISTS maintenance_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (length(title) BETWEEN 3 AND 180),
  description text,
  scope_type text NOT NULL DEFAULT 'TENANT' CHECK (scope_type IN ('TENANT','SITE','ROUTER')),
  scope_id uuid,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','ACTIVE','COMPLETED','CANCELED')),
  is_public boolean NOT NULL DEFAULT false,
  public_summary text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at>starts_at),
  CHECK ((scope_type='TENANT' AND scope_id IS NULL) OR (scope_type<>'TENANT' AND scope_id IS NOT NULL)),
  FOREIGN KEY (tenant_id,created_by) REFERENCES users(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS maintenance_windows_active_idx
  ON maintenance_windows (tenant_id,status,starts_at,ends_at);
CREATE INDEX IF NOT EXISTS maintenance_windows_scope_idx
  ON maintenance_windows (tenant_id,scope_type,scope_id,starts_at,ends_at);

CREATE TABLE IF NOT EXISTS status_page_settings (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE RESTRICT,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{2,62}$'),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 2 AND 120),
  description text,
  is_published boolean NOT NULL DEFAULT false,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,updated_by) REFERENCES users(tenant_id,id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS status_page_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  component_key text NOT NULL CHECK (length(component_key) BETWEEN 2 AND 80),
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  status text NOT NULL DEFAULT 'OPERATIONAL' CHECK (status IN ('OPERATIONAL','DEGRADED','PARTIAL_OUTAGE','MAJOR_OUTAGE','MAINTENANCE')),
  public_summary text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,component_key),
  FOREIGN KEY (tenant_id,updated_by) REFERENCES users(tenant_id,id) ON DELETE RESTRICT
);

COMMIT;
