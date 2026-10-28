CREATE UNIQUE INDEX IF NOT EXISTS routers_tenant_id_id_unique_for_fiber
  ON routers (tenant_id, id);

CREATE TABLE IF NOT EXISTS fiber_network_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  asset_type text NOT NULL CHECK (asset_type IN ('OLT','ONU','CABINET','SPLITTER','FIBER_ROUTE','DROP_CABLE','POLE','PATCH_PANEL')),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 160),
  asset_code text NOT NULL CHECK (length(btrim(asset_code)) BETWEEN 2 AND 80),
  status text NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','ACTIVE','DEGRADED','FAULTY','RETIRED')),
  latitude numeric(10,7),
  longitude numeric(10,7),
  parent_asset_id uuid,
  router_id uuid,
  vendor text,
  model text,
  serial_number text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fiber_assets_latitude_range CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CONSTRAINT fiber_assets_longitude_range CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  CONSTRAINT fiber_assets_tenant_code_unique UNIQUE (tenant_id, asset_code),
  CONSTRAINT fiber_assets_parent_tenant_fk FOREIGN KEY (tenant_id, parent_asset_id)
    REFERENCES fiber_network_assets(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT fiber_assets_router_tenant_fk FOREIGN KEY (tenant_id, router_id)
    REFERENCES routers(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT fiber_assets_id_tenant_unique UNIQUE (tenant_id, id),
  CONSTRAINT fiber_assets_created_by_tenant_fk FOREIGN KEY (tenant_id, created_by)
    REFERENCES users(tenant_id, id) ON DELETE SET NULL (created_by),
  CONSTRAINT fiber_assets_updated_by_tenant_fk FOREIGN KEY (tenant_id, updated_by)
    REFERENCES users(tenant_id, id) ON DELETE SET NULL (updated_by)
);

CREATE UNIQUE INDEX IF NOT EXISTS fiber_assets_tenant_code_casefold_idx
  ON fiber_network_assets (tenant_id, lower(asset_code));

CREATE INDEX IF NOT EXISTS fiber_assets_tenant_type_status_idx
  ON fiber_network_assets (tenant_id, asset_type, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS fiber_assets_parent_idx
  ON fiber_network_assets (tenant_id, parent_asset_id) WHERE parent_asset_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fiber_assets_geo_idx
  ON fiber_network_assets (tenant_id, latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE OR REPLACE FUNCTION fiber_assets_validate_parent()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  ancestor uuid;
BEGIN
  IF NEW.parent_asset_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.parent_asset_id = NEW.id THEN
    RAISE EXCEPTION 'Fiber asset cannot be its own parent' USING ERRCODE = '23514';
  END IF;
  ancestor := NEW.parent_asset_id;
  WHILE ancestor IS NOT NULL LOOP
    IF ancestor = NEW.id THEN
      RAISE EXCEPTION 'Fiber topology parent cycle detected' USING ERRCODE = '23514';
    END IF;
    SELECT parent_asset_id INTO ancestor
      FROM fiber_network_assets
      WHERE tenant_id = NEW.tenant_id AND id = ancestor;
    EXIT WHEN NOT FOUND;
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS fiber_assets_validate_parent_trigger ON fiber_network_assets;
CREATE TRIGGER fiber_assets_validate_parent_trigger
  BEFORE INSERT OR UPDATE OF parent_asset_id, tenant_id ON fiber_network_assets
  FOR EACH ROW EXECUTE FUNCTION fiber_assets_validate_parent();

CREATE OR REPLACE FUNCTION fiber_assets_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS fiber_assets_touch_updated_at_trigger ON fiber_network_assets;
CREATE TRIGGER fiber_assets_touch_updated_at_trigger
  BEFORE UPDATE ON fiber_network_assets
  FOR EACH ROW EXECUTE FUNCTION fiber_assets_touch_updated_at();
