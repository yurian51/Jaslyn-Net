-- Sign-in throttling. Keys are SHA-256 hashes (no raw emails or IPs stored). Three scopes:
--   pair  = email + client IP   (5 failures)   stops guessing one account from one source without locking out the real owner
--   ip    = client IP           (30 failures)  stops one source spraying many accounts
--   email = account             (50 failures)  slows distributed credential stuffing against one account
BEGIN;
CREATE TABLE IF NOT EXISTS auth_login_throttle (
  scope text NOT NULL CHECK (scope IN ('pair','ip','email')),
  key text NOT NULL,
  failures integer NOT NULL DEFAULT 0 CHECK (failures >= 0),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  PRIMARY KEY (scope, key)
);
CREATE INDEX IF NOT EXISTS auth_login_throttle_window_idx ON auth_login_throttle (window_started_at);
COMMIT;
