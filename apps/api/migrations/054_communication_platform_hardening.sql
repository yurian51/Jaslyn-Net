BEGIN;

CREATE INDEX IF NOT EXISTS conversation_topics_tenant_updated_idx
  ON conversation_topics(tenant_id,conversation_id,updated_at DESC);

CREATE INDEX IF NOT EXISTS community_members_user_idx
  ON community_members(tenant_id,user_id,left_at)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS community_members_customer_idx
  ON community_members(tenant_id,customer_id,left_at)
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS polls_conversation_created_idx
  ON polls(tenant_id,conversation_id,created_at DESC);

CREATE INDEX IF NOT EXISTS poll_votes_user_idx
  ON poll_votes(tenant_id,user_id,poll_id);

CREATE INDEX IF NOT EXISTS automations_tenant_updated_idx
  ON automations(tenant_id,updated_at DESC);

CREATE INDEX IF NOT EXISTS automation_executions_status_idx
  ON automation_executions(tenant_id,status,created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS community_members_active_user_uq
  ON community_members(tenant_id,community_id,user_id)
  WHERE user_id IS NOT NULL AND left_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS community_members_active_customer_uq
  ON community_members(tenant_id,community_id,customer_id)
  WHERE customer_id IS NOT NULL AND left_at IS NULL;

COMMIT;
