BEGIN;

CREATE TABLE IF NOT EXISTS message_expirations (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  message_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,message_id),
  FOREIGN KEY (tenant_id,message_id) REFERENCES messages(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS message_expirations_due_idx ON message_expirations(expires_at);

CREATE TABLE IF NOT EXISTS stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'TEXT' CHECK (kind IN ('TEXT','IMAGE','VIDEO','LINK','POLL')),
  body text,
  media_key text,
  audience text NOT NULL DEFAULT 'CONTACTS' CHECK (audience IN ('PUBLIC','CONTACTS','PRIVATE')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,author_user_id) REFERENCES users(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS stories_active_idx ON stories(tenant_id,expires_at,created_at DESC);

CREATE TABLE IF NOT EXISTS story_views (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  story_id uuid NOT NULL,
  viewer_user_id uuid NOT NULL,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,story_id,viewer_user_id),
  FOREIGN KEY (tenant_id,story_id) REFERENCES stories(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,viewer_user_id) REFERENCES users(tenant_id,id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS conversation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  created_by_user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  timezone text NOT NULL DEFAULT 'Africa/Dar_es_Salaam',
  location text,
  status text NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED','LIVE','ENDED','CANCELED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,conversation_id) REFERENCES conversations(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,created_by_user_id) REFERENCES users(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS conversation_events_schedule_idx ON conversation_events(tenant_id,starts_at,status);

CREATE TABLE IF NOT EXISTS conversation_event_attendees (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_id uuid NOT NULL,
  user_id uuid NOT NULL,
  response text NOT NULL DEFAULT 'INVITED' CHECK (response IN ('INVITED','GOING','MAYBE','DECLINED')),
  responded_at timestamptz,
  PRIMARY KEY (tenant_id,event_id,user_id),
  FOREIGN KEY (tenant_id,event_id) REFERENCES conversation_events(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,user_id) REFERENCES users(tenant_id,id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mini_apps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  owner_user_id uuid,
  slug text NOT NULL,
  name text NOT NULL,
  description text,
  launch_url text NOT NULL,
  icon_url text,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,slug),
  FOREIGN KEY (tenant_id,owner_user_id) REFERENCES users(tenant_id,id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS mini_app_installs (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mini_app_id uuid NOT NULL,
  user_id uuid NOT NULL,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  installed_at timestamptz NOT NULL DEFAULT now(),
  last_opened_at timestamptz,
  PRIMARY KEY (tenant_id,mini_app_id,user_id),
  FOREIGN KEY (tenant_id,mini_app_id) REFERENCES mini_apps(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,user_id) REFERENCES users(tenant_id,id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS mini_apps_enabled_idx ON mini_apps(tenant_id,enabled,name);

COMMIT;