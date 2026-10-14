BEGIN;

-- Remove the legacy parallel UpesiLipa site-settings subsystem.
-- Canonical Jaslyn Net modules own locations, portals, access, payments and network operations.
DROP TABLE IF EXISTS upesilipa_site_settings;

COMMIT;
