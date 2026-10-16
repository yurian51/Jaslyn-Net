-- Corrective: the early-return guards in jaslyn_enforce_tenant_quota() combined a TG_TABLE_NAME test with a
-- table-specific column (e.g. NEW.revoked_at) in ONE expression. PL/pgSQL plans the whole expression, so any INSERT
-- into a table without that column (routers, customers, ...) failed with: record "new" has no field "revoked_at".
-- The guards are now nested so a column is only referenced for the table that owns it. Behaviour is otherwise unchanged.
BEGIN;
CREATE OR REPLACE FUNCTION jaslyn_enforce_tenant_quota() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_metric text; v_cap bigint; v_used bigint; v_sql text;
BEGIN
  IF TG_TABLE_NAME='platform_api_keys' THEN IF NEW.revoked_at IS NOT NULL OR (NEW.expires_at IS NOT NULL AND NEW.expires_at<=now()) THEN RETURN NEW; END IF; END IF;
  IF TG_TABLE_NAME='tenant_webhook_endpoints' THEN IF NEW.enabled=false THEN RETURN NEW; END IF; END IF;
  IF TG_TABLE_NAME='inventory_items' THEN IF NEW.active=false THEN RETURN NEW; END IF; END IF;
  IF TG_TABLE_NAME='suppliers' THEN IF NEW.status<>'ACTIVE' THEN RETURN NEW; END IF; END IF;
  IF TG_TABLE_NAME='purchase_orders' THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME='routers' THEN v_metric:='routers';
  ELSIF TG_TABLE_NAME='network_sites' THEN v_metric:='sites';
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

  IF TG_TABLE_NAME='inventory_items' THEN
    SELECT count(*) INTO v_used FROM inventory_items WHERE tenant_id=NEW.tenant_id AND active=true AND (TG_OP='INSERT' OR id<>NEW.id);
  ELSIF TG_TABLE_NAME='suppliers' THEN
    SELECT count(*) INTO v_used FROM suppliers WHERE tenant_id=NEW.tenant_id AND status='ACTIVE' AND (TG_OP='INSERT' OR id<>NEW.id);
  ELSIF TG_TABLE_NAME='platform_api_keys' THEN
    SELECT count(*) INTO v_used FROM platform_api_keys WHERE tenant_id=NEW.tenant_id AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now()) AND (TG_OP='INSERT' OR id<>NEW.id);
  ELSIF TG_TABLE_NAME='tenant_webhook_endpoints' THEN
    SELECT count(*) INTO v_used FROM tenant_webhook_endpoints WHERE tenant_id=NEW.tenant_id AND enabled=true AND (TG_OP='INSERT' OR id<>NEW.id);
  ELSIF TG_OP='UPDATE' THEN
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

COMMIT;
