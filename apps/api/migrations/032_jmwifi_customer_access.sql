BEGIN;

CREATE TABLE IF NOT EXISTS customer_access_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  router_id uuid,
  package_id uuid,
  username text NOT NULL,
  access_type text NOT NULL CHECK (access_type IN ('PPPOE','HOTSPOT','RADIUS','STATIC','OTHER')),
  state text NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING','ACTIVE','SUSPENDED','DISABLED','EXPIRED')),
  external_reference text,
  activated_at timestamptz,
  suspended_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, username),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, router_id) REFERENCES routers(tenant_id, id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id, package_id) REFERENCES packages(tenant_id, id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS customer_access_bindings_customer_idx
  ON customer_access_bindings (tenant_id, customer_id, state);
CREATE INDEX IF NOT EXISTS customer_access_bindings_router_idx
  ON customer_access_bindings (tenant_id, router_id, state);
CREATE INDEX IF NOT EXISTS customer_access_bindings_expiry_idx
  ON customer_access_bindings (tenant_id, state, expires_at);

CREATE TABLE IF NOT EXISTS access_state_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  access_binding_id uuid NOT NULL,
  previous_state text,
  new_state text NOT NULL,
  reason text NOT NULL,
  source text NOT NULL,
  payment_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, access_binding_id) REFERENCES customer_access_bindings(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, payment_id) REFERENCES payments(tenant_id, id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS access_state_events_binding_idx
  ON access_state_events (tenant_id, access_binding_id, created_at DESC);

COMMIT;
