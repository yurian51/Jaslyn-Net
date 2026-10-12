# Jaslyn Net — India Market Research: Evidence-Based Capability Comparison

Research date: 2026-10-12
Purpose: compare actual product positioning and documented integration patterns against Jaslyn Net's existing architecture. This is desk research based on public sources, not hands-on vendor acceptance testing. Vendor marketing claims are not independent verification.

## Executive conclusion

Do not integrate all 140 candidates. Build/retain Jaslyn Net as the system of record and adopt proven patterns from a small number of relevant products. Most promising research references:
1. OrbOS / Tathya — closest broad ISP operations benchmark across RADIUS, subscriber billing, reseller hierarchies, provisioning, fiber GIS, CPE management, inventory and notifications.
2. Log2Space / Spacecom — ISP billing/subscriber and reseller workflows; obtain a technical demo/API specification before making integration decisions.
3. XIMS / Xonware — evaluate ISP workflow coverage and supported interfaces, but verify exact feature and API evidence with vendor.
4. FreeRADIUS — protocol-level AAA foundation; integrate through supported RADIUS accounting/control patterns rather than duplicate AAA.
5. OpenWISP — API-driven network management and organization-level multi-tenancy; evaluate as a reference or optional integration rather than automatically embedding it.
6. Razorpay / Cashfree / Juspay — payment-provider candidates for India; keep providers behind an adapter and country/currency capability checks. These are not replacements for Jaslyn Net's own immutable ledger and reconciliation.
7. ERPNext — strong reference for purchasing, supplier invoices, stock valuation and accounting ledger semantics; prefer native, narrow integration only if Jaslyn Net's finance/inventory gap justifies it.
8. n8n / Node-RED / Temporal — benchmark workflow capabilities; Jaslyn Net's documented direction is a native tenant-safe workflow engine, so avoid embedding a second orchestration runtime without a specific business case.
9. NetBox / Nautobot — source-of-truth/IPAM and automation patterns for larger network inventories.
10. Observability stack (OpenTelemetry, Prometheus, Grafana, Loki, Sentry) — use standards and instrumentation where they close measured operational gaps.

## Detailed candidate assessment

### 1. Tathya Technologies — OrbOS
**Publicly described capabilities:** RADIUS authentication/accounting, per-vendor reply adapters, live sessions, recurring/prepaid/postpaid billing, reseller/franchise tenant trees, provisioning for hotspot/PPPoE, IP allocation, fiber GIS, TR-069 ACS/CPE care, OLT SNMP monitoring, inventory with installation cost tracking, lifecycle notifications and migration from legacy systems.
**Fit:** Very high as a benchmark for ISP domain completeness. The documented model aligns with Jaslyn Net's RADIUS, subscriber lifecycle, vendor adapters, reseller, inventory and field-operations scope.
**Adopt as requirements, not copied implementation:** parent/child ISP tenancy, subscriber-by-subscriber migration, vendor-specific RADIUS reply attributes, conflict checks for username/IP/MAC, equipment cost frozen at installation, fibre asset topology and proof-backed provisioning.
**Risks/unknowns:** public marketing statements need demo/reference validation; no verified public API contract or license for reusing their code was established in this review. Do not assume API access or compatibility.
**Decision:** benchmark now; no direct dependency until a real integration case and vendor API access are proven.
Source: https://tathyatechnologies.com/products/orbos/

### 2. Spacecom — Log2Space
**Public positioning:** ISP billing/subscriber operations and reseller/franchise workflows. The available source reviewed in this pass did not establish a complete, versioned API contract.
**Fit:** High as a competitor benchmark for subscriber billing and commercial operations.
**Investigate next:** package lifecycle, tax/invoice handling, reseller commissions, payment reconciliation, RADIUS/AAA, bulk import, API/webhooks, and migration tools.
**Decision:** request official technical documentation/demo; don't claim API integration from marketing pages alone.
Sources: https://www.spacecom.in/ and https://www.spacecom.in/product/log2space

### 3. Xonware — XIMS
**Public positioning:** ISP management. Detailed current API/feature claims require a product demo or vendor documentation before scoring.
**Fit:** Medium-high benchmark candidate.
**Investigate next:** subscriber lifecycle, network provisioning, router support, reseller hierarchy, payment events, export/migration and API authentication.
**Decision:** keep in evaluation queue; no integration approved yet.
Source: https://xonware.com/

### 4. FreeRADIUS
**Role:** standards-based RADIUS AAA implementation, not a full ISP billing product.
**Fit:** Very high for AAA correctness and compatibility. Jaslyn Net already identifies FreeRADIUS in its architecture.
**Required verification:** Access-Accept/Reject, accounting Start/Interim/Stop, NAS identity validation, duplicate/out-of-order accounting packets, session timeout/CoA/Disconnect where supported, SQL/query performance, tenant mapping, and failure behavior when the database is unavailable.
**Decision:** improve integration and contract tests rather than adding a second AAA platform.
Source: https://freeradius.org/

### 5. OpenWISP
**Documented strengths:** REST API, browsable/OpenAPI documentation, organization-based multi-tenancy and role membership; monitoring APIs support organization/location filters.
**Fit:** High as a network-management/API design reference; possible optional integration for fleet configuration/monitoring.
**Trade-offs:** additional deployment and identity model, synchronization/ownership complexity, and duplicated device inventory if used as a second source of truth.
**Decision:** compare its APIs and organization model with Jaslyn's vendor adapter fabric; integrate only for a clear capability gap.
Sources: https://openwisp.io/docs/26.09/network-topology/user/rest-api.html ; https://openwisp.io/docs/24.11/users/user/basic-concepts.html

### 6. Razorpay
**Documented integration pattern:** signed webhook validation using the raw request body, event identifiers to detect duplicates, asynchronous webhook retries, and API verification for critical user-facing payment state.
**Fit:** High as an adapter/reference pattern for India. Provider availability and eligibility for a Tanzania-based merchant must be verified; do not assume it can process local TZS/mobile-money flows.
**Adopt:** signature verification before parsing, event-ID uniqueness, durable inbox, idempotent processing, provider API status verification for ambiguous outcomes, refund events, replay-safe retries and reconciliation against settlement reports.
**Do not outsource:** Jaslyn Net's ledger, tenant isolation, access grant decision, or reconciliation truth.
Sources: https://github.com/razorpay/markdown-docs/blob/master/payments/payment-gateway/s2s-integration/recurring-payments/webhooks.md ; https://razorpay.com/subscriptions/

### 7. Juspay / Cashfree gateway integrations
**Documented patterns:** callbacks/webhooks for payment and refund states; settlement/MIS files via SFTP in some integration flows; explicit sandbox and production credentials; recurring mandates have consent and supported-app limitations.
**Fit:** Medium-high for India payment orchestration; country/provider/merchant eligibility is a gating condition.
**Adopt:** distinct transaction vs settlement reconciliation, signed callbacks, sandbox contract tests, explicit mandate consent/state, and separate provider adapter capabilities.
**Decision:** do not make UPI assumptions for Tanzania. Support only provider methods enabled for the merchant's region and currency.
Sources: https://docs.juspay.io/upi-consumer-stack/docs/overview/onboarding-guide-issuance ; https://www.juspay.io/in/docs/upi-autopay/docs/how-to-integrate/papg-step

### 8. ERPNext
**Documented strengths:** submitted accounting transactions generate balanced debit/credit ledger entries; purchasing separates purchase orders, receipts, supplier invoices and payment; perpetual inventory posts accounting effects for stock transactions.
**Fit:** High as a finance/inventory acceptance benchmark, not necessarily as a platform dependency.
**Adopt:** explicit purchase lifecycle; supplier payable and aging; stock valuation and landed costs; immutable posted entries with controlled reversal/credit notes; reconciliation of payment allocation; ledger balance assertions.
**Risks:** integrating a second ERP may duplicate customers, invoices, chart of accounts, inventory and tax treatment. Establish a clear source-of-truth boundary before any connector.
Sources: https://docs.frappe.io/erpnext/accounting-entries ; https://docs.frappe.io/erpnext/purchase-cycle-ledger-impact ; https://docs.frappe.io/erpnext/accounting-of-inventory-stock

### 9. 6D Technologies / Comviva BlueMarble
**Public positioning:** enterprise telecom BSS, billing/charging, customer and product management, partner relationships, digital commerce and open-standard/TM Forum API positioning.
**Fit:** Medium for Jaslyn Net's current hotspot/ISP operator segment; high as a long-term enterprise BSS architecture benchmark.
**Trade-offs:** likely enterprise procurement and integration scope; much broader than an initial SMB ISP feature gap.
**Decision:** extract requirements around product catalogue, customer lifecycle and partner settlement; don't pursue heavyweight dependency unless target operators demand it.
Sources: https://www.6dtechnologies.com/products-solutions/digital-bss-solutions/ ; https://www.techmahindra.com/industries/communications/digital-platforms/

### 10. n8n / Node-RED / Temporal
**Fit:** high as workflow-engine design references.
**Jaslyn Net boundary:** existing product spec explicitly calls for a native tenant-safe workflow engine and says external systems should be benchmarks rather than embedded hosted runtimes.
**Adopt:** graph-based flows, durable execution, version pinning, bounded retries, dead-letter/replay, event idempotency, approval gates, secret redaction, outbound SSRF controls and per-tenant quotas.
**Decision:** implement missing guarantees in the native engine; don't run arbitrary user code or grant unrestricted outbound networking.
Sources: https://n8n.io/ ; https://nodered.org/ ; https://docs.temporal.io/

## Feature convergence plan for Jaslyn Net

| Priority | Converged capability | Benchmark | Acceptance evidence required |
|---|---|---|---|
| P0 | Payment webhook inbox, signature verification, event idempotency, provider status lookup | Razorpay/Juspay | duplicate/replay/concurrency tests; no duplicate ledger or access grant |
| P0 | Reconciliation across provider transactions, settlements, ledger and access grants | Payment platforms + ERPNext | discrepancy report, audit evidence, no silent auto-correction |
| P0 | RADIUS session accounting and revocation correctness | OrbOS + FreeRADIUS | Start/Interim/Stop, duplicate/out-of-order, disconnect and expiry tests |
| P0 | Tenant boundary tests for subscribers, sessions, credentials, workflow runs and finance | OrbOS + OpenWISP | cross-tenant negative tests at API and DB layers |
| P1 | Executable-vs-catalogue vendor adapter contracts and device outcome verification | OrbOS + OpenWISP | per-vendor contract tests and truthful capability status |
| P1 | Subscriber/reseller migration and conflict detection | OrbOS/Log2Space | dry-run import, conflict report, idempotent re-import and rollback |
| P1 | Stock valuation, supplier invoices, purchase orders, credits and debt aging | ERPNext | balanced ledger, frozen cost basis, audit and period reports |
| P1 | Durable workflows with retry/dead-letter/replay/approval and secrets controls | n8n/Temporal patterns | crash recovery, version immutability, SSRF tests, tenant quotas |
| P2 | Fibre GIS, OLT/ONU topology and TR-069/TR-369 CPE provisioning | OrbOS/ACS references | supported-device matrix and lab test for each model/firmware |
| P2 | India-specific UPI/GST features | Indian providers | regional feature flags, merchant eligibility and tax/legal review |

## Explicit non-decisions
- No third-party product is being embedded or copied by this document.
- No provider is considered production-enabled based on public marketing alone.
- No India-specific tax/payment feature should be forced onto Tanzania tenants.
- No feature is marked implemented without matching source paths and passing tests.
- This document is a prioritized desk-research result; vendor demos, API verification and code-level implementation review remain necessary.
