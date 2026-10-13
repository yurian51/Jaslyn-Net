# Jaslyn Net — Feature Registry and Execution Gates

**Updated:** 2026-10-11  
**Status:** Baseline inventory assembled from `main` documentation and currently visible open PR metadata. This is not runtime verification.  
**Policy:** no AI features in this delivery scope. Reuse existing services, migrations, authorization and adapters; do not build parallel domain systems.

## Current repository evidence

- Stack declared in `README.md` / `package.json`: Next.js + TypeScript, NestJS + TypeScript, PostgreSQL, Redis/BullMQ, FreeRADIUS, vendor-neutral adapter fabric, MikroTik RouterOS v7 first executable native adapter, Docker and GitHub Actions; Node >=24.21.0 and pnpm 12.7.0.
- `docs/WORKFLOW-AUTOMATION-FOUNDATION.md`: PR #83 is described as implementing a subset: safe transform, notify via outbox, guarded HTTP connector, bounded branch routing, visual editor support, immutable versions, queued execution snapshots, import/export and guarded replay/cancel. CI and migration smoke verification remain pending.
- `docs/ENTERPRISE-CAPABILITIES-IMPLEMENTATION.md`: migrations 062–070 are described as staged on another workstream, covering session/audit integrity, offline field sync, incident timelines/status, network change intelligence, policy/compliance, synthetic monitoring, revenue assurance, secrets vault and fine-grained permissions. The same document explicitly says runtime tests and migrations have not run; vault adoption is not universal; central synthetic monitoring is not a site-local probe; desired-state policy does not enforce live device config.
- `docs/ENTERPRISE-FEATURES-EXECUTION.md`: migrations 071–075 are proposed after 062–070 for procurement/finance, network experience/capacity/SLA, event automation, usage quotas and financial audit-head guard. These are described as staged, not production-verified. Inventory uses weighted-average valuation, not FIFO; supplier-payment records do not execute bank transfers; vendor telemetry integrations and some SLA automations remain unconnected/unverified.
- `docs/production-readiness.md` and `docs/COMPETITIVE-GAP-AUDIT.md`: payment lifecycle, tenant isolation, RADIUS/router, background jobs, secrets/configuration, observability, restore and deployment smoke tests are explicit blockers. GitHub Actions was reported to fail before jobs are created; no successful CI evidence is recorded there.
- Open PRs observed during this update: #92 research gap map (draft, mergeable); #78 production CI verification (open, mergeable; CI expected but not proven); #56 and #54 are open and report merge conflicts (`mergeable: false`) and include AI-specific work. Do not merge conflicted PRs blindly or merge AI-specific scope into this no-AI delivery.

## Feature registry

| Domain | Existing repository evidence | Gap / required next evidence | Priority |
|---|---|---|---|
| CI/build baseline | root scripts for build, lint, test, typecheck; docs describe Actions startup failure | Make runner create jobs; execute API/web lint, typecheck, tests, build and PostgreSQL migration smoke; capture run URL and counts | P0 blocker |
| Payment truth engine | payment and reconciliation modules referenced in README/docs; webhook event/outbox transaction hardening described in gap audit | Provider-specific signed callback contracts; amount/currency/tenant checks; replay and idempotency; payment→ledger→purchase→entitlement trace; provider statement reconciliation; sandbox evidence | P0 |
| Tenant isolation | tenant-scoped modules and fine-grained permission design described | Automated cross-tenant deny tests across payments, customers, workflows, inventory, finance, files, exports, webhooks and API keys | P0 |
| Network commands / vendor adapters | RouterOS v7 first executable native adapter; hybrid registry separates executable from catalogue-only | Per-vendor capability matrix, contract tests, credentials in vault, bounded timeouts/retries, device-state read-back; never label catalog-only as live | P0 |
| RADIUS/AAA lifecycle | FreeRADIUS and vendor-neutral AAA documented | Verify authorize/accounting/interim updates, CoA/Disconnect where supported, stale session cleanup, quotas, expiry/suspension/reactivation and access revocation on refund | P0 |
| Workflow engine | Partial capabilities listed in workflow foundation | Verify event/schedule/webhook triggers, durable state, idempotency, retries/dead-letter, approvals, cancellation/replay, logs, quotas and tenant boundary; full end-to-end domain templates | P1 after P0 baseline |
| Finance/procurement/inventory | branch doc describes migrations 071–075 and AR, credit notes, suppliers, POs, weighted-average stock, audit chain | Validate invoice authority, partial settlement, concurrent stock/credit limits, audit tamper/concurrency, receiving/returns, exports and migration ordering 062–075 | P0/P1 |
| Captive portal / subscriber lifecycle | customer commerce, packages, vouchers, captive portals referenced in README/strategy | E2E: package selection → provider verification → entitlement → access activation; expiry, quota, voucher anti-sharing, receipt, recovery, mobile-first/Swahili and independent public URLs | P1 |
| SMS / messaging | notification outbox and workflow NOTIFY are described; vault wiring is not universal | Provider adapter contract, consent/opt-out, sender approval, delivery receipts vs provider acceptance, retries/deduplication/cost; sandbox then controlled live test | P1 |
| Field operations / offline | offline queue, server receipts, checklist sync, QR scanning described as staged | Mobile browser tests, conflict resolution, duplicate sync, photo storage/permissions, site connectivity and tenant checks | P1 |
| Incidents / monitoring | incidents, status page, central synthetic checks, compliance and revenue assurance described as staged | Confirm scheduler actually runs, alerts open/resolve, no false live status, site-local probes, metrics/traces/logs and alert routing | P1 |
| Security / secrets | secret vault, session revoke, RBAC overrides and tamper-evident audit described as staged | Rotate keys safely; wire each integration to tenant secret references; test unauthorized access, log redaction, audit tamper, rate limits, SSRF and key revocation | P0 |
| Backup / disaster recovery | backup archive/checksum and disposable restore script described in docs | Run timed restore, test upgrade/rollback, record RPO/RTO; do not equate backup creation with recovery proof | P0 |
| SaaS and self-hosted deployment | dual profile roadmap documented | Fresh install, upgrade, secrets, health/readiness, worker lifecycle, migrations, restore and rollback on both profiles | P0 before launch |
| Procurement/vendor management | PO/supplier invoice/stock valuation requirements already requested | Supplier approval → PO → receive → inventory ledger → invoice/payment matching; real payment execution must remain distinct from accounting records | P1 |
| Reporting / exports | tenant-scoped CSV/PDF described | Verify object-level export permissions, formula neutralization, currency/time zone, pagination, reconciliation totals and audit record of sensitive exports | P1 |
| Regionalization | East African payment context and international competitive map | Configurable currencies, tax/invoice rules, timezones, languages and legal retention; separate country rules from core ledger | P1 |

## Required acceptance evidence format

Each capability must carry these independent statuses:

- `code_present`: relevant code and migration exist on the target commit.
- `automated_tests_passed`: exact CI run and test count recorded.
- `tenant_security_passed`: cross-tenant and RBAC tests passed.
- `provider_sandbox_passed`: provider contract/sandbox passed, where relevant.
- `hardware_lab_passed`: real device/controller lab test passed, where relevant.
- `staging_e2e_passed`: full user workflow passed in staging.
- `production_smoke_passed`: deployed commit, health/readiness and key workflow smoke evidence recorded.
- `restore_rollback_passed`: migration rollback/backup restore rehearsal passed where relevant.

Allowed release states: **Blocked**, **Code staged**, **Automated tests passed**, **Sandbox/lab verified**, **Staging verified**, **Production approved**. Never promote a state based on documentation, mocks, compile-only checks or a healthy landing page.

## Execution order

1. Restore GitHub Actions job startup and obtain a repeatable baseline.
2. Compare open PRs and their base SHAs; resolve conflicts only after reviewing actual diffs and tests. Exclude AI-only PR scope from this work.
3. Run clean install, API/web lint/typecheck/test/build and PostgreSQL migration smoke for the exact candidate commit.
4. Execute payment correctness and tenant isolation tests before enabling live payment or access changes.
5. Verify RADIUS, expiry/suspension, RouterOS command read-back and adapter capability truth.
6. Apply migrations 062–075 in the intended dependency order to disposable PostgreSQL; verify fresh install, upgrade, rollback and restore.
7. Finish workflow durable execution and domain templates; run duplicate/out-of-order event and worker restart tests.
8. Run field, messaging, finance, reporting and incident end-to-end tests.
9. Deploy to staging, verify `/api/v1/health` and `/api/v1/ready`, check deployed commit, and record external sandbox/lab evidence.
10. Only then prepare a production approval decision.

## Research cautions

Competitor product pages are marketing evidence, not proof of implementation quality. Third-party code must pass license, security, maintenance and architecture review. In particular, do not embed/host n8n as a multi-tenant commercial feature without legal review of its license; prefer Jaslyn-owned typed workflow primitives and connectors. Country-specific rules must be configurable and reviewed for the jurisdiction where the tenant operates.
