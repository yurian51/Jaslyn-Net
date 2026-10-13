BEGIN;

CREATE OR REPLACE FUNCTION jaslyn_guard_financial_audit_chain_head() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_entry_hash text; v_previous_hash text;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.last_sequence<>0 OR NEW.last_hash<>repeat('0',64) THEN
      RAISE EXCEPTION 'Audit chain heads must start from the zero anchor';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Financial audit chain heads cannot be deleted';
  END IF;
  IF NEW.tenant_id<>OLD.tenant_id OR NEW.last_sequence<>OLD.last_sequence+1 THEN
    RAISE EXCEPTION 'Invalid financial audit chain sequence transition';
  END IF;
  SELECT entry_hash,previous_hash INTO v_entry_hash,v_previous_hash
    FROM financial_change_audit WHERE tenant_id=NEW.tenant_id AND chain_sequence=NEW.last_sequence;
  IF NOT FOUND OR v_previous_hash<>OLD.last_hash OR v_entry_hash<>NEW.last_hash THEN
    RAISE EXCEPTION 'Financial audit chain head does not match the appended audit entry';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS jaslyn_guard_financial_audit_chain_head ON financial_audit_chain_heads;
CREATE TRIGGER jaslyn_guard_financial_audit_chain_head
BEFORE INSERT OR UPDATE OR DELETE ON financial_audit_chain_heads
FOR EACH ROW EXECUTE FUNCTION jaslyn_guard_financial_audit_chain_head();

COMMIT;
