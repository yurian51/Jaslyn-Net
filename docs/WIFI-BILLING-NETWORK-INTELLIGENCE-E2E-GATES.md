# WiFi Billing and Network Intelligence — End-to-End Release Gates

**Scope:** screenshot-derived WiFi billing, payments, coverage/signal, traffic analytics, safe configuration changes, operations and reporting.
**Status:** implementation/verification gates; this document is not proof that any gate has passed.
**Policy:** use existing Jaslyn Net domain modules, tenant authorization, migrations, adapters, audit trail and observability. Do not add a parallel system or AI features.

## Acceptance matrix

| Capability | End-to-end acceptance requirement | Evidence required before marking complete |
|---|---|---|
| Captive portal and packages | Mobile-first branded portal loads tenant's active packages from API; package has price/currency, duration, quota, device/session policy and expiry; checkout creates a pending purchase; duplicate submissions are safe. | UI/API/DB E2E, tenant boundary tests, mobile browser run, receipt and expiry tests. |
| Voucher lifecycle | Search/redeem validates tenant, status, expiry, quota and redemption policy; concurrent redemption cannot overuse a voucher; success creates an entitlement and access authorization. | Parallel redemption test, invalid/expired/revoked tests, access-session evidence. |
| Mobile-money payments | Provider adapter supports only configured/contracted providers; callback signature verified from raw body; amount, currency, reference and tenant match pending purchase; duplicate/out-of-order callbacks are idempotent; pending/paid/failed/refunded are distinct. | Provider sandbox evidence per provider, replay/tamper/amount mismatch tests, ledger reconciliation and webhook audit. No credentials or sandbox means Blocked, not passed. |
| Subscriber provisioning / AAA | Verified payment or valid voucher grants an entitlement, then provisions the configured RADIUS/router path; accounting updates usage; expiry/quota/suspension/refund revoke or disconnect access where supported; failures are retried safely and visible. | FreeRADIUS integration, supported router/controller hardware-lab test, authorize/accounting/interim-update and disconnect/expiry test. |
| Signal and coverage | RSSI in dBm is sourced from supported AP/controller/client telemetry, with timestamp and source; thresholds are configurable; summary, client rows and map are filtered by tenant/site/AP; stale or missing readings are explicitly shown as stale/unavailable. | Fixture/unit tests plus controller/hardware evidence; no fabricated values; map requires real coordinates. |
| Traffic analytics | Daily/monthly/yearly usage, previous period, peak day, daily bars, average baseline and drill-down derive from accounting/telemetry. Unit, tenant, site, AP and customer filters preserve boundaries; upload/download and remaining quota appear only when source data supports them. | Aggregation tests against known counters, timezone/boundary tests, large dataset query checks, UI E2E and export reconciliation. |
| Safe configuration | Preview and diff before apply; versioned backup; RBAC/approval for risky changes; bounded timeout/retry; read-back verification; audit before/after; rollback only for capabilities the adapter explicitly supports. | Adapter contract tests and hardware-lab apply/read-back/rollback. A successful command response alone is not verification. |
| Alerts and incidents | Detect supported AP/router offline, weak/stale signal, failed payment, quota/expiry and provisioning failure; deduplicate/recover alerts; attach tenant/site/customer/device context and link incident/ticket. | Scheduler/worker execution proof, trigger/resolve E2E, duplicate suppression and tenant authorization tests. |
| Reporting and audit | Tenant-scoped CSV/PDF exports for payments, usage and coverage; pagination, currency/timezone and totals are correct; formula injection is neutralized; sensitive exports/configuration/payment events are audited. | Export tests, cross-tenant deny tests, audit integrity and permission tests. |
| Security and resilience | RBAC and tenant isolation apply at API and data access; secrets are held in deployment/vault, logs redact credentials and payment data; retries use bounded backoff; workers survive restart; backup restore and migration upgrade path are rehearsed. | Cross-tenant tests, secret scan, worker restart test, disposable PostgreSQL migration smoke, timed restore and rollback evidence. |

## Required status fields per capability

Record each as pass, fail, blocked, or not-run, with evidence URL/commit and timestamp:
- code_present
- automated_tests
- tenant_security
- provider_sandbox (payments)
- hardware_lab (network telemetry/configuration/AAA)
- staging_e2e
- production_smoke
- restore_rollback (where applicable)

## Release sequence

1. Inspect existing module implementations and migrations before editing; reuse existing packages, purchases, payments, vouchers, sessions, RADIUS, routers, traffic, captive portal, audit and reporting modules.
2. Repair CI runner startup and get API/web lint, typecheck, tests, builds and disposable PostgreSQL migration smoke passing on the exact candidate SHA.
3. Close payment correctness and cross-tenant authorization failures before enabling live payment or access changes.
4. Validate each provider in sandbox individually; do not infer support for one provider from another provider's success.
5. Validate RADIUS and each adapter in a lab; catalogue-only vendors remain explicitly unsupported for live commands.
6. Run the full workflow in staging: package → payment/voucher → verified entitlement → network authorization → accounting/expiry → alert/report/audit.
7. Deploy only the tested SHA; verify API readiness, frontend, migration status, payment callback, subscriber flow and logs. Keep production rollout blocked if credentials, sandbox, hardware or database access is unavailable.

## Release rule

A green landing page, deployment status, mocked provider, fixture signal, code presence, documentation or compile-only run is not end-to-end evidence. Mark Production approved only when the relevant gates have actual recorded evidence.