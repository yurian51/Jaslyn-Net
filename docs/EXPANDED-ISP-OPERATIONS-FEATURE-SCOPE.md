# Jaslyn Net — Expanded ISP Operations Feature Scope

**Purpose:** expand Jaslyn Net from hotspot billing and network operations into an integrated ISP operations platform. This is a delivery backlog, not a claim that features already exist or have passed tests. Reuse current modules, data models, tenant boundaries and adapters. No AI-specific scope.

## Required delivery rules
- Audit the current implementation first and reuse existing modules; avoid duplicate domain systems.
- Each feature must include schema/migrations where needed, API, UI, RBAC/tenant scoping, audit events, telemetry/error handling, automated tests and operator documentation.
- Use real provider/device telemetry. Never present mock/demo data as live measurements.
- External integrations require credentials/contracts and sandbox or hardware-lab evidence. Mark unsupported or unconfigured providers/devices `blocked` or `unavailable`, never `complete`.
- Risky network changes require preview, authorization/approval, pre-change backup, bounded execution, read-back verification and supported rollback.
- Release only the tested commit; record staging and production smoke evidence.

## A. Network intelligence
1. **Network Digital Twin:** live topology of routers, switches, OLTs, APs, links, sites and subscribers; dependency and affected-customer view; source and freshness per edge/node.
2. **Root Cause Analysis:** correlate alarms and dependency failures into incidents; rank evidence-based probable causes and show uncertainty.
3. **Configuration Compliance and Drift:** approved desired configuration, actual-vs-desired diff, version history, backup, policy checks and safe remediation for supported adapters.
4. **Predictive Capacity Planning:** trends for utilization, busy-hour saturation, AP/client capacity and projected upgrade needs using real telemetry.
5. **Experience Quality Monitoring:** latency, jitter, packet loss, DNS and throughput probes, with site/customer drill-down and stale-data states.
6. **QoS and Bandwidth Policy Engine:** reusable speed profiles, rate limits, priority/queue policy, schedule and quota policy; adapter capability checks and read-back.
7. **Network Change Impact Simulator:** dependency-based impact preview for planned changes; identify affected sites/subscribers and require approval for risky changes.
8. **Multi-Site Optimization:** compare site health, utilization, outage, cost and subscriber quality without crossing tenant boundaries.

## B. Subscriber and customer experience
9. **Unified Subscriber 360:** packages, payments, vouchers, devices, sessions, usage, signal, tickets, outage history and entitlement lifecycle in one profile.
10. **Customer Self-Service Portal:** current package, remaining quota, sessions/devices, payments, renewal, receipts and support requests.
11. **Smart Ticketing and SLA:** customer/device/site-linked incidents, assignment, priority, SLA timers, escalation, customer updates and resolution verification.
12. **Subscription Lifecycle Automation:** renewal, expiry, grace period, suspension/reactivation and plan change driven by verified payment and explicit policy.

## C. Finance and revenue
13. **Payment Intelligence and Reconciliation:** provider callbacks, transaction-to-ledger-to-entitlement matching, duplicate/out-of-order handling, mismatch queue and controlled recovery.
14. **Revenue Assurance:** detect paid-without-service, service-without-payment, duplicate charges, inconsistent refunds, unbilled usage and ledger differences.
15. **Customer Churn and Profitability:** cohort, retention, plan performance, site-level margin and risk indicators derived from authorized billing and cost data.
16. **Cost and Energy Intelligence:** track bandwidth, equipment, power and site operating costs where source data is available; compare cost-to-serve with revenue.

## D. Device, vendor and field operations
17. **Universal Vendor Adapter Capability Registry:** per-model/per-firmware capability declarations and contract tests for discovery, monitoring, config, backup, firmware, rollback and session control.
18. **Field Service Automation:** work orders, dispatch, technician schedule, site/GPS, before/after evidence, parts used, customer sign-off and offline-safe synchronization.
19. **Asset Lifecycle Management:** serial/MAC/model, owner, site, warranty, firmware, purchase cost, assignment, movement and repair history.
20. **Preventive Maintenance:** schedules, recurring checks, backup jobs, firmware compliance and work orders from supported health signals.

## E. Security, reliability and platform operations
21. **Security Operations Lite:** detect anomalous login, brute force, unauthorized config changes, unknown devices and API abuse; evidence-linked incident queue and response audit.
22. **Fine-Grained RBAC and Privileged Access:** tenant/site/device scopes, least privilege, MFA for sensitive operations, approvals and immutable audit events.
23. **Platform Observability:** structured logs, metrics, traces, readiness/liveness, queues, worker failures, dependency health, redaction and actionable alerts.
24. **Disaster Recovery and Resilience:** encrypted backups, scheduled restore drills, migration recovery, worker restart, idempotent retries, RPO/RTO tracking and recovery evidence.
25. **Automated Incident Remediation:** policy-approved runbooks with preconditions, limits, deduplication, result verification, escalation and rollback when supported.
26. **API and Integration Marketplace:** provider/adapter catalogue, secret rotation, version compatibility, webhook health, retries, rate limits and integration test harness.
27. **Customer Communication Automation:** provider-backed SMS/WhatsApp/email for receipts, renewal, outage, maintenance and ticket updates; delivery status and opt-out controls.
28. **SLA and Uptime Intelligence:** service availability, outage minutes, MTTR, SLA windows, exclusions, evidence and customer/site reports.

## Acceptance criteria for every feature
- The existing domain implementation is reused where possible; architecture decision and source paths are recorded.
- API validation, authentication, RBAC and tenant isolation are tested, including negative/cross-tenant cases.
- Database changes have forward migration and a tested recovery/rollback plan.
- UI state is backed by real API data, with loading, empty, stale, error and retry states.
- Unit and integration tests pass; E2E test covers the user/operator journey and side effects.
- Device/provider integrations are tested individually in sandbox or hardware lab. Mocks are clearly marked and do not count as live integration proof.
- Logs, metrics, audit, alerting and support runbook are included.
- Evidence is attached to the delivery issue: commit, CI run, test result, staging workflow, production smoke and known limitations.

## Delivery order
**Gate 0:** fix CI runner startup, migrations, tenant/RBAC failures, secrets handling and deployment smoke tests.
**Gate 1:** close existing hotspot billing/payment/voucher/RADIUS/router and usage/coverage end-to-end paths.
**Gate 2:** deliver topology, root cause, observability, incidents, SLA and safe configuration controls.
**Gate 3:** deliver subscriber self-service, ticketing, field work, inventory and preventive maintenance.
**Gate 4:** deliver revenue assurance, profitability, capacity planning, QoS and integration marketplace.
**Gate 5:** deliver approved remediation, security operations and rehearsed disaster recovery.

## Status convention
Every feature must be marked `pass`, `fail`, `blocked`, or `not-run`, with owner, evidence, timestamp and tested commit. Do not label a feature end-to-end complete from documentation, a screen, a successful deploy, or compile-only checks.