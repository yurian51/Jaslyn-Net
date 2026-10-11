BEGIN;

CREATE TABLE IF NOT EXISTS tenant_usage_limits (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  metric_key text NOT NULL CHECK (metric_key IN ('inventory_items','suppliers','purchase_orders','api_keys','webhook_endpoints')),
  limit_count bigint NOT NULL CHECK (limit_count>=0),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,metric_key),
  FOREIGN KEY(tenant_id,updated_by) REFERENCES users(tenant_id,id) ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION jaslyn_enforce_tenant_quota() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_metric text; v_cap bigint; v_used bigint; v_sql text;
BEGIN
  IF TG_TABLE_NAME='routers' THEN v_metric:='routers';
  ELSIF TG_TABLE_NAME='sites' THEN v_metric:='sites';
  ELSIF TG_TABLE_NAME='customers' THEN v_metric:='customers';
  ELSIF TG_TABLE_NAME='inventory_items' THEN v_metric:='inventory_items';
  ELSIF TG_TABLE_NAME='suppliers' THEN v_metric:='suppliers';
  ELSIF TG_TABLE_NAME='purchase_orders' THEN v_metric:='purchase_orders';
  ELSIF TG_TABLE_NAME='platform_api_keys' THEN v_metric:='api_keys';
  ELSIF TG_TABLE_NAME='tenant_webhook_endpoints' THEN v_metric:='webhook_endpoints';
  ELSE RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text||':'||v_metric,0));
  v_cap:=NULL;
  IF v_metric='routers' THEN
    SELECT p.max_routers INTO v_cap FROM organization_subscriptions s JOIN saas_plans p ON p.id=s.saas_plan_id
      WHERE s.tenant_id=NEW.tenant_id AND s.status IN ('TRIALING','ACTIVE','PAST_DUE')
      ORDER BY CASE WHEN s.status IN ('TRIALING','ACTIVE','PAST_DUE') THEN 0 ELSE 1 END,s.created_at DESC LIMIT 1;
  ELSIF v_metric='sites' THEN
    SELECT p.max_sites INTO v_cap FROM organization_subscriptions s JOIN saas_plans p ON p.id=s.saas_plan_id
      WHERE s.tenant_id=NEW.tenant_id AND s.status IN ('TRIALING','ACTIVE','PAST_DUE')
      ORDER BY s.created_at DESC LIMIT 1;
  ELSIF v_metric='customers' THEN
    SELECT p.max_customers INTO v_cap FROM organization_subscriptions s JOIN saas_plans p ON p.id=s.saas_plan_id
      WHERE s.tenant_id=NEW.tenant_id AND s.status IN ('TRIALING','ACTIVE','PAST_DUE')
      ORDER BY s.created_at DESC LIMIT 1;
  ELSE
    SELECT limit_count INTO v_cap FROM tenant_usage_limits WHERE tenant_id=NEW.tenant_id AND metric_key=v_metric;
  END IF;
  IF v_cap IS NULL THEN RETURN NEW; END IF;

  IF TG_OP='UPDATE' THEN
    v_sql:=format('SELECT count(*) FROM %I WHERE tenant_id=$1 AND id<>$2',TG_TABLE_NAME);
    EXECUTE v_sql INTO v_used USING NEW.tenant_id,NEW.id;
  ELSE
    v_sql:=format('SELECT count(*) FROM %I WHERE tenant_id=$1',TG_TABLE_NAME);
    EXECUTE v_sql INTO v_used USING NEW.tenant_id;
  END IF;
  IF v_used>=v_cap THEN
    RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='tenant_plan_quota_exceeded',
      MESSAGE=format('Tenant quota exceeded for %s (limit %s)',v_metric,v_cap);
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION jaslyn_record_tenant_usage() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_metric text;
BEGIN
  v_metric:=CASE TG_TABLE_NAME
    WHEN 'routers' THEN 'routers_created'
    WHEN 'sites' THEN 'sites_created'
    WHEN 'customers' THEN 'customers_created'
    WHEN 'inventory_items' THEN 'inventory_items_created'
    WHEN 'suppliers' THEN 'suppliers_created'
    WHEN 'purchase_orders' THEN 'purchase_orders_created'
    WHEN 'platform_api_keys' THEN 'api_keys_created'
    WHEN 'tenant_webhook_endpoints' THEN 'webhook_endpoints_created'
    ELSE TG_TABLE_NAME||'_created' END;
  INSERT INTO tenant_usage_counters(tenant_id,metric_key,period_start,usage_count)
    VALUES(NEW.tenant_id,v_metric,CURRENT_DATE,1)
    ON CONFLICT(tenant_id,metric_key,period_start) DO UPDATE SET usage_count=tenant_usage_counters.usage_count+1,updated_at=now();
  RETURN NEW;
END; $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['routers','sites','customers','inventory_items','suppliers','purchase_orders','platform_api_keys','tenant_webhook_endpoints'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS jaslyn_tenant_quota ON %I',t);
    EXECUTE format('CREATE TRIGGER jaslyn_tenant_quota BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION jaslyn_enforce_tenant_quota()',t);
    EXECUTE format('DROP TRIGGER IF EXISTS jaslyn_tenant_usage_counter ON %I',t);
    EXECUTE format('CREATE TRIGGER jaslyn_tenant_usage_counter AFTER INSERT ON %I FOR EACH ROW EXECUTE FUNCTION jaslyn_record_tenant_usage()',t);
  END LOOP;
  EXECUTE 'DROP TRIGGER IF EXISTS jaslyn_financial_audit ON tenant_usage_limits';
  EXECUTE 'CREATE TRIGGER jaslyn_financial_audit AFTER INSERT OR UPDATE OR DELETE ON tenant_usage_limits FOR EACH ROW EXECUTE FUNCTION jaslyn_financial_audit_trigger()';
END $$;

INSERT INTO permission_catalog(permission_key,description) VALUES
 ('msp.usage.read','Read tenant resource usage, plan caps and historical counters'),
 ('msp.usage.manage','Set tenant-specific resource limits')
ON CONFLICT(permission_key) DO UPDATE SET description=EXCLUDED.description;

COMMIT;
