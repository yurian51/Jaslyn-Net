-- Shared tenant-scoped evidence primitives for signature features.
-- Evidence is source-attributed; this table does not claim external facts are independently verified.
CREATE TABLE IF NOT EXISTS signature_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  evidence_type text NOT NULL CHECK (length(evidence_type) BETWEEN 2 AND 80),
  subject_type text NOT NULL CHECK (length(subject_type) BETWEEN 2 AND 80),
  subject_id text NOT NULL CHECK (length(subject_id) BETWEEN 1 AND 180),
  source_type text NOT NULL CHECK (length(source_type) BETWEEN 2 AND 80),
  source_ref text,
  observed_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  confidence numeric(5,4) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text,
  created_by uuid,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS signature_evidence_subject_idx
  ON signature_evidence(tenant_id, subject_type, subject_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS signature_evidence_type_idx
  ON signature_evidence(tenant_id, evidence_type, observed_at DESC);
CREATE TABLE IF NOT EXISTS signature_evidence_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  from_evidence_id uuid NOT NULL,
  to_evidence_id uuid NOT NULL,
  relation text NOT NULL CHECK (length(relation) BETWEEN 2 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CHECK (from_evidence_id <> to_evidence_id),
  UNIQUE (tenant_id, from_evidence_id, to_evidence_id, relation),
  FOREIGN KEY (tenant_id, from_evidence_id) REFERENCES signature_evidence(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, to_evidence_id) REFERENCES signature_evidence(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS signature_evidence_links_from_idx ON signature_evidence_links(tenant_id, from_evidence_id);
CREATE INDEX IF NOT EXISTS signature_evidence_links_to_idx ON signature_evidence_links(tenant_id, to_evidence_id);
