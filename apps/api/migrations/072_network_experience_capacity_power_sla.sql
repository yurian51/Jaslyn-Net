BEGIN;

CREATE TABLE IF NOT EXISTS network_telemetry_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  resource_type text NOT NULL CHECK (resource_type IN ('ROUTER','INTERFACE','ACCESS_POINT','LINK','SITE')),
  resource_id uuid NOT NULL,
  metric_type text NOT NULL CHECK (metric_type IN ('RX_BPS','TX_BPS','LATENCY_MS','JITTER_MS','PACKET_LOSS_PCT','UTILIZATION_PCT','CLIENT_COUNT','CHANNEL_UTILIZATION_PCT','AIRTIME_PCT','RSSI_DBM')),
  metric_value numeric(24,6) NOT NULL,
  unit text NOT NULL,
  source text NOT NULL,
  sampled_at timestamptz NOT NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS network_telemetry_resource_metric_time_idx ON network_telemetry_samples(tenant_id,resource_type,resource_id,metric_type,sampled_at DESC);
CREATE INDEX IF NOT EXISTS network_telemetry_retention_idx ON network_telemetry_samples(sampled_at);

CREATE TABLE IF NOT EXISTS wifi_client_experience_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  router_id uuid NOT NULL,
  client_key_hash char(64) NOT NULL,
  ssid text,
  band text CHECK (band IS NULL OR band IN ('2.4GHz','5GHz','6GHz','UNKNOWN')),
  channel integer CHECK (channel IS NULL OR channel BETWEEN 1 AND 1000),
  rssi_dbm numeric(7,2),
  noise_dbm numeric(7,2),
  airtime_pct numeric(7,3) CHECK (airtime_pct IS NULL OR airtime_pct BETWEEN 0 AND 100),
  channel_utilization_pct numeric(7,3) CHECK (channel_utilization_pct IS NULL OR channel_utilization_pct BETWEEN 0 AND 100),
  tx_rate_bps bigint CHECK (tx_rate_bps IS NULL OR tx_rate_bps >= 0),
  rx_rate_bps bigint CHECK (rx_rate_bps IS NULL OR rx_rate_bps >= 0),
  roaming_count integer NOT NULL DEFAULT 0 CHECK (roaming_count >= 0),
  sampled_at timestamptz NOT NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS wifi_client_experience_tenant_time_idx ON wifi_client_experience_samples(tenant_id,sampled_at DESC);
CREATE INDEX IF NOT EXISTS wifi_client_experience_router_time_idx ON wifi_client_experience_samples(tenant_id,router_id,sampled_at DESC);

CREATE TABLE IF NOT EXISTS power_environment_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  site_id uuid,
  asset_id uuid,
  metric_type text NOT NULL CHECK (metric_type IN ('UPS_BATTERY_PCT','UPS_LOAD_PCT','TEMPERATURE_C','HUMIDITY_PCT','GENERATOR_STATUS','MAINS_VOLTAGE_V','POWER_DRAW_W')),
  metric_value numeric(24,6) NOT NULL,
  unit text NOT NULL,
  source text NOT NULL,
  sampled_at timestamptz NOT NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS power_environment_tenant_time_idx ON power_environment_samples(tenant_id,sampled_at DESC);
CREATE INDEX IF NOT EXISTS power_environment_site_metric_idx ON power_environment_samples(tenant_id,site_id,metric_type,sampled_at DESC);

CREATE TABLE IF NOT EXISTS device_lifecycle_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  resource_type text NOT NULL CHECK (resource_type IN ('ROUTER','SWITCH','ACCESS_POINT','FIREWALL','UPS','SERVER','OTHER')),
  resource_id uuid NOT NULL,
  vendor text NOT NULL,
  model text NOT NULL,
  serial_number text,
  firmware_version text,
  purchased_at date,
  warranty_expires_at date,
  end_of_sale_at date,
  end_of_support_at date,
  vulnerability_status text NOT NULL DEFAULT 'UNKNOWN' CHECK (vulnerability_status IN ('UNKNOWN','CURRENT','PATCH_REQUIRED','CRITICAL','NOT_APPLICABLE')),
  notes text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,resource_type,resource_id),
  FOREIGN KEY(tenant_id,updated_by) REFERENCES users(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS device_lifecycle_support_idx ON device_lifecycle_records(tenant_id,end_of_support_at,vulnerability_status);

CREATE TABLE IF NOT EXISTS service_sla_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  name text NOT NULL,
  service_code text,
  target_uptime_pct numeric(6,3) NOT NULL CHECK (target_uptime_pct>0 AND target_uptime_pct<=100),
  response_minutes integer NOT NULL CHECK (response_minutes>0),
  resolution_minutes integer NOT NULL CHECK (resolution_minutes>=response_minutes),
  service_credit_pct numeric(6,3) NOT NULL DEFAULT 0 CHECK (service_credit_pct>=0 AND service_credit_pct<=100),
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,name),
  FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS service_sla_active_idx ON service_sla_policies(tenant_id,active,name);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['network_telemetry_samples','wifi_client_experience_samples','power_environment_samples','device_lifecycle_records','service_sla_policies'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS jaslyn_financial_audit ON %I',t);
    EXECUTE format('CREATE TRIGGER jaslyn_financial_audit AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION jaslyn_financial_audit_trigger()',t);
  END LOOP;
END $$;

INSERT INTO permission_catalog(permission_key,description) VALUES
 ('network.experience.read','Read Wi-Fi client experience and network telemetry'),
 ('network.experience.ingest','Ingest tenant-scoped network telemetry observations'),
 ('network.capacity.read','Read deterministic network capacity estimates'),
 ('device.lifecycle.read','Read device lifecycle and end-of-support records'),
 ('device.lifecycle.manage','Create or update device lifecycle records'),
 ('power.read','Read power and environmental telemetry'),
 ('power.ingest','Ingest power and environmental observations'),
 ('sla.read','Read tenant service-level policies'),
 ('sla.manage','Manage tenant service-level policies')
ON CONFLICT(permission_key) DO UPDATE SET description=EXCLUDED.description;

COMMIT;
