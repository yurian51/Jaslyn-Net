# JASLYN NET Benchmark: Hotspot Tanzania

**Benchmark source:** https://hotspots.co.tz/  
**Reviewed:** 2026-11-04  
**Scope:** Publicly described product workflows and operator experience  
**Status:** Product requirements and execution priorities. This document does not claim the mapped features are implemented or production-verified.

## 1. Benchmark decision

Use Hotspot Tanzania as a local-market workflow benchmark for hotspot and ISP operations. Do not copy its branding, interface, code, pricing, or unverified marketing claims.

The useful benchmark is the operational journey it presents:

1. Create and manage hotspot, PPPoE and static-IP services.
2. Sell time-, data- and bandwidth-based packages.
3. Activate subscribers through payment or vouchers.
4. Enforce access and expiry on the network.
5. Operate multiple routers and sites from one workspace.
6. Diagnose offline subscribers and router failures.
7. Communicate with customers and support field teams.
8. Reconcile revenue and understand performance by package, router and period.

The public site advertises features including roaming, FUP throttling, voucher generation, multi-router synchronization and transfer, router monitoring, disconnection insights, customer self-service, WhatsApp/SMS notifications, TR-069, support tickets and revenue analytics. These are benchmark observations, not independently tested claims about the competitor.

Do not repeat competitor claims such as customer counts, uptime, dashboard speed, referral earnings or pricing as verified facts.

## 2. Product direction for JASLYN NET

JASLYN NET remains a **Connectivity & ISP Operating System**, not a feature-for-feature clone of a billing panel.

Its differentiator is the verified operational chain:

**MONEY → SERVICE → IDENTITY → NETWORK → SESSION → ACCOUNTING → ENFORCEMENT → RECONCILIATION**

A successful payment must not be confused with a verified access grant. A router command being accepted must not be confused with a verified device state. Every consequential operation must retain tenant scope, correlation ID, audit evidence and a final verified outcome.

## 3. Benchmark-to-JASLYN capability map

| Benchmark workflow | JASLYN NET target | Required implementation boundary | Priority |
|---|---|---|---|
| Hotspot, PPPoE and static IP billing | Unified service catalogue and entitlement lifecycle | Reuse the canonical customer, package, purchase, payment and access domains; do not create parallel billing records | P0 |
| Automatic payment activation and expiry | Payment Truth Engine + access enforcement | Only verified provider state can create/extend entitlement; expiry, refund and reversal must reconcile with AAA and router state | P0 |
| Multi-router customer roaming | Network-wide subscriber identity and session continuity | One subscriber/entitlement identity across sites; prevent duplicate sessions and duplicate accounting; enforce site and policy boundaries | P1 |
| Fair Usage Policy (FUP) | Quota policy and bandwidth enforcement | Track authoritative usage; apply configured throttle or suspend policy; verify the applied router/RADIUS state; disclose stale usage | P1 |
| Voucher generation and printing | Voucher batches, redemption and fulfilment | Cryptographically strong codes, hashed-at-rest secrets where appropriate, single-use/idempotent redemption, expiry, print/export and audit trail | P1 |
| Multi-router synchronization | Desired-state reconciliation | Per-router capability checks, bounded retries, drift detection and read-back verification; no blind database-to-router overwrite | P1 |
| Bulk customer/router transfer | Controlled subscriber migration | Preview mapping, validate destination plan/router, preserve entitlement and accounting history, require approval for risky bulk changes, verify each result | P1 |
| Disconnection insights | Evidence-backed subscriber diagnostics | Correlate RADIUS accounting, router events, payment/expiry, quota and session evidence; show reason, timestamp and confidence; never invent a cause | P1 |
| Real-time router and interface monitoring | Network Operations Centre | Show last-seen time, probe source, telemetry freshness and capability status; create deduplicated incidents from measured failures | P1 |
| Customer self-service | Subscriber portal | Tenant-safe balance, package, usage, payment history, receipts, renewal and support; never expose other subscribers or internal operator data | P1 |
| Branded captive portal | Portal and checkout experience | Tenant/site branding, accessible mobile UI, localized English/Swahili content, secure payment initiation and verified activation | P1 |
| WhatsApp/SMS/email/Telegram communication | Notification orchestration | Use the existing notification/outbox boundary, consent and templates, provider delivery states, retries and deduplication; avoid an unapproved WhatsApp gateway | P1 |
| TR-069/CPE management | CPE management adapter catalogue | Add only after ACS compatibility, authentication, device model coverage, safe config jobs and read-back tests exist; catalogue-only until then | P2 |
| Support tickets and technician assignment | Incident and field operations | Reuse incidents, assignments, SLA, timeline and audit modules; avoid a duplicate ticket system | P2 |
| Revenue, package and router analytics | Revenue assurance and operator reporting | Derive totals from ledger/reconciled transactions; include time range, timezone, currency and source freshness | P1 |

## 4. Full public feature inventory

The following is the complete feature inventory advertised on the public Hotspot Tanzania site, including its additional operator tools. Each row is a requirement to audit and implement in Jaslyn Net where relevant. **A mapped Jaslyn module is not proof that the complete workflow is implemented or verified.** Every row remains functionally unverified until its API, UI, authorization, persistence, external integration and failure path have been tested.

| Advertised feature | Jaslyn Net domain to audit / extend | Verification state |
|---|---|---|
| Hotspot plans and time/data-based packages | Packages, purchases, captive portal | Audit pending |
| PPPoE plans and subscriber billing | Customers, packages, access bindings, RADIUS | Audit pending |
| Static IP plans and billing | IPAM, customers, access bindings | Audit pending |
| Bandwidth plans and speed profiles | Traffic policy and network enforcement | Audit pending |
| Prepaid subscriber management | Customers, subscriptions, access bindings | Audit pending |
| Active, expired, online and offline subscriber states | Subscriptions, sessions, RADIUS accounting | Audit pending |
| Cross-router customer roaming | Subscriber identity, RADIUS, sessions, network policy | Audit pending |
| Voucher batch generation | Vouchers | Audit pending |
| Voucher printing and export | Vouchers and operator UI | Audit pending |
| Hotspot binding / device binding | Captive portal, access policy, sessions | Audit pending |
| Fair Usage Policy and automatic throttling | Traffic usage, quota policy, network enforcement | Audit pending |
| Bulk transfer between routers | Router operations and subscriber migration | Audit pending |
| Hotspot trials / trial packages | Captive portal, packages, access policy | Audit pending |
| Router online/offline monitoring | Routers, synthetic monitoring, incidents | Audit pending |
| IP pool management | IPAM | Audit pending |
| Router configuration backups and restore | Router adapters, secrets vault, audit | Audit pending |
| Wireless settings management | Vendor-specific network adapters | Audit pending |
| Bridge configuration | Vendor-specific network adapters | Audit pending |
| IP address management | IPAM | Audit pending |
| Customer self-installation | Customer commerce, captive portal, field operations | Audit pending |
| Router replacement workflow | Routers, access bindings, network jobs | Audit pending |
| Remote VPN access to routers | Secure network access / remote access gateway | Audit pending |
| TR-069 / CWMP ACS and CPE management | CPE integration adapter; separate ACS compatibility proof required | Audit pending |
| MikroTik logs | Router adapter and event ingestion | Audit pending |
| Router interface monitoring | Traffic collector, router telemetry | Audit pending |
| M-Pesa and Tigo Pesa / Mixx by Yas | Payment provider adapters and reconciliation | Audit pending |
| M-Pesa Paybill and Till collections | Payment provider configuration and callback verification | Audit pending |
| Daily and period transaction reports | Payments and revenue assurance | Audit pending |
| Activation history | Purchases, access bindings, audit | Audit pending |
| Transaction graphs and comparisons | Finance / reporting | Audit pending |
| Monthly sales charts | Revenue assurance and reporting | Audit pending |
| Best-selling package reports | Packages and reconciled revenue | Audit pending |
| Daily, weekly and monthly data usage | RADIUS accounting and traffic samples | Audit pending |
| Top downloaders | Authoritative usage accounting | Audit pending |
| Income today and this month | Financial ledger and reconciliation | Audit pending |
| Revenue per router | Ledger, router attribution and reconciliation | Audit pending |
| WhatsApp notifications and gateway | Notification outbox plus approved WhatsApp provider | Audit pending |
| SMS notifications | Notification outbox and SMS provider | Audit pending |
| Bulk SMS / WhatsApp campaigns | Consent-aware notification orchestration | Audit pending |
| Plan-specific messaging | Notification segmentation and package events | Audit pending |
| Router-specific messaging | Router/site targeting and notification outbox | Audit pending |
| Scheduled SMS | Scheduled notification jobs | Audit pending |
| SMS groups | Customer segments and consent controls | Audit pending |
| Email notifications | Notification outbox and email provider | Audit pending |
| Telegram alerts | Incident / notification integration | Audit pending |
| Support tickets and technician assignment | Incidents, assignments and SLA workflows | Audit pending |
| Custom hotspot page builder | Captive portal settings, templates and tenant assets | Audit pending |
| Bonga points / loyalty | Customer loyalty ledger and redemption policy | Audit pending |
| Multi-admin roles (SuperAdmin, Admin, Technician, Sales Agent, Reports) | Auth, access control and tenant-scoped permissions | Audit pending |
| Customer self-service portal | Customer commerce and captive portal | Audit pending |
| Hotspot troubleshooting and one-click recovery | Evidence-backed diagnostics and network command verification | Audit pending |
| Automatic reconnection SMS | Session/incident events and notification outbox | Audit pending |
| Customer location map | Customer/site geospatial data and privacy controls | Audit pending |
| English / Swahili localization | Web and notification localization | Audit pending |
| CSV export for customers, payments and prepaid users | Tenant-scoped export jobs and audit | Audit pending |
| Forced password changes, OTP, session management, CSRF and admin login audit | Auth and security posture | Audit pending |
| Referral programme and referral tracking | Promotions / partner attribution and ledger controls | Audit pending |
| Remote radio access for Ubiquiti, Tenda and Huawei | Vendor-specific secure remote access adapters | Audit pending |
| Remote MikroTik access | Router adapter and secure remote access boundary | Audit pending |

### Demo inspection access

The public marketing site links to the live demo at https://demo.ispledger.com/. The demo currently exposes a sign-in form but the public page does not disclose a demo username or password. No login has been completed and no internal feature has been independently inspected. The `admin/admin` credentials shown on the vendor's installation guide are described as first-login defaults for a newly installed customer panel; they are **not** verified demo credentials and must not be assumed to work on the public demo. Obtain the vendor's published demo credentials or an authorized test account before attempting access.

## 5. Execution order

### P0 — Protect money, identity and access

- Trace payment initiation, provider verification, ledger posting, purchase/entitlement and AAA/network enforcement end to end.
- Verify Daraja/M-Pesa and every other payment provider against its actual callback signature/status-query contract before enabling live settlement.
- Add replay, duplicate, out-of-order, timeout, refund and reconciliation-drift tests.
- Prove tenant isolation for customers, payments, vouchers, sessions, routers, reports and support records.
- Verify that expiry, suspension and refund revoke or change network access correctly.
- Keep the capability registry honest: Native + Tested, Beta / Limited, Catalogue only, or Unavailable.

### P1 — Close the operator workflow gaps

1. Complete voucher lifecycle: batch creation, print layout, redemption, expiry and reporting.
2. Implement usage accounting and policy-driven FUP, including throttle verification and quota reset rules.
3. Implement network-wide subscriber identity and roaming with duplicate-session protection.
4. Add explainable disconnection diagnostics using real RADIUS/router/payment evidence.
5. Add safe multi-router synchronization and a preview-first bulk transfer workflow.
6. Complete the subscriber self-service journey and branded captive portal.
7. Add package/router revenue reports based on reconciled financial records.
8. Connect customer messaging through the existing notification outbox with consent, delivery state and deduplication.

### P2 — Expand network operations

- Evaluate TR-069/CWMP ACS and CPE provisioning against supported device models.
- Add site-local probes where central monitoring cannot prove customer-site reachability.
- Expand technician workflows, ticket SLAs and maintenance windows.
- Add capacity planning only when enough clean historical telemetry exists.

## 6. Mandatory capability truth

Every benchmark item must have a registry record with:

- Capability key and tenant/site scope.
- Status: **Native + Tested**, **Beta / Limited**, **Catalogue only**, or **Unavailable**.
- Supported vendors, models, protocols and versions.
- Required configuration and secret references.
- Last successful verification timestamp and evidence reference.
- Known limitations and failure modes.
- Automated test coverage and external test requirement.

A logo, settings form, API route, documentation entry or successful HTTP response is not proof of an operational integration.

## 7. Acceptance criteria

A benchmark capability is complete only when its applicable checks pass:

- **Payments:** duplicate or unverified events never duplicate ledger postings or grant access.
- **Roaming:** a subscriber can move between authorized routers without creating conflicting entitlement/accounting state.
- **FUP:** usage is attributable to a subscriber and policy; throttling is read back and verified; unknown usage fails safely.
- **Vouchers:** codes are unpredictable, redemption is atomic and replay-safe, and print/export does not leak sensitive data.
- **Router sync/transfer:** destination compatibility is checked first; each command has a correlation ID and verified final state; partial failure is visible and recoverable.
- **Diagnostics:** every asserted cause links to timestamped source evidence; missing evidence is reported as unknown.
- **Monitoring:** every status has a last-seen timestamp and freshness; stale telemetry is never presented as live.
- **Self-service:** tenant and object-level authorization tests prevent cross-subscriber access.
- **Notifications:** retries do not send duplicate transactional messages; consent and provider delivery states are respected.
- **Analytics:** revenue agrees with the authoritative ledger and reports disclose timezone, currency and period.
- **TR-069:** device model/version compatibility, authentication, parameter access and safe write/read-back are tested before operational status is granted.

## 8. Release discipline

- Do not seed fake subscribers, payments, router telemetry, uptime or revenue to make dashboards look populated.
- Do not run bulk router writes, payment mutations or access changes against production as a benchmark exercise.
- Use disposable databases, provider sandboxes and lab routers for integration tests.
- Run repository build, typecheck, unit/integration tests, migration smoke tests and security checks.
- Record commit SHA, CI run, test counts and external provider/device evidence.
- If a check cannot run, report it as blocked or unverified. Do not describe the benchmark roadmap as shipped functionality.

## 9. Source

- Hotspot Tanzania public product site: https://hotspots.co.tz/ (reviewed 2026-11-04).
