# JASLYN NET Product Strategy, Competitive Benchmark & Delivery Plan

**Owner:** YURIAN TECH LTD  
**Product:** JASLYN NET  
**Tagline:** Connect. Control. Grow.  
**Last consolidated:** 2026-10-10  
**Status:** Strategy and implementation specification; not a claim that every listed capability is implemented or production-verified.

## 1. Product vision

Build a dependable, mobile-first Connectivity & ISP Operating System for hotspot owners, Wi-Fi resellers, multi-site operators and ISPs. JASLYN should combine customer billing, payment verification, access control, network operations and business reporting in one control plane.

**Positioning:** reliability first, automation second, evidence-based AI third, then scale.

The competitive promise is not “the longest feature list.” It is:
1. Money and payment state reconcile correctly.
2. Access is granted, extended, suspended and revoked only from authoritative state.
3. Router status reflects verified device evidence.
4. Operators can understand and manage the business from a phone, including on slow connections.
5. AI explains evidence and proposes safe actions; it does not invent network state or silently make risky changes.

## 2. Target users and jobs to be done

- **Small hotspot owner:** create a package, sell a voucher, confirm payment, see active users and earnings without needing a network engineer.
- **Wi-Fi reseller/agent:** sell approved plans, track commission and settlement, and see only assigned sites/customers.
- **Multi-site operator:** centrally manage routers, access policy, support incidents and site-level profitability.
- **ISP/NOC operator:** diagnose outages, inspect sessions/accounting, control access and audit changes.
- **Administrator/finance:** reconcile payment provider reports against the ledger, identify discrepancies and export audit evidence.

### Reference pilot profile (operational scenario, not a product guarantee)

A small operator in Nduruma, Arusha, planning for about 30 customers, an Airtel 4G uplink, a TSh 300,000–700,000 equipment budget and a 200–500 m coverage goal with trees/buildings in the path. This scenario should inform usability and onboarding examples, but actual RF coverage depends on site survey, line of sight, interference, equipment and lawful installation. The software cannot compensate for an inadequate radio design or upstream internet connection.

## 3. Competitor benchmark

This benchmark summarizes public product positioning reviewed on 2026-10-10. Marketing statements and prices are snapshots, not independently verified service-level or performance results.

| Competitor | Public positioning observed | Lessons for JASLYN |
|---|---|---|
| WoteFy | Omada-focused branded portal, reseller app and operations/sales workflows | Make reseller work mobile-first; keep controller-specific capabilities explicitly scoped |
| Kitonga WiFi | WireGuard, MikroTik provisioning, vouchers, dealers/multi-site; public pricing claims include TSh 20,000 one-time plus 3% earnings for a premium tier | Secure remote connectivity, simple voucher flows, clear fee disclosure |
| Nexor Cloud | Omada-oriented multi-site management and automated deployment/billing; public page advertises per-site pricing | Site-level setup and repeatable deployment; validate every claimed integration independently |
| Benny WiFi | MikroTik API, RADIUS, payment gateway claims, voucher printing and anti-sharing | Voucher printing, device/session limits, useful local workflows |
| ChinoWiFi | Branded captive portal, mobile money, RADIUS, time/data/combo plans, SMS and multi-site roles | Complete package options, branded customer journey and role separation |
| KazFii | Mobile-money-oriented hotspot management, mobile-first/low-bandwidth emphasis, analytics and router health | Graceful operation on weak networks; show freshness of health data |
| LubFy | Public positioning indicates a planned MikroTik billing/network-management product; detailed live capability and price evidence was limited | Do not assume launch status or feature parity without verification |
| Sensible Hotspot | Ruijie/WiFiDog orientation and mobile-money hotspot billing; published installation/monthly price ranges | Support clear setup costs and ongoing subscription costs |
| UpesiLipa | Merchant-directed payments, RADIUS and multiple hardware/vendor positioning; public tiers shown from free to paid monthly plans | Prefer transparent settlement and payment flow; avoid custody claims unless legally/technically accurate |
| WiFi Business | Starter/Growth/Business-style packages, voucher printing, payment integration, anti-sharing, remote management and team roles | Package limits should be understandable; make permissions and reseller controls first-class |

Sources for current public research:
- WoteFy: https://ssdomada.site/
- Kitonga WiFi: https://kitongawifi.net/
- Nexor Cloud: https://nexordigital.online/
- Benny WiFi: https://bennywifi.co.tz/
- ChinoWiFi: https://chinowifi.com/
- KazFii: https://kazfii.com/
- LubFy: https://www.linkedin.com/company/unida-tech/ (public company/product updates; current product details were limited)
- Sensible Hotspot: https://www.sensiblehotspot.cloud/
- UpesiLipa: https://upesilipa.com/ and https://upesinet.com/
- WiFi Business: https://wifibusiness.online/

## 4. Differentiation strategy

### A. Payment Truth Engine
- Provider-specific verified payment state, idempotent event processing and status reconciliation.
- Append-only financial ledger semantics with explainable corrections/reversals.
- Separate “provider request accepted,” “payment pending,” “payment verified,” “settled,” “failed,” and “refunded” states.
- Access grants derive from the authoritative purchase/payment lifecycle, never from an unverified callback.
- Show operator why a payment is pending or rejected and what evidence is missing.

### B. Verified Network Command Fabric
- Each vendor/feature has a capability contract and adapter test suite.
- Separate command submitted, device acknowledged and state verified.
- Store redacted evidence, timestamps, retries and final outcome.
- Capability statuses: **Native + Tested**, **Beta / Limited**, **Catalogue only**, **Unavailable**.
- Never label a router “connected” solely because credentials were saved.

### C. Evidence-first AI NOC
- Start read-only: summarize telemetry, sessions, incidents, payment anomalies and logs that are actually available.
- Each finding links to its source evidence, observation time and confidence/limitations.
- Suggestions include expected impact, preconditions and verification steps.
- Mutating actions require policy checks, RBAC, explicit approval where risky, audit record and rollback plan when technically possible.
- AI cannot bypass tenant scope, payment verification, authorization or device verification.

### D. Operator-first experience
- Mobile-first, fast pages and usable flows on slow connections.
- Swahili and English support.
- Guided setup with connectivity checks, safe demo/sandbox mode and clear next steps.
- Voucher print/export, simple plans, customer/device/session limits and easy expiry handling.
- Surface network/payment freshness rather than presenting stale values as live.

## 5. Delivery order

### P0 — Trust and production foundations
1. Map and test payment request → verified event/status → ledger → purchase → entitlement → access enforcement.
2. Enforce callback authenticity, replay protection, idempotency keys and database uniqueness constraints.
3. Reconcile provider statements/status against internal payment and ledger records.
4. Test tenant isolation and object-level authorization across every sensitive resource.
5. Harden RouterOS and RADIUS execution: timeouts, bounded retries, secret isolation, audit and device-state read-back.
6. Verify expiry, suspension, refund and revoked-access lifecycle; ensure durable background jobs.
7. Validate environment configuration, rate limiting, logging/metrics/tracing, backups, restore drills and deployment smoke tests.
8. Make the capability registry truthful and evidence-backed.

### P1 — Usable revenue workflows
1. First-run setup wizard and preflight checks.
2. Package types: time-based, data-based and combined quotas.
3. Voucher batches, secure generation, CSV export and printable layouts.
4. Branded captive portal and mobile-money payment flow for only verified providers.
5. Customer/device limits and anti-sharing policies with clear operator controls.
6. Agent/dealer roles, commissions, settlement reports and net revenue.
7. Notifications/SMS with consent, delivery status and retry handling.
8. Site dashboard showing sales, active sessions, incidents and data freshness.

### P2 — Differentiated operations and scale
1. Read-only AI diagnostics and evidence-linked incident summaries.
2. Payment anomaly and ledger reconciliation assistant.
3. Capacity planner using measured traffic and disclosed assumptions.
4. Revenue analyst with period, source and calculation transparency.
5. Approval-gated configuration assistant with dry-run and rollback where possible.
6. Multi-site topology, maintenance windows, incident timelines, public API/webhooks and disaster recovery exercises.

## 6. Pricing hypotheses to validate (not approved pricing)

Potential Tanzania-oriented tiers discussed as starting hypotheses:
- **Free / Lab:** one router, limited test use; no promise of production support.
- **Starter:** TSh 5,000–10,000/month for a small operator.
- **Growth:** TSh 15,000–30,000/month for more routers/sites and business controls.
- **ISP / Enterprise:** custom pricing based on sites, active subscribers, support and integration scope.

These prices are hypotheses only. Validate infrastructure cost, support burden, payment-provider fees, local willingness to pay and competitor terms before publishing. Avoid confusing one-time setup fees, subscription fees, transaction fees and wallet balances.

## 7. 90-day delivery sequence

- **Days 1–30: Reliability:** payment lifecycle, tenant isolation, network command verification, durable jobs and release gates.
- **Days 31–60: Operator experience:** onboarding, voucher/package flows, truthful integration statuses, agent controls and financial reporting.
- **Days 61–90: Controlled differentiation:** read-only AI NOC, evidence links, approval-gated actions, pilot feedback and measured rollout.

This is a sequencing plan, not a guarantee of completion within 90 calendar days; scope depends on the state of the code, test results and external provider/hardware access.

## 8. Measurable acceptance criteria

- No access grant from pending, failed or unverified payment state.
- Duplicate callbacks/retries create no duplicate settlement or access grant.
- Refund/expiry/suspension changes eventually reconcile with verified network enforcement; failures surface as incidents rather than false success.
- Cross-tenant read/write tests fail closed.
- Router command result distinguishes submitted, acknowledged and verified states.
- Capability status is supported by a reproducible test and last-verified timestamp.
- Backup restoration and production smoke tests have recorded evidence.
- First-run setup target: under 10 minutes for a supported, prepared lab configuration; measure before claiming.
- AI findings show source evidence and timestamps; high-risk changes require approval and audit.
- Mobile workflows remain usable on constrained connections and report stale data clearly.

## 9. Engineering and documentation rules

- PostgreSQL remains the system of record; do not create competing sources of truth for money, purchases or sessions.
- A provider catalog entry is not a real adapter. A device catalog entry is not a working integration.
- Never store production secrets or tokens in Git, docs, screenshots or logs.
- Do not silently invent external API endpoints. Verify provider contract, authentication, callback signature and status lookup before implementing.
- Do not claim tests passed unless they were run and the output was reviewed.
- Do not call AI capabilities production-ready without end-to-end tests and risk-policy enforcement.
- Fix product documentation conflicts when they are discovered.
- Prefer reliable end-to-end slices over disconnected feature flags or cosmetic commits.

## 10. Next engineering action

Execute the P0 audit against source code: identify concrete service/controller/schema/test paths for payment verification, idempotency, tenant boundaries, router command execution and access lifecycle. For each gap, add a focused regression test, implement the smallest safe fix, run the relevant tests and record evidence. Do not begin broad AI automation until P0 invariants are demonstrated.
