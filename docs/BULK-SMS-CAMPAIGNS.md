# Bulk SMS campaign implementation

## Scope

The notifications surface now supports tenant-scoped bulk SMS campaigns on top of the existing SMS outbox and Beem provider adapter.

- API: `POST /notifications/sms/bulk`, `GET /notifications/sms/campaigns`.
- Each campaign accepts 1–1,000 unique Tanzanian mobile recipients and queues one idempotent outbox item per normalized number.
- Campaign creation and queue inserts use one PostgreSQL transaction.
- Repeated idempotency keys return the existing campaign instead of creating a second batch.
- Marketing campaigns are rejected unless every recipient has recorded SMS marketing opt-in for the authenticated tenant.
- The dashboard includes a campaign composer, explicit operator confirmation, recipient count, category, queue progress and provider-acceptance counts.
- The worker remains disabled unless `SMS_ENABLED=true`, the Beem API key and secret are present, and a sender ID is configured.
- The UI distinguishes provider acceptance from handset delivery. Delivery receipts are not claimed unless a provider delivery-report integration confirms them.

## Configure

Set these values in the API runtime secret manager; do not commit real values:

```dotenv
SMS_ENABLED=false
SMS_PROVIDER=beem
BEEM_API_KEY=
BEEM_SECRET_KEY=
BEEM_SENDER_ID=
BEEM_SMS_ENDPOINT=https://apisms.beem.africa/v1/send
```

Request and activate the sender ID with Beem before enabling production dispatch. Start with a small, consented test group, verify provider acceptance and billing, then enable production dispatch deliberately.

## Safety notes

- Campaign endpoints are protected by the existing authenticated `OWNER`/`ADMIN` roles.
- Recipient validation and all campaign/outbox reads are scoped to the authenticated tenant.
- Marketing opt-in is checked server-side, even if the browser confirmation is checked.
- Messages are limited to 1,600 characters; long text may be billed as multiple SMS segments.
- The bulk API queues messages; it does not itself prove delivery to a handset.

## Verification status

Source-level implementation and regression assertions have been added. The API unit tests, UI verification script, typecheck, lint and production build still need to run in a working CI environment. The latest GitHub Actions runs for this branch reported `startup_failure` before jobs executed, so no runtime/test pass is claimed. No real SMS has been sent because no provider credentials or sender approval were supplied.
