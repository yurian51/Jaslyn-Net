CREATE TABLE IF NOT EXISTS legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  document_type text NOT NULL CHECK (document_type IN ('TERMS_OF_USE','PRIVACY_NOTICE')),
  document_version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip_address inet,
  user_agent text,
  FOREIGN KEY (tenant_id, user_id) REFERENCES users(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS legal_acceptances_user_document_idx
  ON legal_acceptances (tenant_id, user_id, document_type, accepted_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS legal_acceptances_current_user_document_idx
  ON legal_acceptances (tenant_id, user_id, document_type, document_version);
