BEGIN;

CREATE TABLE IF NOT EXISTS fiber_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid,
  location_id uuid,
  router_id uuid,
  name text NOT NULL,
  technology text NOT NULL DEFAULT 'FIBER',
  service_status text NOT NULL DEFAULT 'PLANNED' CHECK (service_status IN ('PLANNED','ACTIVE','SUSPENDED','FAULT','DISCONNECTED')),
  upstream_bps bigint,
  downstream_bps bigint,
  installation_address text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations(tenant_id, id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id, router_id) REFERENCES routers(tenant_id, id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS fiber_lines_customer_idx ON fiber_lines (tenant_id, customer_id, service_status);
CREATE INDEX IF NOT EXISTS fiber_lines_location_idx ON fiber_lines (tenant_id, location_id, service_status);

CREATE TABLE IF NOT EXISTS network_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id uuid,
  name text NOT NULL,
  site_type text NOT NULL DEFAULT 'POP' CHECK (site_type IN ('POP','OLT','NAP','TOWER','HOTSPOT','OFFICE','WAREHOUSE','OTHER')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DEGRADED','OFFLINE','MAINTENANCE')),
  parent_site_id uuid,
  latitude numeric(10,7),
  longitude numeric(10,7),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, name),
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations(tenant_id, id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id, parent_site_id) REFERENCES network_sites(tenant_id, id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS network_sites_status_idx ON network_sites (tenant_id, status, site_type);

CREATE TABLE IF NOT EXISTS network_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid,
  site_id uuid,
  assigned_user_id uuid,
  job_type text NOT NULL CHECK (job_type IN ('INSTALLATION','REPAIR','MAINTENANCE','ACTIVATION','DISCONNECTION','INSPECTION','OTHER')),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ASSIGNED','IN_PROGRESS','BLOCKED','COMPLETED','CANCELED')),
  priority text NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH','CRITICAL')),
  title text NOT NULL,
  description text,
  scheduled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id, site_id) REFERENCES network_sites(tenant_id, id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id, assigned_user_id) REFERENCES users(tenant_id, id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS network_jobs_queue_idx ON network_jobs (tenant_id, status, priority, scheduled_at);
CREATE INDEX IF NOT EXISTS network_jobs_customer_idx ON network_jobs (tenant_id, customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS network_job_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_id uuid NOT NULL,
  actor_user_id uuid,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, job_id) REFERENCES network_jobs(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, actor_user_id) REFERENCES users(tenant_id, id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS network_job_events_job_idx ON network_job_events (tenant_id, job_id, created_at DESC);

CREATE TABLE IF NOT EXISTS customer_service_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('PENDING','ACTIVE','GRACE','SUSPENDED','BLOCKED','DISCONNECTED','FAULT')),
  reason text,
  source text NOT NULL DEFAULT 'SYSTEM',
  effective_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, customer_id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS customer_service_state_active_idx ON customer_service_state (tenant_id, state, effective_at DESC);

COMMIT;
