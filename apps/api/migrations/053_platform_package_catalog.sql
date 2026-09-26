BEGIN;

ALTER TABLE saas_plans
  DROP CONSTRAINT IF EXISTS saas_plans_billing_interval_check;

ALTER TABLE saas_plans
  ADD CONSTRAINT saas_plans_billing_interval_check
  CHECK (billing_interval IN ('MONTH','YEAR','LIFETIME'));

ALTER TABLE saas_plans
  ADD COLUMN IF NOT EXISTS pricing_mode text NOT NULL DEFAULT 'FIXED'
    CHECK (pricing_mode IN ('FIXED','CUSTOM')),
  ADD COLUMN IF NOT EXISTS limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS saas_plans_active_sort_idx
  ON saas_plans (is_active, sort_order, price);

INSERT INTO saas_plans
  (code,name,description,price,currency,billing_interval,max_routers,max_sites,max_customers,
   pricing_mode,limits,features,sort_order,is_active)
VALUES
('FREE','Free / Sandbox','Testing, development and very small WiFi deployments.',0,'TZS','LIFETIME',1,1,50,
 'FIXED',
 '{"admins":1,"packages":3,"vouchersMonthly":50,"apiRequestsDaily":250,"sites":1,"routers":1,"subscribers":50}'::jsonb,
 '{"hotspot":true,"pppoe":true,"radius":true,"basicBilling":true,"manualPayments":true,"basicMonitoring":true,"customerPortal":true,"telegram":false,"automation":false,"advancedAnalytics":false,"multiWan":false,"ipam":false,"networkCommands":false,"api":false,"whiteLabel":false,"multiTenant":false,"dedicatedInfrastructure":false}'::jsonb,
 10,true),
('STARTER','Starter','For small WiFi operators, hotels, lodges and community networks.',10000,'TZS','MONTH',3,1,250,
 'FIXED',
 '{"admins":3,"packages":20,"vouchersMonthly":1000,"apiRequestsDaily":2500,"sites":1,"routers":3,"subscribers":250}'::jsonb,
 '{"hotspot":true,"pppoe":true,"radius":true,"basicBilling":true,"manualPayments":true,"onlinePayments":true,"basicMonitoring":true,"customerPortal":true,"telegram":true,"automation":true,"advancedAnalytics":false,"multiWan":false,"ipam":false,"networkCommands":false,"api":true,"whiteLabel":false,"multiTenant":false,"dedicatedInfrastructure":false}'::jsonb,
 20,true),
('BUSINESS','Business','For growing ISPs and WISPs operating multiple routers and sites.',25000,'TZS','MONTH',10,3,1000,
 'FIXED',
 '{"admins":10,"packages":null,"vouchersMonthly":5000,"apiRequestsDaily":10000,"sites":3,"routers":10,"subscribers":1000}'::jsonb,
 '{"hotspot":true,"pppoe":true,"radius":true,"advancedBilling":true,"onlinePayments":true,"customerPortal":true,"telegram":true,"automation":true,"advancedAnalytics":true,"multiWan":false,"ipam":true,"networkCommands":true,"api":true,"whiteLabel":false,"multiTenant":false,"dedicatedInfrastructure":false}'::jsonb,
 30,true),
('PROFESSIONAL','Professional','For serious ISP/WISP and fiber operators with advanced network operations.',60000,'TZS','MONTH',30,10,5000,
 'FIXED',
 '{"admins":30,"packages":null,"vouchersMonthly":25000,"apiRequestsDaily":50000,"sites":10,"routers":30,"subscribers":5000}'::jsonb,
 '{"hotspot":true,"pppoe":true,"radius":true,"advancedBilling":true,"onlinePayments":true,"customerPortal":true,"telegram":true,"automation":true,"advancedAnalytics":true,"multiWan":true,"ipam":true,"networkCommands":true,"qos":true,"loadBalancing":true,"incidentManagement":true,"api":true,"whiteLabel":false,"multiTenant":false,"dedicatedInfrastructure":false}'::jsonb,
 40,true),
('ENTERPRISE','Enterprise','For large ISPs, fiber operators, institutions and multi-region networks.',0,'TZS','YEAR',NULL,NULL,NULL,
 'CUSTOM',
 '{"admins":null,"packages":null,"vouchersMonthly":null,"apiRequestsDaily":null,"sites":null,"routers":null,"subscribers":null}'::jsonb,
 '{"hotspot":true,"pppoe":true,"radius":true,"advancedBilling":true,"onlinePayments":true,"customerPortal":true,"telegram":true,"automation":true,"advancedAnalytics":true,"multiWan":true,"ipam":true,"networkCommands":true,"qos":true,"loadBalancing":true,"incidentManagement":true,"api":true,"whiteLabel":true,"multiTenant":true,"dedicatedInfrastructure":true,"ha":true,"sso":true,"customIntegrations":true}'::jsonb,
 50,true),
('CARRIER','Carrier / Platform','Multi-tenant platform deployment, reseller infrastructure and dedicated environments.',0,'TZS','YEAR',NULL,NULL,NULL,
 'CUSTOM',
 '{"admins":null,"packages":null,"vouchersMonthly":null,"apiRequestsDaily":null,"sites":null,"routers":null,"subscribers":null,"organizations":null}'::jsonb,
 '{"hotspot":true,"pppoe":true,"radius":true,"advancedBilling":true,"onlinePayments":true,"customerPortal":true,"telegram":true,"automation":true,"advancedAnalytics":true,"multiWan":true,"ipam":true,"networkCommands":true,"qos":true,"loadBalancing":true,"incidentManagement":true,"api":true,"whiteLabel":true,"multiTenant":true,"dedicatedInfrastructure":true,"ha":true,"sso":true,"customIntegrations":true,"reseller":true,"agentHierarchy":true,"developerPortal":true}'::jsonb,
 60,true)
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name,
  description=EXCLUDED.description,
  price=EXCLUDED.price,
  currency=EXCLUDED.currency,
  billing_interval=EXCLUDED.billing_interval,
  max_routers=EXCLUDED.max_routers,
  max_sites=EXCLUDED.max_sites,
  max_customers=EXCLUDED.max_customers,
  pricing_mode=EXCLUDED.pricing_mode,
  limits=EXCLUDED.limits,
  features=EXCLUDED.features,
  sort_order=EXCLUDED.sort_order,
  is_active=EXCLUDED.is_active;

INSERT INTO organization_subscriptions
  (tenant_id,saas_plan_id,status,starts_at,current_period_start,current_period_end)
SELECT t.id,p.id,'ACTIVE',now(),now(),now()+interval '100 years'
FROM tenants t
JOIN saas_plans p ON p.code='FREE'
WHERE NOT EXISTS (
  SELECT 1 FROM organization_subscriptions s
  WHERE s.tenant_id=t.id AND s.status IN ('TRIALING','ACTIVE','PAST_DUE')
);

CREATE OR REPLACE FUNCTION jaslyn_enforce_plan_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  tenant uuid := COALESCE(NEW.tenant_id, OLD.tenant_id);
  plan_limits jsonb;
  max_value integer;
  current_count integer;
  resource_name text;
BEGIN
  SELECT COALESCE(p.limits,'{}'::jsonb)
    INTO plan_limits
  FROM organization_subscriptions s
  JOIN saas_plans p ON p.id=s.saas_plan_id
  WHERE s.tenant_id=tenant
    AND s.status IN ('TRIALING','ACTIVE','PAST_DUE')
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF plan_limits IS NULL THEN
    SELECT limits INTO plan_limits FROM saas_plans WHERE code='FREE';
  END IF;

  resource_name := CASE TG_TABLE_NAME
    WHEN 'routers' THEN 'routers'
    WHEN 'locations' THEN 'sites'
    WHEN 'customers' THEN 'subscribers'
    WHEN 'packages' THEN 'packages'
    ELSE NULL
  END;

  IF resource_name IS NULL THEN
    RETURN NEW;
  END IF;

  max_value := NULLIF(plan_limits->>resource_name,'')::integer;
  IF max_value IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(tenant::text || ':' || resource_name));

  EXECUTE format('SELECT count(*)::int FROM %I WHERE tenant_id=$1',TG_TABLE_NAME)
    INTO current_count USING tenant;

  IF current_count >= max_value THEN
    RAISE EXCEPTION 'PLAN_LIMIT:%:%', resource_name, max_value
      USING ERRCODE='check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS routers_plan_limit ON routers;
CREATE TRIGGER routers_plan_limit
BEFORE INSERT ON routers
FOR EACH ROW EXECUTE FUNCTION jaslyn_enforce_plan_limit();

DROP TRIGGER IF EXISTS locations_plan_limit ON locations;
CREATE TRIGGER locations_plan_limit
BEFORE INSERT ON locations
FOR EACH ROW EXECUTE FUNCTION jaslyn_enforce_plan_limit();

DROP TRIGGER IF EXISTS customers_plan_limit ON customers;
CREATE TRIGGER customers_plan_limit
BEFORE INSERT ON customers
FOR EACH ROW EXECUTE FUNCTION jaslyn_enforce_plan_limit();

DROP TRIGGER IF EXISTS packages_plan_limit ON packages;
CREATE TRIGGER packages_plan_limit
BEFORE INSERT ON packages
FOR EACH ROW EXECUTE FUNCTION jaslyn_enforce_plan_limit();

COMMIT;
