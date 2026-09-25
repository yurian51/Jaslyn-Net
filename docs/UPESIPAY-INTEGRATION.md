# UpesiPay capability integration

Jaslyn Net now has a real UpesiPay provider control-plane integration based on the provider's current public API documentation.

Implemented capabilities:
- Fetch tenant payment channels from UpesiPay.
- Fetch registered bank paybills.
- Initiate service-wallet top-up using M-Pesa.
- Generate a Merchant Link from a configured merchant ID or custom tag.
- Persist provider callback payloads without treating an unsigned callback as financial proof.

Security/integrity rules:
- Authentication token is resolved from the tenant's existing `payment_provider_configs.credentials_ref`; secrets are never committed.
- API traffic is pinned to HTTPS on `upesipay.com`.
- Provider callbacks are stored as `PENDING` verification and do not settle a payment by themselves.
- The existing Jaslyn payment verification boundary remains authoritative for ledger posting and access activation.

Tenant configuration example:

```sql
INSERT INTO payment_provider_configs
  (tenant_id, provider, display_name, credentials_ref, is_active, metadata)
VALUES
  ('<tenant-id>', 'upesipay', 'UpesiPay', 'UPESIPAY_AUTH_TOKEN', true,
   '{"merchantId":"<merchant-id>","customTag":"<optional-custom-tag>"}'::jsonb);
```

The current provider documentation uses Basic Authentication and documents the v2 API endpoints for payment channels, bank paybills and service-wallet top-up. Merchant Links use `/m/{merchant_id}` or `/m/{custom_tag}`.

The M-Pesa STK initiation and transaction-status endpoint are intentionally not guessed here because the current public documentation exposed to this implementation did not provide a stable endpoint contract. They should be wired only after the exact provider contract is verified, rather than turning Jaslyn into a beautifully documented hallucination.
