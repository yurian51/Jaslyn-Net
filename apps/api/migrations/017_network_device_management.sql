BEGIN;

ALTER TABLE routers
  ADD COLUMN IF NOT EXISTS management_protocol text NOT NULL DEFAULT 'MIKROTIK_REST',
  ADD COLUMN IF NOT EXISTS management_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS controller_endpoint text,
  ADD COLUMN IF NOT EXISTS capabilities jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE routers
SET management_protocol = CASE
  WHEN lower(coalesce(vendor, '')) LIKE '%mikrotik%' THEN 'MIKROTIK_REST'
  WHEN lower(coalesce(vendor, '')) LIKE '%ubiquiti%' OR lower(coalesce(vendor, '')) LIKE '%unifi%' THEN 'UNIFI_NETWORK_API'
  WHEN lower(coalesce(vendor, '')) LIKE '%openwrt%' OR lower(coalesce(model, '')) LIKE '%openwrt%' THEN 'OPENWRT_UBUS'
  WHEN lower(coalesce(vendor, '')) LIKE '%cambium%' THEN 'CAMBIUM_CNMAESTRO'
  ELSE 'GENERIC_HTTP'
END
WHERE management_protocol = 'MIKROTIK_REST';

ALTER TABLE routers
  DROP CONSTRAINT IF EXISTS routers_management_protocol_ck;
ALTER TABLE routers
  ADD CONSTRAINT routers_management_protocol_ck CHECK (
    management_protocol IN (
      'MIKROTIK_REST',
      'UNIFI_NETWORK_API',
      'OPENWRT_UBUS',
      'CAMBIUM_CNMAESTRO',
      'GENERIC_HTTP',
      'SNMP',
      'RADIUS_NAS'
    )
  );

CREATE INDEX IF NOT EXISTS routers_management_protocol_idx
  ON routers (tenant_id, management_protocol, management_enabled)
  WHERE management_enabled=true;

COMMIT;
