# Project Watch Memory

**Project:** JASLYN NET  
**Last reviewed:** 2026-10-10  
**Repository:** https://github.com/yurian51/Jaslyn-Net  
**Working branch:** `work/competitive-gap-audit`

## Verified work in this review

- Added `docs/COMPETITIVE-GAP-AUDIT.md` with P0/P1/P2 gaps, acceptance gates and a 30-day reliability-first sequence.
- Added `docs/PRODUCT-STRATEGY-AND-ROADMAP.md` consolidating the ten-competitor benchmark, product positioning, user jobs, feature roadmap, pricing hypotheses and 90-day plan.
- Corrected stale NEXORA branding in `docs/production-readiness.md`.
- Created draft PR #63: https://github.com/yurian51/Jaslyn-Net/pull/63
- Updated `apps/api/src/payments/payments.service.spec.ts` to inject the required domain-events mock and added regression tests for missing/malformed webhook signatures.
- Runtime changes now include atomic webhook event/outbox handling and tenant/provider ownership validation, plus a tenant-scoped read API and operator UI for platform subscription status/catalogue.
- Added focused unit tests for the new subscription query service. Full API/web builds and tests are still unverified; live router/payment-provider verification has not been run.
- GitHub Actions runs currently report `startup_failure` with zero jobs created; this is infrastructure/startup evidence, not a passing or failing test result.

## Product direction agreed in discussion

**Reliability first → automation second → evidence-based AI third → scale.**

Priorities:
1. Payment verification, idempotency, ledger reconciliation and access lifecycle.
2. Tenant isolation, secure router commands, RADIUS lifecycle and verified enforcement.
3. Mobile-first onboarding, vouchers, time/data/combo plans, branded portal and agent/dealer workflows.
4. Evidence-linked read-only AI NOC, followed by approval-gated changes only after P0 safety gates pass.
5. Enterprise operations, telemetry, incident response, backups and recovery.

- Added `/dashboard/platform-subscription`, `GET /api/v1/platform-subscriptions/plans`, and `GET /api/v1/platform-subscriptions/current`. This is read-only: subscription checkout, plan mutation, cancellation, renewal and entitlement enforcement are not implemented by these routes.

## Current known documentation issue

README describes an AI-native operating layer, while older project notes said no AI assistant layer. Treat AI as roadmap intent unless a concrete end-to-end implementation and tests prove the feature exists. Product claims must match verified code.

## Next action — continue implementation, not cosmetic commits

Audit actual source paths for:
- Payment lifecycle: provider event/request → verified payment → ledger → purchase/entitlement → access grant.
- Tenant-scoped authorization on sensitive resources.
- RouterOS/RADIUS command submission versus device-state verification.
- Expiry, suspension, refunds, retries and durable jobs.
- Environment validation, rate limits, observability and backup/restore.

For each gap, add a focused regression test, implement the smallest safe fix, run the relevant test command and record evidence. Do not claim success without test output or real integration evidence.

## Operating rules

- PostgreSQL is the source of truth.
- Provider/hardware catalogue entries are not operational integrations.
- No production secrets in Git, logs or docs.
- Never guess third-party API endpoints or webhook verification contracts.
- No AI action may bypass tenant scope, RBAC, policy, approval or audit.
- Avoid cosmetic/duplicate commits; every change must improve correctness, safety, usability or verifiability.
