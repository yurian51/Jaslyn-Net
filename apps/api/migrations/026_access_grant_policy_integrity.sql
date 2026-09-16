BEGIN;

-- Every active entitlement must carry a concrete policy snapshot. This closes
-- the last unsafe write path: any future activation flow that forgets to
-- populate network_policy will fail atomically instead of creating access
-- that cannot be translated into network enforcement.
UPDATE access_grants ag
SET network_policy = jsonb_build_object(
  'version', 1,
  'source', jsonb_build_object('packageId', k.id, 'packageName', k.name),
  'validity', jsonb_build_object('durationSeconds', k.duration_seconds),
  'quota', jsonb_build_object('dataLimitBytes', k.data_limit_bytes),
  'bandwidth', jsonb_build_object('downloadBps', k.download_bps, 'uploadBps', k.upload_bps),
  'session', jsonb_build_object(
    'sessionTimeoutSeconds', k.duration_seconds,
    'interimUpdateSeconds', LEAST(300, GREATEST(30, FLOOR(k.duration_seconds / 20.0)::int))
  ),
  'capabilities', jsonb_build_object(
    'quotaEnforcement', k.data_limit_bytes IS NOT NULL,
    'bandwidthEnforcement', k.download_bps IS NOT NULL OR k.upload_bps IS NOT NULL,
    'sessionTimeout', true,
    'interimAccounting', true,
    'coaCompatible', k.download_bps IS NOT NULL OR k.upload_bps IS NOT NULL
  )
)
FROM wifi_plan_purchases p
JOIN packages k ON k.tenant_id = p.tenant_id AND k.id = p.package_id
WHERE ag.tenant_id = p.tenant_id
  AND ag.purchase_id = p.id
  AND ag.status = 'ACTIVE'
  AND ag.network_policy = '{}'::jsonb;

ALTER TABLE access_grants
  DROP CONSTRAINT IF EXISTS access_grants_active_policy_check;

ALTER TABLE access_grants
  ADD CONSTRAINT access_grants_active_policy_check
  CHECK (status <> 'ACTIVE' OR network_policy <> '{}'::jsonb);

COMMIT;
