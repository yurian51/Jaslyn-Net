BEGIN;

CREATE OR REPLACE FUNCTION populate_access_grant_network_policy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  pkg record;
BEGIN
  IF NEW.network_policy IS NOT NULL AND NEW.network_policy <> '{}'::jsonb THEN
    RETURN NEW;
  END IF;

  SELECT k.id, k.name, k.duration_seconds, k.data_limit_bytes, k.download_bps, k.upload_bps
    INTO pkg
    FROM wifi_plan_purchases p
    JOIN packages k ON k.tenant_id = p.tenant_id AND k.id = p.package_id
   WHERE p.tenant_id = NEW.tenant_id AND p.id = NEW.purchase_id;

  IF pkg.id IS NOT NULL THEN
    NEW.network_policy := jsonb_build_object(
      'version', 1,
      'source', jsonb_build_object('packageId', pkg.id, 'packageName', pkg.name),
      'validity', jsonb_build_object('durationSeconds', pkg.duration_seconds),
      'quota', jsonb_build_object('dataLimitBytes', pkg.data_limit_bytes),
      'bandwidth', jsonb_build_object('downloadBps', pkg.download_bps, 'uploadBps', pkg.upload_bps),
      'session', jsonb_build_object(
        'sessionTimeoutSeconds', pkg.duration_seconds,
        'interimUpdateSeconds', LEAST(300, GREATEST(60, FLOOR(pkg.duration_seconds / 20.0)::int))
      ),
      'capabilities', jsonb_build_object(
        'quotaEnforcement', pkg.data_limit_bytes IS NOT NULL,
        'bandwidthEnforcement', pkg.download_bps IS NOT NULL OR pkg.upload_bps IS NOT NULL,
        'sessionTimeout', true,
        'interimAccounting', true,
        'coaCompatible', pkg.download_bps IS NOT NULL OR pkg.upload_bps IS NOT NULL
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS access_grants_policy_snapshot_trg ON access_grants;
CREATE TRIGGER access_grants_policy_snapshot_trg
BEFORE INSERT OR UPDATE OF purchase_id, network_policy ON access_grants
FOR EACH ROW
EXECUTE FUNCTION populate_access_grant_network_policy();

UPDATE access_grants ag
SET network_policy = jsonb_build_object(
  'version', 1,
  'source', jsonb_build_object('packageId', k.id, 'packageName', k.name),
  'validity', jsonb_build_object('durationSeconds', k.duration_seconds),
  'quota', jsonb_build_object('dataLimitBytes', k.data_limit_bytes),
  'bandwidth', jsonb_build_object('downloadBps', k.download_bps, 'uploadBps', k.upload_bps),
  'session', jsonb_build_object('sessionTimeoutSeconds', k.duration_seconds, 'interimUpdateSeconds', LEAST(300, GREATEST(60, FLOOR(k.duration_seconds / 20.0)::int))),
  'capabilities', jsonb_build_object('quotaEnforcement', k.data_limit_bytes IS NOT NULL, 'bandwidthEnforcement', k.download_bps IS NOT NULL OR k.upload_bps IS NOT NULL, 'sessionTimeout', true, 'interimAccounting', true, 'coaCompatible', k.download_bps IS NOT NULL OR k.upload_bps IS NOT NULL)
)
FROM wifi_plan_purchases p
JOIN packages k ON k.tenant_id = p.tenant_id AND k.id = p.package_id
WHERE ag.tenant_id = p.tenant_id AND ag.purchase_id = p.id
  AND (ag.network_policy = '{}'::jsonb OR ag.network_policy IS NULL);

COMMIT;
