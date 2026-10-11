# Enterprise Features Execution — Financial, MSP and Operations

**Branch:** `work/enterprise-financial-msp-capabilities`  
**Base:** `work/security-ops-capabilities`  
**AI:** No new AI features.  
**Release state:** Implementation staged; not yet production-verified.

## New migrations

Apply in order after the security/operations branch migrations 062–070:

- `071_financial_procurement_msp_platform.sql`
- `072_network_experience_capacity_power_sla.sql`
- `073_event_driven_automation.sql`
- `074_tenant_usage_quotas.sql`

Review these against a disposable PostgreSQL database first. Migration files existing in Git do not mean they have been applied to any environment.

## Included backend and frontend work

| Capability | Implemented in this branch | Remaining production gate |
|---|---|---|
| Receivables aging | Uses the existing `invoices` domain, tracks `amount_paid` from verified settlements linked to a purchase, and subtracts applied credit notes from open balance | Verify against existing invoice/payment data and run settlement integration tests |
| Customer credits | Tenant-scoped credit notes with draft → issued → applied lifecycle and balance checks | Tax/accounting policy review; migration and concurrent-credit tests |
| Supplier procurement | Suppliers, purchase orders, lines, approval request/approval, supplier invoices and duplicate-safe supplier invoice payments | No bank transfer/provider settlement is executed by these records |
| Inventory | Tenant-scoped SKUs, stock movement ledger, non-negative stock checks, idempotency, weighted-average valuation and PO receiving into inventory | FIFO is intentionally not advertised; physical counts and live warehouse/device sources need integration |
| Financial audit | Database-triggered append-only audit rows, per-tenant SHA-256 chain and a verification endpoint/UI | Execute tamper, concurrency, actor attribution and restore tests |
| CSV/PDF reports | Tenant-scoped current-domain CSV export with spreadsheet-formula neutralization; print-to-PDF | Validate print layouts and data export permissions in browser tests |
| White label | Per-tenant branding, primary color and unique portal-domain configuration | Domain ownership verification, TLS issuance and full branding propagation remain deployment work |
| Tenant hierarchy | Child tenant can request a parent; parent tenant owner/admin approves; cycle checks prevent circular hierarchy | No automatic inheritance of user permissions; delegated admin scopes need separate policy tests |
| API marketplace | One-time API key issuance, digest-only storage, revocation, expiry and per-minute rate limit; public v1 read endpoints for invoices, payments, inventory and purchase orders | API write scopes are not exposed through the public API yet; run abuse/rate-limit and tenant-isolation tests |
| Webhooks | HTTPS/public-host validation, tenant-vault signing secret reference, disabled-by-default endpoints, HMAC signatures, pinned public DNS resolution, bounded retries and dead-letter status | Delivery worker and provider callback behaviour need network integration tests |
| Wi-Fi experience | Tenant-scoped anonymized client hash observations, RSSI/noise/airtime/channel utilization and roaming metrics | Vendor-specific polling adapters are not automatically connected to the observation ingest endpoints |
| Capacity planning | Deterministic 30-day least-squares utilization trend and bounded 30-day estimate; explicitly not AI | Needs real time-series data, sample-quality tests and load tests |
| Device lifecycle | Firmware, warranty, end-of-sale/end-of-support and vulnerability status records | Vendor EOL baselines and live firmware inventory import are not included |
| Power/environment | Tenant-scoped UPS, battery, temperature, humidity, generator, voltage and power-draw sample ingest/status | Real sensor/SNMP/Modbus integrations and alert thresholds must be configured |
| Service SLA | Tenant-specific uptime, response, resolution and service-credit policies | Policy CRUD exists; automatic credit issuance and end-to-end incident SLA calculation require separate verification |
| Event automation | Deterministic event conditions and allowlisted `CREATE_ALERT` / `EMIT_WEBHOOK` actions, durable receipts, retries, run history and alert resolution | Load/replay tests and end-to-end domain-event producer coverage are required |
| Disaster recovery | PostgreSQL custom-format backup with archive/checksum verification and safe disposable restore-drill script | HA replication/failover is not provisioned automatically; define and rehearse RPO/RTO |
| Incident/security/compliance | Builds on the security/operations branch: sessions, secret vault, permissions, incidents/SLA, maintenance/status, synthetic checks, policy drift and revenue assurance | Those existing capabilities still need the previously documented CI, migration, runtime and live-integration gates |
| Customer portal/service catalog | Existing customer commerce, customer, package, billing and incident surfaces remain in the base | This branch does not claim every portal workflow or all service-catalog/SLA integration is newly implemented |

## Key API routes

Authenticated application APIs use the global `/api/v1` prefix:

- `GET/POST /procurement/suppliers`
- `GET/POST /procurement/purchase-orders`
- `POST /procurement/purchase-orders/:id/lines`
- `POST /procurement/purchase-orders/:id/request-approval`
- `POST /procurement/purchase-orders/:id/approve`
- `POST /procurement/purchase-orders/:id/receive`
- `GET/POST /procurement/supplier-invoices`
- `POST /procurement/supplier-invoices/:id/payments`
- `GET /finance-ops/accounts-receivable/aging` and `GET /finance-ops/accounts-payable/aging`
- `GET/POST /finance-ops/credit-notes`, plus `/:id/issue` and `/:id/apply`
- `GET /finance-ops/audit` and `GET /finance-ops/audit/verify`
- `GET/POST /inventory/items`, `GET /inventory/movements`, and `POST /inventory/items/:id/movements`
- `GET/POST /msp/branding` and `GET/POST /msp/hierarchy` request/approval routes
- `GET/POST /platform-integrations/api-keys`, key revocation, and webhook endpoint configuration
- `GET /public/v1/invoices`, `/payments`, `/inventory`, `/purchase-orders` using a tenant-scoped `Bearer jn_live_...` API key
- `POST /operations-intelligence/telemetry`, `GET/POST /network-experience/wifi`, `GET /network-capacity/forecast`, `GET/POST /power/status` / `samples`, `GET/POST /device-lifecycle`, `GET/POST /service-sla/policies`
- `GET/POST /automation/rules`, enable/disable, `GET /automation/runs`, `GET /automation/alerts`, and alert resolution

## Required acceptance gates before production

1. Restore GitHub Actions job startup; no successful CI is claimed for this branch yet.
2. Run API lint, typecheck, unit tests and build; run web lint/typecheck/tests/build.
3. Apply migrations 062–073 in order to disposable PostgreSQL; verify fresh install, upgrade, rollback and tenant-scoped constraints.
4. Test concurrent duplicate payments/refunds/stock movements, invoice partial settlement, credit-note over-allocation and supplier invoice payment limits.
5. Verify cross-tenant denial for every route, public API key expiry/revocation/rate limits, webhook SSRF protections/signatures/retries and automation event replay.
6. Verify SHA-256 audit-chain tamper detection, database backup archive verification and actual restore drills.
7. Connect real vendor/sensor data sources and run controller/sensor contract tests before describing Wi-Fi/power/capacity metrics as live.
8. Record exact commit SHA, CI run, test counts, migration results and staging evidence. Do not enable live external actions until approved.
