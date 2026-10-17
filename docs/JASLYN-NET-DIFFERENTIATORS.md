# Jaslyn Net — Differentiated Product Features

**Purpose:** define product differentiators for Jaslyn Net, not generic ISP feature checkboxes. These are proposed product capabilities and are not claims that implementation exists. "Unique" here means a deliberate Jaslyn Net product identity; global exclusivity cannot be guaranteed without market and patent research.

## Product principle

Jaslyn Net should be the operator's **evidence-driven network-to-cash control plane**: connect what the network did, what the subscriber experienced, what the billing system charged, what the payment provider settled, and what the operator can prove—using a shared timeline, tenant-safe evidence and reversible operations.

## Proposed Jaslyn Net signature features

### JN-01. Network-to-Cash Evidence Graph
Connect a network event or service change to affected site, device, subscriber, session, entitlement, invoice, payment, settlement and support ticket. Each relationship carries source, timestamp, freshness and confidence. Operators can trace both directions: "who lost service?" and "why was this customer charged/refunded?" Never infer a link without evidence.

### JN-02. Subscriber Service Truth Ledger
A canonical, append-only timeline of entitlement decisions: package purchased, payment verified, AAA authorization, session start/stop, quota consumption, suspension, restoration and manual override. Detect disagreement between billing, RADIUS, router and payment sources; preserve the original evidence and corrections rather than silently rewriting history.

### JN-03. Promise-to-Proof Service Activation
Every activation or renewal is a tracked workflow with explicit stages, deadlines and proof: payment verified, subscription state updated, AAA attributes applied, network policy read back, subscriber reachability checked and notification delivered. Failed stages enter a repair queue with safe retries and compensating actions. Never report "active" merely because an API call returned success.

### JN-04. Jaslyn Service Passport
A portable, permission-controlled technical record for each subscriber service: service tier, site, serving equipment, policy, session status, measured quality, incidents, changes and billing/entitlement references. Exports include source timestamps and redaction, allowing support to diagnose a case without gathering screenshots from many modules.

### JN-05. Change-to-Customer Blast Radius Ledger
Before a proposed network/configuration change, calculate the known dependency chain and produce an affected-customer list, service tier impact, maintenance-window conflict and estimated risk. After execution, compare actual observations against the prediction and retain the difference for future planning. Clearly separate known impact from unknown topology.

### JN-06. Vendor Capability Truth Matrix
For each vendor/model/firmware/connection method, maintain machine-readable capabilities and evidence status: supported, partial, unsupported, unconfigured or lab-verified. Each operation has contract tests and read-back requirements. UI controls are disabled or marked unavailable when the selected device cannot safely perform the action.

### JN-07. Rural/Intermittent-Link Operations Mode
Support store-and-forward technician workflows and resilient site agents for constrained links: signed queued work, local timestamps, conflict detection, bounded retries and explicit synchronization status. Destructive commands require fresh authorization and must not execute later from an expired queue.

### JN-08. Payment-to-Access Consistency Sentinel
Continuously reconcile provider callback, ledger entry, subscription entitlement, RADIUS session and network policy. Prioritize actionable mismatches—paid but blocked, unpaid but active, duplicate entitlement, refund without revocation—and provide idempotent, approved repair actions with before/after evidence.

### JN-09. Tenant-Safe Proof Pack
Generate a case or outage evidence bundle containing relevant audit events, sanitized logs, telemetry windows, topology dependencies, payment/session references, actions and verification results. Apply least-privilege access, secret/PII redaction, integrity hashes and expiry/retention controls. Evidence must be traceable to its source, not fabricated.

### JN-10. Network Change Safety Envelope
Enforce a policy envelope for risky operations: preflight checks, role and approval requirements, configuration backup, allowed scope, execution timeout, rate limits, post-change read-back, health gate and rollback eligibility. If rollback is unsupported or uncertain, block the operation or require explicit break-glass authorization.

### JN-11. Site Resilience Scorecard
Score a site using declared, explainable inputs such as upstream diversity, power backup, link quality, device health, spare equipment, backup freshness and incident history. Show missing data and calculation rules; do not label a site resilient when required measurements are absent.

### JN-12. Operational Debt Radar
Identify repeated manual overrides, recurring incidents, unclosed alerts, stale configurations, untested backups, unsupported firmware, unresolved payment mismatches and vendor gaps. Rank by customer impact, recurrence and evidence quality; create traceable work items rather than generic AI-generated advice.

### JN-13. Promise-vs-Experience SLA
Compare the service tier promised to the customer with actual measured quality and outage evidence for the contracted window. Show measurement coverage, probe source, exclusions and uncertainty; support transparent customer reports and internal service-credit review without automatically issuing money unless an approved billing rule authorizes it.

### JN-14. One-Click Incident Context Room
For an incident, assemble topology, impacted subscribers, last known-good config, recent changes, open work orders, telemetry, active sessions, payment-independent outage scope and prior resolutions into a role-scoped incident workspace. It should reduce operator context switching without bypassing approvals.

### JN-15. Safe Recovery Rehearsal
Run restore and recovery exercises in an isolated environment, compare restored schema/data with expected invariants, and produce a signed result showing duration, failures, RPO/RTO and tested commit. A backup is not considered proven until restoration has been exercised.

### JN-16. Localized Operator Runbooks
Provide Swahili and English operational explanations, customer message templates and technician checklists, with technical identifiers preserved. Every procedure is versioned and permissioned; translations must not change command meaning or approval requirements.

### JN-17. Cross-Module Duplicate Prevention
Use canonical identity and idempotency rules across subscribers, devices, payments, invoices, tickets and work orders. Flag probable duplicates with evidence and offer controlled merge/alias workflows that preserve references, financial history and audit trails.

### JN-18. Evidence-Based Automation Maturity
Every automation has a declared maturity level: observe-only, recommend, approval-required, bounded-auto or disabled. Promotion requires test evidence, success/error metrics, rollback proof and a defined owner. Automatically downgrade or disable an automation when health thresholds are breached.

## Signature workflows

1. **Payment received → customer online:** verify signed provider event; record ledger; issue entitlement; reconcile AAA and network policy; verify session/reachability; notify customer; retain evidence at every step.
2. **Site outage → customer impact → recovery:** correlate fresh telemetry and topology; identify affected subscribers; open incident; notify only eligible recipients; execute approved repair; verify recovery; calculate outage/SLA evidence.
3. **Firmware/config change → safe rollout:** check vendor capability and model/firmware; preview blast radius; back up; obtain approval; stage limited rollout; read back; verify health; stop or roll back on failure.
4. **Customer dispute → proof pack:** connect invoice, payment settlement, entitlement timeline, session accounting and service-quality evidence; redact unauthorized data; export a traceable report.

## Differentiator acceptance criteria

- The capability is implemented as a real workflow, not only a dashboard, static score or document.
- All records are tenant-scoped; cross-tenant negative tests pass.
- Every derived conclusion shows its source, timestamp, freshness and uncertainty.
- Side effects are idempotent, auditable and safely retryable.
- Risky changes require permissions, approval, backup, read-back and rollback or an explicit block.
- Tests exercise failure, duplicate/out-of-order events, stale telemetry, partial outages and provider/device unavailability.
- Product UI clearly distinguishes live measurements, stale data, simulated data and unavailable integrations.
- Each feature has owner, status (`pass`, `fail`, `blocked`, `not-run`), tested commit and CI/E2E evidence.

## Positioning statement

**Jaslyn Net turns network operations, subscriber experience and money movement into one verifiable operational story—then helps operators act safely on that evidence.**

This is a proposed differentiation strategy. It does not assert that each capability is implemented or that no competitor offers similar concepts.
