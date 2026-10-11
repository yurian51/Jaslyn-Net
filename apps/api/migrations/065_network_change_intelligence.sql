BEGIN;

CREATE TABLE IF NOT EXISTS network_change_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  router_id uuid NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('ROUTER_CONFIGURATION','NETWORK_COMMAND')),
  source_id uuid NOT NULL,
  change_type text NOT NULL,
  correlation_id text,
  before_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,router_id) REFERENCES routers(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS network_change_events_router_time_idx
  ON network_change_events (tenant_id,router_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS network_change_events_correlation_idx
  ON network_change_events (tenant_id,correlation_id,occurred_at DESC) WHERE correlation_id IS NOT NULL;

CREATE OR REPLACE FUNCTION jaslyn_capture_router_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  changed text[] := ARRAY[]::text[];
  before_json jsonb := '{}'::jsonb;
  after_json jsonb;
BEGIN
  after_json := jsonb_build_object(
    'name',NEW.name,'vendor',NEW.vendor,'model',NEW.model,'ipAddress',NEW.ip_address::text,
    'macAddress',NEW.mac_address::text,'osVersion',NEW.os_version,'locationId',NEW.location_id,
    'managementProtocol',NEW.management_protocol,'managementEnabled',NEW.management_enabled,
    'controllerEndpoint',NEW.controller_endpoint,'capabilities',NEW.capabilities,
    'credentialsConfigured',NEW.management_credentials_encrypted IS NOT NULL
  );
  IF TG_OP='INSERT' THEN
    INSERT INTO network_change_events(tenant_id,router_id,source_type,source_id,change_type,after_state,details)
    VALUES (NEW.tenant_id,NEW.id,'ROUTER_CONFIGURATION',NEW.id,'ROUTER_REGISTERED',after_json,
      jsonb_build_object('changedFields',jsonb_build_array('name','vendor','model','managementProtocol','managementEnabled')));
    RETURN NEW;
  END IF;

  IF NEW.name IS DISTINCT FROM OLD.name THEN changed:=array_append(changed,'name'); END IF;
  IF NEW.vendor IS DISTINCT FROM OLD.vendor THEN changed:=array_append(changed,'vendor'); END IF;
  IF NEW.model IS DISTINCT FROM OLD.model THEN changed:=array_append(changed,'model'); END IF;
  IF NEW.ip_address IS DISTINCT FROM OLD.ip_address THEN changed:=array_append(changed,'ipAddress'); END IF;
  IF NEW.mac_address IS DISTINCT FROM OLD.mac_address THEN changed:=array_append(changed,'macAddress'); END IF;
  IF NEW.os_version IS DISTINCT FROM OLD.os_version THEN changed:=array_append(changed,'osVersion'); END IF;
  IF NEW.location_id IS DISTINCT FROM OLD.location_id THEN changed:=array_append(changed,'locationId'); END IF;
  IF NEW.management_protocol IS DISTINCT FROM OLD.management_protocol THEN changed:=array_append(changed,'managementProtocol'); END IF;
  IF NEW.management_enabled IS DISTINCT FROM OLD.management_enabled THEN changed:=array_append(changed,'managementEnabled'); END IF;
  IF NEW.controller_endpoint IS DISTINCT FROM OLD.controller_endpoint THEN changed:=array_append(changed,'controllerEndpoint'); END IF;
  IF NEW.capabilities IS DISTINCT FROM OLD.capabilities THEN changed:=array_append(changed,'capabilities'); END IF;
  IF (NEW.management_credentials_encrypted IS NULL) IS DISTINCT FROM (OLD.management_credentials_encrypted IS NULL) THEN changed:=array_append(changed,'credentialsConfigured'); END IF;

  IF cardinality(changed)>0 THEN
    before_json := jsonb_build_object(
      'name',OLD.name,'vendor',OLD.vendor,'model',OLD.model,'ipAddress',OLD.ip_address::text,
      'macAddress',OLD.mac_address::text,'osVersion',OLD.os_version,'locationId',OLD.location_id,
      'managementProtocol',OLD.management_protocol,'managementEnabled',OLD.management_enabled,
      'controllerEndpoint',OLD.controller_endpoint,'capabilities',OLD.capabilities,
      'credentialsConfigured',OLD.management_credentials_encrypted IS NOT NULL
    );
    INSERT INTO network_change_events(tenant_id,router_id,source_type,source_id,change_type,before_state,after_state,details)
    VALUES (NEW.tenant_id,NEW.id,'ROUTER_CONFIGURATION',NEW.id,'ROUTER_CONFIGURATION_CHANGED',before_json,after_json,
      jsonb_build_object('changedFields',to_jsonb(changed)));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS routers_change_intelligence_trg ON routers;
CREATE TRIGGER routers_change_intelligence_trg
AFTER INSERT OR UPDATE ON routers
FOR EACH ROW EXECUTE FUNCTION jaslyn_capture_router_change();

CREATE OR REPLACE FUNCTION jaslyn_capture_network_command_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  before_json jsonb := '{}'::jsonb;
  after_json jsonb;
BEGIN
  IF NEW.router_id IS NULL THEN RETURN NEW; END IF;
  after_json := jsonb_build_object(
    'commandType',NEW.command_type,'provider',NEW.provider,'status',NEW.status,
    'verification',NEW.verification,'error',NEW.error,'attempts',NEW.attempts
  );
  IF TG_OP='UPDATE' THEN
    IF NEW.status IS NOT DISTINCT FROM OLD.status
       AND NEW.verification IS NOT DISTINCT FROM OLD.verification
       AND NEW.error IS NOT DISTINCT FROM OLD.error THEN
      RETURN NEW;
    END IF;
    before_json := jsonb_build_object(
      'commandType',OLD.command_type,'provider',OLD.provider,'status',OLD.status,
      'verification',OLD.verification,'error',OLD.error,'attempts',OLD.attempts
    );
  END IF;
  INSERT INTO network_change_events(tenant_id,router_id,source_type,source_id,change_type,correlation_id,before_state,after_state,details)
  VALUES (NEW.tenant_id,NEW.router_id,'NETWORK_COMMAND',NEW.id,'NETWORK_COMMAND_'||NEW.status,NEW.correlation_id,
    before_json,after_json,jsonb_build_object('commandId',NEW.id,'commandType',NEW.command_type,'provider',NEW.provider));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS network_commands_change_intelligence_trg ON network_commands;
CREATE TRIGGER network_commands_change_intelligence_trg
AFTER INSERT OR UPDATE OF status,verification,error ON network_commands
FOR EACH ROW EXECUTE FUNCTION jaslyn_capture_network_command_change();

COMMIT;
