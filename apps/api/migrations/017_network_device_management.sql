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
  WHEN lower(coalesce(vendor, '')) LIKE '%tp-link%' OR lower(coalesce(vendor, '')) LIKE '%omada%' THEN 'OMADA_CONTROLLER_API'
  WHEN lower(coalesce(vendor, '')) LIKE '%cambium%' THEN 'CAMBIUM_CNMAESTRO'
  WHEN lower(coalesce(vendor, '')) LIKE '%meraki%' OR lower(coalesce(vendor, '')) LIKE '%cisco meraki%' THEN 'MERAKI_DASHBOARD_API'
  WHEN lower(coalesce(vendor, '')) LIKE '%aruba%' THEN 'ARUBA_CENTRAL_API'
  WHEN lower(coalesce(vendor, '')) LIKE '%grandstream%' THEN 'GRANDSTREAM_GWN_API'
  WHEN lower(coalesce(vendor, '')) LIKE '%ruijie%' OR lower(coalesce(vendor, '')) LIKE '%reyee%' THEN 'RUIJIE_REYEE_CLOUD_API'
  WHEN lower(coalesce(vendor, '')) LIKE '%ruckus%' THEN 'RUCKUS_SMARTZONE_API'
  WHEN lower(coalesce(vendor, '')) LIKE '%openwrt%' OR lower(coalesce(model, '')) LIKE '%openwrt%' THEN 'OPENWRT_UBUS'
  WHEN lower(coalesce(vendor, '')) LIKE '%teltonika%' THEN 'TELTONIKA_RMS_API'
  WHEN lower(coalesce(vendor, '')) LIKE '%peplink%' OR lower(coalesce(vendor, '')) LIKE '%pepwave%' THEN 'PEPLINK_INCONTROL_API'
  WHEN lower(coalesce(vendor, '')) LIKE '%pfsense%' OR lower(coalesce(vendor, '')) LIKE '%opnsense%' THEN 'PFSENSE_API'
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
      'OMADA_CONTROLLER_API',
      'CAMBIUM_CNMAESTRO',
      'MERAKI_DASHBOARD_API',
      'ARUBA_CENTRAL_API',
      'GRANDSTREAM_GWN_API',
      'RUIJIE_REYEE_CLOUD_API',
      'RUCKUS_SMARTZONE_API',
      'OPENWRT_UBUS',
      'TELTONIKA_RMS_API',
      'PEPLINK_INCONTROL_API',
      'PFSENSE_API',
      'GENERIC_HTTP',
      'SNMP',
      'RADIUS_NAS'
    )
  );

CREATE INDEX IF NOT EXISTS routers_management_protocol_idx
  ON routers (tenant_id, management_protocol, management_enabled)
  WHERE management_enabled=true;

COMMIT;
