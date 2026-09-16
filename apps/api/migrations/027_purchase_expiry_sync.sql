BEGIN;

-- Access expiry is a billing state transition too. Keep the commercial purchase
-- state from remaining PAID after its network entitlement has expired.
CREATE OR REPLACE FUNCTION sync_purchase_status_from_access_grant_expiry()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'EXPIRED' AND NEW.purchase_id IS NOT NULL AND NEW.ends_at IS NOT NULL AND NEW.ends_at <= now() THEN
    UPDATE wifi_plan_purchases
       SET status = 'EXPIRED', updated_at = now()
     WHERE tenant_id = NEW.tenant_id
       AND id = NEW.purchase_id
       AND status IN ('PAID', 'ACTIVE')
       AND (ends_at IS NOT NULL AND ends_at <= now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS access_grant_purchase_expiry_sync_trg ON access_grants;
CREATE TRIGGER access_grant_purchase_expiry_sync_trg
AFTER UPDATE OF status ON access_grants
FOR EACH ROW
EXECUTE FUNCTION sync_purchase_status_from_access_grant_expiry();

-- Repair existing contradictions created before this guard existed.
UPDATE wifi_plan_purchases p
SET status = 'EXPIRED', updated_at = now()
WHERE p.status IN ('PAID', 'ACTIVE')
  AND p.ends_at IS NOT NULL
  AND p.ends_at <= now()
  AND EXISTS (
    SELECT 1
    FROM access_grants g
    WHERE g.tenant_id = p.tenant_id
      AND g.purchase_id = p.id
      AND g.status = 'EXPIRED'
  );

COMMIT;
