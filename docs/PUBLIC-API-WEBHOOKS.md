# Public API and Webhook Contract

## API keys

Create a key from **Platform Integrations → API keys**. The raw token is returned once as `jn_live_...`; the database stores only its SHA-256 digest. Copy the token into a secret manager immediately. Revoke and replace it if it is lost.

Supported public endpoints (global API prefix included):

- `GET /api/v1/public/v1/invoices?limit=100` — `finance.read`
- `GET /api/v1/public/v1/payments?limit=100` — `finance.read`
- `GET /api/v1/public/v1/inventory?limit=100` — `inventory.read`
- `GET /api/v1/public/v1/purchase-orders?limit=100` — `procurement.read`

Use `Authorization: Bearer jn_live_...`. The maximum page size is 500. Responses contain only the authenticated tenant's records. Rate limits are applied per key and per UTC minute. Revocation and expiry are checked on every request.

Public API access is read-only in this increment. Write scopes are intentionally not issued until write endpoints and their idempotency contracts have been implemented and tested.

## Webhook delivery

Configure an HTTPS endpoint and a tenant-vault secret in **Platform Integrations → Webhooks**. Endpoints start disabled and must be explicitly enabled after the receiver is ready. IP literals, non-HTTPS URLs, credentials in URLs, redirects, private/reserved destinations and DNS answers containing any private/reserved address are rejected. Delivery re-resolves DNS and pins the selected public IP while retaining TLS hostname verification.

The worker sends a JSON envelope:

```json
{
  "id": "event UUID",
  "type": "payment.settled",
  "createdAt": "ISO-8601 timestamp",
  "data": {}
}
```

Headers include:

- `x-jaslyn-event-id`
- `x-jaslyn-event-type`
- `x-jaslyn-timestamp` — Unix time in milliseconds
- `x-jaslyn-signature` — `sha256=<hex>`

Signature verification uses HMAC-SHA256 over the UTF-8 bytes of `<timestamp>.<raw request body>` with the configured secret. Verify against the raw body, compare signatures in constant time, and reject stale timestamps to reduce replay risk. A 2xx response acknowledges delivery. Non-2xx, timeout and transport errors are retried with bounded exponential backoff; after eight attempts the delivery moves to `DEAD`. Delivery is at-least-once, not exactly-once; consumers should deduplicate by event ID.

Implemented event producers in this branch include verified payment settlement, invoice issue, refund request/approval, purchase order creation, supplier invoice creation/payment, inventory movements and automation rule matches. Other event types appear only when a producer explicitly enqueues them.

## Production gates

Before enabling endpoints, validate the receiver's HMAC and replay checks, inspect delivery history, test timeout and non-2xx retries, verify dead-letter handling, and confirm that the secret vault encryption key is configured and backed up. Never log raw API keys, webhook secrets or full authorization headers.
