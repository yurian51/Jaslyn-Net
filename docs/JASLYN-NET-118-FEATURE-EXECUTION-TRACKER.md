# Jaslyn Net — 118 Signature Feature Execution Tracker

**Scope:** the 18 JN differentiators plus 100 JN-X concepts. This tracker records implementation truth; listing a feature is not evidence that it is implemented.

**Current branch:** `feat/screenshot-derived-wifi-e2e`

## Shared implementation foundation in progress

A tenant-scoped signature evidence registry and explicit evidence-link graph have been added to the API branch:
- Migration: `apps/api/migrations/202610160001_signature_evidence_registry.sql`
- DTO validation: `apps/api/src/operations-control-plane/signature-evidence.dto.ts`
- Authenticated endpoints under `/operations/evidence`: record evidence, query evidence, link evidence, and inspect bounded lineage.
- Unit tests cover source attribution, tenant-scoped links and paired subject filters.

This is a reusable primitive, **not completion of any of the 118 product features**. It still requires CI/build/test execution, PostgreSQL migration testing, and feature-specific integration with billing, subscriber, network, field, security and communication domains.

## Status policy

- `pass`: feature-specific acceptance tests and end-to-end evidence pass on a named commit.
- `fail`: an executed check failed, with the failure recorded.
- `blocked`: an external dependency, credential, vendor sandbox or hardware is missing.
- `not-run`: the required verification has not been performed.
- Do not use `pass` for documentation, schema-only work, mocks, or a successful compile alone.

| ID | Feature | Status | Evidence / next gate |
|---|---|---|---|
| JN-01 | Network-to-Cash Evidence Graph | not-run | No feature-specific end-to-end evidence yet |
| JN-02 | Subscriber Service Truth Ledger | not-run | No feature-specific end-to-end evidence yet |
| JN-03 | Promise-to-Proof Service Activation | not-run | No feature-specific end-to-end evidence yet |
| JN-04 | Jaslyn Service Passport | not-run | No feature-specific end-to-end evidence yet |
| JN-05 | Change-to-Customer Blast Radius Ledger | not-run | No feature-specific end-to-end evidence yet |
| JN-06 | Vendor Capability Truth Matrix | not-run | No feature-specific end-to-end evidence yet |
| JN-07 | Rural/Intermittent-Link Operations Mode | not-run | No feature-specific end-to-end evidence yet |
| JN-08 | Payment-to-Access Consistency Sentinel | not-run | No feature-specific end-to-end evidence yet |
| JN-09 | Tenant-Safe Proof Pack | not-run | No feature-specific end-to-end evidence yet |
| JN-10 | Network Change Safety Envelope | not-run | No feature-specific end-to-end evidence yet |
| JN-11 | Site Resilience Scorecard | not-run | No feature-specific end-to-end evidence yet |
| JN-12 | Operational Debt Radar | not-run | No feature-specific end-to-end evidence yet |
| JN-13 | Promise-vs-Experience SLA | not-run | No feature-specific end-to-end evidence yet |
| JN-14 | One-Click Incident Context Room | not-run | No feature-specific end-to-end evidence yet |
| JN-15 | Safe Recovery Rehearsal | not-run | No feature-specific end-to-end evidence yet |
| JN-16 | Localized Operator Runbooks | not-run | No feature-specific end-to-end evidence yet |
| JN-17 | Cross-Module Duplicate Prevention | not-run | No feature-specific end-to-end evidence yet |
| JN-18 | Evidence-Based Automation Maturity | not-run | No feature-specific end-to-end evidence yet |
| JN-X01 | Service-to-Cash Trace | not-run | No feature-specific end-to-end evidence yet |
| JN-X02 | Revenue Leakage Replay | not-run | No feature-specific end-to-end evidence yet |
| JN-X03 | Entitlement Conflict Resolver | not-run | No feature-specific end-to-end evidence yet |
| JN-X04 | Session-to-Invoice Evidence | not-run | No feature-specific end-to-end evidence yet |
| JN-X05 | Payment Reversal Access Guard | not-run | No feature-specific end-to-end evidence yet |
| JN-X06 | Zero-Value Service Audit | not-run | No feature-specific end-to-end evidence yet |
| JN-X07 | Invoice Confidence Meter | not-run | No feature-specific end-to-end evidence yet |
| JN-X08 | Dispute Evidence Builder | not-run | No feature-specific end-to-end evidence yet |
| JN-X09 | Settlement Delay Predictor | not-run | No feature-specific end-to-end evidence yet |
| JN-X10 | Revenue Event Lineage | not-run | No feature-specific end-to-end evidence yet |
| JN-X11 | Household Experience Map | not-run | No feature-specific end-to-end evidence yet |
| JN-X12 | Fairness Across Shared Links | not-run | No feature-specific end-to-end evidence yet |
| JN-X13 | Complaint-to-Telemetry Match | not-run | No feature-specific end-to-end evidence yet |
| JN-X14 | Micro-Outage Fingerprint | not-run | No feature-specific end-to-end evidence yet |
| JN-X15 | Service Promise Comparator | not-run | No feature-specific end-to-end evidence yet |
| JN-X16 | Subscriber Experience Timeline | not-run | No feature-specific end-to-end evidence yet |
| JN-X17 | Silent Degradation Watch | not-run | No feature-specific end-to-end evidence yet |
| JN-X18 | Customer Impact Counterfactual | not-run | No feature-specific end-to-end evidence yet |
| JN-X19 | Accessibility-Aware Portal | not-run | No feature-specific end-to-end evidence yet |
| JN-X20 | Offline Complaint Intake | not-run | No feature-specific end-to-end evidence yet |
| JN-X21 | Pole-to-Port Trace | not-run | No feature-specific end-to-end evidence yet |
| JN-X22 | Optical Budget Watch | not-run | No feature-specific end-to-end evidence yet |
| JN-X23 | Field Evidence Chain | not-run | No feature-specific end-to-end evidence yet |
| JN-X24 | Spares-at-Risk Forecast | not-run | No feature-specific end-to-end evidence yet |
| JN-X25 | Repair-versus-Replace Advisor | not-run | No feature-specific end-to-end evidence yet |
| JN-X26 | Site Access Readiness | not-run | No feature-specific end-to-end evidence yet |
| JN-X27 | Crew Skill Match | not-run | No feature-specific end-to-end evidence yet |
| JN-X28 | Repeat-Fault Detector | not-run | No feature-specific end-to-end evidence yet |
| JN-X29 | Cable Cut Correlation | not-run | No feature-specific end-to-end evidence yet |
| JN-X30 | Restoration Proof Checklist | not-run | No feature-specific end-to-end evidence yet |
| JN-X31 | Capability Contract Tests | not-run | No feature-specific end-to-end evidence yet |
| JN-X32 | Vendor Behavior Notebook | not-run | No feature-specific end-to-end evidence yet |
| JN-X33 | Safe Command Preview | not-run | No feature-specific end-to-end evidence yet |
| JN-X34 | Firmware Risk Passport | not-run | No feature-specific end-to-end evidence yet |
| JN-X35 | Adapter Drift Sentinel | not-run | No feature-specific end-to-end evidence yet |
| JN-X36 | Mixed-Vendor Path Reasoner | not-run | No feature-specific end-to-end evidence yet |
| JN-X37 | Protocol Translation Audit | not-run | No feature-specific end-to-end evidence yet |
| JN-X38 | Device Identity Confidence | not-run | No feature-specific end-to-end evidence yet |
| JN-X39 | Lab-to-Production Promotion Gate | not-run | No feature-specific end-to-end evidence yet |
| JN-X40 | Vendor Exit Readiness Score | not-run | No feature-specific end-to-end evidence yet |
| JN-X41 | Change Blast-Radius Budget | not-run | No feature-specific end-to-end evidence yet |
| JN-X42 | Canary Site Rollout | not-run | No feature-specific end-to-end evidence yet |
| JN-X43 | Automatic Stop Conditions | not-run | No feature-specific end-to-end evidence yet |
| JN-X44 | Rollback Readiness Proof | not-run | No feature-specific end-to-end evidence yet |
| JN-X45 | Dependency Failure Drill | not-run | No feature-specific end-to-end evidence yet |
| JN-X46 | Backup Restore Evidence | not-run | No feature-specific end-to-end evidence yet |
| JN-X47 | Degraded-Mode Runbook Switch | not-run | No feature-specific end-to-end evidence yet |
| JN-X48 | Control-Plane Split-Brain Guard | not-run | No feature-specific end-to-end evidence yet |
| JN-X49 | Incident Clock Integrity | not-run | No feature-specific end-to-end evidence yet |
| JN-X50 | Recovery Objective Tracker | not-run | No feature-specific end-to-end evidence yet |
| JN-X51 | Permission Impact Preview | not-run | No feature-specific end-to-end evidence yet |
| JN-X52 | Just-in-Time Privileged Session | not-run | No feature-specific end-to-end evidence yet |
| JN-X53 | Secret Exposure Tripwire | not-run | No feature-specific end-to-end evidence yet |
| JN-X54 | Tenant Boundary Test Suite | not-run | No feature-specific end-to-end evidence yet |
| JN-X55 | Privacy-Preserving Diagnostics | not-run | No feature-specific end-to-end evidence yet |
| JN-X56 | Data Purpose Registry | not-run | No feature-specific end-to-end evidence yet |
| JN-X57 | Audit Gap Detector | not-run | No feature-specific end-to-end evidence yet |
| JN-X58 | Policy-as-Code Preview | not-run | No feature-specific end-to-end evidence yet |
| JN-X59 | Signed Automation Packages | not-run | No feature-specific end-to-end evidence yet |
| JN-X60 | Export Watermark and Receipt | not-run | No feature-specific end-to-end evidence yet |
| JN-X61 | Swahili Operator Copilot | not-run | No feature-specific end-to-end evidence yet |
| JN-X62 | Kiswahili Customer Message QA | not-run | No feature-specific end-to-end evidence yet |
| JN-X63 | Low-Bandwidth Operations Console | not-run | No feature-specific end-to-end evidence yet |
| JN-X64 | Store-and-Forward Command Queue | not-run | No feature-specific end-to-end evidence yet |
| JN-X65 | Mobile-Money Reconciliation Lens | not-run | No feature-specific end-to-end evidence yet |
| JN-X66 | Local-Time SLA Calendar | not-run | No feature-specific end-to-end evidence yet |
| JN-X67 | Regional Outage Coordination | not-run | No feature-specific end-to-end evidence yet |
| JN-X68 | Power Instability Correlator | not-run | No feature-specific end-to-end evidence yet |
| JN-X69 | Rural Link Budget Planner | not-run | No feature-specific end-to-end evidence yet |
| JN-X70 | Localized Runbook Packager | not-run | No feature-specific end-to-end evidence yet |
| JN-X71 | Evidence-Gated Automation | not-run | No feature-specific end-to-end evidence yet |
| JN-X72 | Automation Shadow Mode | not-run | No feature-specific end-to-end evidence yet |
| JN-X73 | Human Override Learning Log | not-run | No feature-specific end-to-end evidence yet |
| JN-X74 | Duplicate Action Suppressor | not-run | No feature-specific end-to-end evidence yet |
| JN-X75 | Action Budget and Rate Guard | not-run | No feature-specific end-to-end evidence yet |
| JN-X76 | Competing Recommendation Resolver | not-run | No feature-specific end-to-end evidence yet |
| JN-X77 | Decision Explanation Card | not-run | No feature-specific end-to-end evidence yet |
| JN-X78 | Safe Automation Expiry | not-run | No feature-specific end-to-end evidence yet |
| JN-X79 | Outcome-Based Runbook Score | not-run | No feature-specific end-to-end evidence yet |
| JN-X80 | Automation Kill Switch Registry | not-run | No feature-specific end-to-end evidence yet |
| JN-X81 | Plan Margin Simulator | not-run | No feature-specific end-to-end evidence yet |
| JN-X82 | Capacity-to-Commitment Guard | not-run | No feature-specific end-to-end evidence yet |
| JN-X83 | Promotion Expiry Sentinel | not-run | No feature-specific end-to-end evidence yet |
| JN-X84 | Wholesale SLA Evidence Exchange | not-run | No feature-specific end-to-end evidence yet |
| JN-X85 | Partner Integration Scorecard | not-run | No feature-specific end-to-end evidence yet |
| JN-X86 | Contract Exception Ledger | not-run | No feature-specific end-to-end evidence yet |
| JN-X87 | Demand-to-Inventory Forecast | not-run | No feature-specific end-to-end evidence yet |
| JN-X88 | Site Investment Comparator | not-run | No feature-specific end-to-end evidence yet |
| JN-X89 | Subscriber Migration Planner | not-run | No feature-specific end-to-end evidence yet |
| JN-X90 | Partner Settlement Exception Desk | not-run | No feature-specific end-to-end evidence yet |
| JN-X91 | Feature Readiness Evidence Board | not-run | No feature-specific end-to-end evidence yet |
| JN-X92 | Claim-to-Code Traceability | not-run | No feature-specific end-to-end evidence yet |
| JN-X93 | Synthetic Subscriber Journey | not-run | No feature-specific end-to-end evidence yet |
| JN-X94 | Integration Contract Observatory | not-run | No feature-specific end-to-end evidence yet |
| JN-X95 | Data Freshness Contract | not-run | No feature-specific end-to-end evidence yet |
| JN-X96 | Operational Metric Definition Registry | not-run | No feature-specific end-to-end evidence yet |
| JN-X97 | Duplicate Entity Resolution Workbench | not-run | No feature-specific end-to-end evidence yet |
| JN-X98 | Release Regression Replay | not-run | No feature-specific end-to-end evidence yet |
| JN-X99 | Customer Impact Communication Proof | not-run | No feature-specific end-to-end evidence yet |
| JN-X100 | Product Promise Ledger | not-run | No feature-specific end-to-end evidence yet |

## Required release evidence for each feature

1. Owner and code paths; API contracts and database migration.
2. Authenticated RBAC, tenant isolation, validation and negative tests.
3. Unit, integration and end-to-end tests, including failure/retry/idempotency paths.
4. UI wired to real API data with loading, empty, stale, error and retry states where a UI is required.
5. Audit, metrics/logging, operational runbook, rollout and rollback plan.
6. Evidence on a named commit: CI run, test output, PostgreSQL migration, staging smoke and external vendor/provider test when relevant.

## First delivery slices

1. Shared evidence graph and network-to-cash trace foundations.
2. Subscriber service truth ledger and payment-to-access consistency.
3. Change blast radius, incident context, SLA evidence and site resilience.
4. Vendor capability contracts, safe command preview, rollback readiness and firmware risk.
5. Security/tenant-boundary evidence and evidence-gated automation.
6. Remaining features sequenced by dependency, risk, and access to real provider/device environments.

A feature must not be marked complete merely because its shared primitive exists.
