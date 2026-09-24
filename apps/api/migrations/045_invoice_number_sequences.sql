-- Concurrency-safe per-tenant invoice numbering.
CREATE TABLE IF NOT EXISTS invoice_number_sequences (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  next_value bigint NOT NULL DEFAULT 1 CHECK (next_value > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION next_invoice_number(p_tenant_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_number bigint;
BEGIN
  INSERT INTO invoice_number_sequences (tenant_id, next_value)
  VALUES (p_tenant_id, 2)
  ON CONFLICT (tenant_id)
  DO UPDATE SET
    next_value = invoice_number_sequences.next_value + 1,
    updated_at = now()
  RETURNING next_value - 1 INTO v_number;

  RETURN 'INV-' || lpad(v_number::text, 8, '0');
END;
$$;
