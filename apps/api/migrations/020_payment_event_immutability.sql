BEGIN;

-- A provider event id identifies one immutable provider event. Processing state,
-- payment linkage and processed_at may evolve, but the event's identity and
-- captured payload must never be rewritten by retries or replayed webhooks.
CREATE OR REPLACE FUNCTION prevent_payment_event_immutable_changes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.provider IS DISTINCT FROM OLD.provider
     OR NEW.provider_event_id IS DISTINCT FROM OLD.provider_event_id
     OR NEW.event_type IS DISTINCT FROM OLD.event_type
     OR NEW.payload IS DISTINCT FROM OLD.payload
     OR NEW.signature_valid IS DISTINCT FROM OLD.signature_valid
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'payment event immutable fields cannot be changed'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_events_immutable_fields_trg ON payment_events;

CREATE TRIGGER payment_events_immutable_fields_trg
BEFORE UPDATE ON payment_events
FOR EACH ROW
EXECUTE FUNCTION prevent_payment_event_immutable_changes();

COMMIT;
