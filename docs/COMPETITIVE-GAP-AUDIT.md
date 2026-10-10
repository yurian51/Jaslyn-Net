# JASLYN NET Competitive Gap Audit & Execution Backlog

**Review date:** 2026-10-10  
**Scope:** Repository documentation review and competitor-informed delivery plan  
**Status:** Initial evidence-based audit; runtime tests and hardware/provider verification have not been run.

## Executive decision

Prioritize **payment correctness, tenant isolation, and verified network enforcement** before adding more surface-area features. Competitor feature lists are useful market signals, not proof of quality. JASLYN should win on operational trust: money must reconcile, access must follow verified payment state, and network status must reflect actual device evidence.

## Evidence reviewed

- `README.md`: describes JASLYN NET as AI-native and lists AI orchestration, specialist agents, approval-gated actions and evidence-first operations.
- `docs/product-architecture.md`: defines PostgreSQL as source of truth, domain ownership, fail-closed payment/network boundaries, and the rule that catalogue entries are not executable integrations.
- `docs/production-readiness.md`: lists payment adapters/webhook verification, MikroTik retry/timeout/credential isolation, RADIUS/PPPoE lifecycle, durable jobs, secrets, rate limiting, observability, backups and disaster recovery as production blockers.
- `docs/UPESIPAY-INTEGRATION.md`: documents a provider control-plane integration but explicitly says unsigned callbacks are pending verification and must not settle payments.
- `docs/PROJECT-WATCH.md`: says the product boundary is vendor-neutral operations without an AI assistant layer, which conflicts with the README's AI-native positioning.

**Important limitation:** this is a documentation and repository-surface audit, not a claim that the code passes tests or that external integrations have been verified against live providers/routers.

## Competitive capability matrix

| Capability | Market signal from reviewed competitors | JASLYN target | Priority |
|---|---|---|---|
| Mobile-money billing and payment proof | Local platforms emphasize M-Pesa/mobile-money flows and automated access | Provider-specific adapters, verified callbacks/status polling, idempotency, reconciliation, ledger-safe settlement | P0 |
| Router/AAA integration | MikroTik, RADIUS and controller integrations are common differentiators | Mark each capability as Native + Tested, Beta, or Catalogue-only; verify command results against device state | P0 |
| Voucher and subscription commerce | Vouchers, time/data/combo plans, branded portals and reseller flows are table stakes | Complete purchase-to-entitlement-to-expiry lifecycle, voucher batch/export/print, anti-sharing policy | P1 |
| Operator onboarding | Competitors sell simplicity and quick setup | Guided setup, environment checks, safe demo mode, actionable error messages | P1 |
| Multi-site and dealer operations | Multi-site, agents, roles and reseller commissions are common | Tenant-safe site hierarchy, role matrix, auditable commissions and settlement | P1 |
| Support and network health | Dashboards, alerts and router-health claims appear frequently | Evidence-backed incidents, telemetry freshness labels, alert deduplication and recovery steps | P2 |
| AI operations | Differentiation opportunity, but claims need proof | Read-only diagnostics first; proposed actions require policy checks, approval and audit | P2 |
| Enterprise readiness | Reliability is less visible in marketing but essential in production | Restore drills, SLOs, rate limits, tracing, incident response and release gates | P0/P2 |

Competitor examples reviewed: WoteFy, Kitonga WiFi, Nexor Cloud, Benny WiFi, ChinoWiFi, KazFii, LubFy, Sensible Hotspot, UpesiLipa and WiFi Business. Public marketing claims and prices may change and were not independently load-tested or contract-verified.

## Repository gaps to close

### P0 — Launch blockers

1. **Payment verification and idempotency**
   - Trace the complete path: provider event/request → verified payment → ledger posting → entitlement/access grant.
   - Reject unsigned or unverified callbacks as proof of payment.
   - Make duplicate callbacks and retried requests safe; enforce uniqueness/idempotency at the database boundary.
   - Add tests for invalid signature, duplicate event, out-of-order event, timeout, provider status mismatch, and reconciliation drift.
   - Keep the payment and access state machines consistent; no access grant from a pending/failed payment.

2. **Tenant isolation**
   - Test every customer, site, router, payment, voucher, session, ledger and report query with two tenants.
   - Verify object-level authorization and role permissions, not only dashboard filtering.
   - Add negative tests proving cross-tenant IDs cannot be read or mutated.

3. **Router command integrity**
   - For each executable adapter, test authentication, TLS/transport policy, timeout, retry, idempotency, secret isolation and error mapping.
   - Distinguish command accepted from command verified; read back device state where supported.
   - Reconciliation must fail closed when access enforcement cannot be confirmed.

4. **Production operations**
   - Validate environment variables at startup; never log credentials or payment secrets.
   - Add rate limits, structured logs, metrics, tracing, durable retries and dead-letter handling.
   - Prove PostgreSQL backup restoration and document recovery objectives.
   - Run migrations and authenticated API smoke tests against disposable services before release.

### P1 — Operator experience and revenue

5. **End-to-end onboarding:** setup wizard, router connectivity check, package creation, test voucher and first test payment in a sandbox.
6. **Commerce lifecycle:** time/data/combo packages, voucher import/export/printing, expiry and suspension jobs, branded captive portal and device/session limits.
7. **Local payments:** provider adapters only after contracts, callback authentication and status-check endpoints are verified; support manual reconciliation with audit trails where appropriate.
8. **Business operations:** agent/dealer roles, commission calculation, settlement reports, net revenue and CSV exports.
9. **Integration truthfulness:** capability registry must expose actual implementation status and last successful verification timestamp.

### P2 — Differentiation after the core is safe

10. **AI Network Operations Centre (NOC):** begin read-only with evidence-linked diagnostics and confidence/limitations; never let a model invent device state.
11. **Approval-gated actions:** show proposed change, scope, impact, preconditions and rollback; require explicit authorization for disruptive changes.
12. **Capacity and revenue analytics:** forecasts must disclose source data, period and assumptions.
13. **Multi-site operations:** alert routing, incident timelines, maintenance windows, API/webhooks and tenant-specific audit exports.

## Documentation corrections

- Reconcile the conflict between `README.md` (AI-native operating layer) and `docs/PROJECT-WATCH.md` (no AI assistant layer). Document only the AI capabilities that actually exist and are tested.
- Rename the stale NEXORA title and repository identity in `docs/production-readiness.md` to JASLYN NET / `yurian51/Jaslyn-Net`.
- Keep the explicit architecture rule: a provider or hardware catalogue entry does not mean the integration is operational.
- Publish a capability table with status, evidence, last tested version and known limitations.

## Acceptance gates

A release is not ready until the applicable checks pass:

- [ ] Payment cannot settle from an unverified callback.
- [ ] Replayed provider events do not duplicate ledger entries or access grants.
- [ ] Failed, expired and refunded payments cannot leave unauthorized access active.
- [ ] Cross-tenant access tests fail safely for all sensitive resource families.
- [ ] Router actions report verified device state, not merely a successful HTTP request.
- [ ] Expiry/suspension and retry jobs survive process restarts without duplicate effects.
- [ ] Backup restore and deployment smoke tests are demonstrated.
- [ ] Integration status in UI matches the actual executable/tested capability.
- [ ] AI read-only findings link to evidence; state-changing operations are policy- and approval-gated.
- [ ] Documentation no longer contradicts the shipped product.

## 30-day execution sequence

**Week 1:** trace payment lifecycle and tenant authorization; add a risk register and regression tests.  
**Week 2:** close payment idempotency/reconciliation gaps and tenant-isolation failures.  
**Week 3:** harden RouterOS/RADIUS command verification, retries and expiry lifecycle.  
**Week 4:** run deployment, backup/restore and smoke-test gates; correct docs and publish capability status.

## Definition of done for this audit

This audit becomes implementation-complete only after the source paths for each finding are linked, regression tests are added and run, provider/router test evidence is recorded, and each acceptance gate has a pass/fail result. No integration should be advertised as production-ready on documentation alone.


## Changes currently staged in PR #63

- Product strategy and competitor benchmark consolidated in `docs/PRODUCT-STRATEGY-AND-ROADMAP.md`.
- Audit and roadmap linked from `README.md`.
- Stale NEXORA branding and old workspace package filters corrected in `docs/production-readiness.md`.
- Capability status definitions and AI safety invariants added to `docs/product-architecture.md`.
- Payment unit-test construction aligned with the current `PaymentsService` constructor; missing and malformed webhook-signature regression cases added.
- **Verification limitation:** GitHub Actions currently ends at startup failure with no jobs created. No claim is made that tests passed. Production payment, RADIUS and router changes are not yet implemented or verified by this PR.
