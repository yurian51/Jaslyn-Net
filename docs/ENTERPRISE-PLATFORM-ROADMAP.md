# JASLYN NET Enterprise Platform Roadmap

**Owner:** YURIAN TECH LTD  
**Product:** JASLYN NET — Connect. Control. Grow.  
**Scope:** Full enterprise platform for cloud/SaaS and self-hosted deployments  
**Status:** Execution plan; not a claim that roadmap items are implemented or production-verified  
**AI scope:** This roadmap explicitly excludes new AI features. Existing AI-related code is out of scope unless a separate approved task requests changes.

## 1. Delivery rules

1. Inspect the current implementation, migrations, tests, open PRs and CI before changing an existing domain. Reuse working code; do not rebuild modules simply to match this roadmap.
2. Work in small, reviewable pull requests. Do not merge or deploy automatically as a substitute for review.
3. A feature is complete only when its API, domain logic, persistence, UI/operational surface, authorization, audit events, failure handling and relevant tests are connected end to end.
4. Report evidence, not assumptions: commit/PR, exact commands or CI run, test totals, migration results, and any unavailable external verification.
5. Mark each external integration capability as **Native + Tested**, **Beta / Limited**, **Catalogue-only**, or **Unverified**. Never imply live connectivity without evidence.
6. No production credentials or customer data in Git, logs, fixtures, screenshots, or test artifacts.
7. State-changing network and financial actions must be authorized, idempotent where applicable, auditable, and verified against authoritative state. Fail closed when verification is missing.
8. No real payments, SMS, router mutations, or customer-facing rollout without explicit release approval and a controlled test plan.

## 2. Baseline discovered before implementation

The repository README identifies Next.js + TypeScript, NestJS + TypeScript, PostgreSQL, Redis/BullMQ, FreeRADIUS, Docker and GitHub Actions. Product architecture describes a modular monolith with PostgreSQL as source of truth and vendor integrations behind adapter boundaries.

Open work inspected on 2026-10-11:
- PR #68, `feat/provider-agnostic-sms-gateway`: open Draft; delivery implementation and tests are documented, but runtime tests, migrations and real provider delivery are not verified.
- PR #69, `feat/multi-vendor-network-adapters`: open Draft; several vendor adapters are read-only/limited and controller-specific live verification remains outstanding.
- Latest inspected GitHub Actions run for PR #69 (run ID 38122319185) ended with `startup_failure`; no jobs were created. This is not a passing build or an application test failure.

The current `docs/production-readiness.md` also lists outstanding payment-provider verification, router/RADIUS flows, durable jobs, secrets, abuse protection, observability, backup/restore, disaster recovery and deployment smoke tests. These are release gates, not optional polish.

## 3. Workstreams and acceptance gates

### Phase 0 — Restore trustworthy engineering verification (P0)

**Deliverables**
- Diagnose and repair GitHub Actions runner/workflow startup failure; keep a minimal runner smoke workflow separate from application CI if needed.
- Pin supported Node.js/pnpm versions and compatible action versions; preserve the repository's Node 24 requirement.
- Establish reproducible install, migration validation, API lint/typecheck/tests/build and web typecheck/tests/build.
- Add CI artifacts and summaries that clearly distinguish skipped, failed, and passed steps.
- Run CI on the roadmap branch and current release-candidate branches without exposing secrets.

**Acceptance gate**
- A real runner creates jobs and executes all configured steps.
- API and web checks complete with recorded exit codes.
- Failures are actionable; no green status can be produced by skipped or missing validation.
- Existing failures are documented and fixed or tracked as explicit blockers.

### Phase 1 — Core correctness, tenant boundaries and release security (P0)

**Deliverables**
- Map identity, organizations, tenants, sites, devices and role permissions to authoritative database/service ownership.
- Add cross-tenant negative tests for list, detail, search, exports, background jobs, webhooks and device actions.
- Review session invalidation, MFA/passkeys feasibility, rate limits, input validation, CORS/CSRF where applicable, secure headers and sensitive error handling.
- Ensure critical mutations write audit events with actor, tenant, target, outcome and correlation ID.
- Verify secrets encryption/key rotation strategy and remove secrets from logs and API responses.
- Add dependency, secret and container-image scanning to CI with a documented triage policy.

**Acceptance gate**
- Automated tenant-isolation and authorization tests pass.
- Security checks produce reviewable reports; no known critical/high finding is silently waived.
- All privileged mutations are authorized and auditable.

### Phase 2 — Payment, ledger, subscription and revenue integrity (P0)

**Deliverables**
- Trace provider event/request → verification → payment state → ledger posting → entitlement/access grant.
- Finish provider-specific contract adapters only where documented API behavior and credentials are available.
- Enforce signature validation over exact raw bytes, provider/tenant/reference/amount/currency checks, database uniqueness and idempotent state transitions.
- Persist webhook event and durable outbox/domain event atomically; add replay, bounded retry, dead-letter visibility and reconciliation.
- Build daily/periodic reconciliation reports and discrepancy workflows.
- Separate Jaslyn-Net platform subscription billing from Wi-Fi subscriber packages and customer access entitlements in API, database ownership and UI.

**Acceptance gate**
- Tests cover invalid signatures, duplicates, conflicting event IDs, out-of-order events, timeout/replay, wrong tenant, amount/currency mismatch and ledger/entitlement drift.
- Migration and reconciliation tests run against disposable PostgreSQL.
- Provider sandbox/contract evidence exists before enabling any live payment provider.

### Phase 3 — Network adapter fabric and verified enforcement (P0)

**Deliverables**
- Define a capability contract and registry per vendor, model/controller version, operation and credential/auth mode.
- Distinguish telemetry/read-only from executable mutations. No generic fallback may imply unsupported control.
- Harden timeouts, retries, pagination, rate limits, destination validation, credential scoping, secret redaction and audit correlation.
- Complete MikroTik RouterOS v7 and FreeRADIUS lifecycle verification first; then validate vendor adapters in an explicit priority order based on available test hardware/accounts.
- Add command lifecycle states: queued, executing, succeeded, failed, timed out, verification pending, verified; persist request/result evidence safely.
- Verify post-action state from the device/controller before reporting a mutation as successful.
- Support safe dry-run, explicit approval for risky operations, bounded retry and rollback/compensation only when the vendor supports it.

**Acceptance gate**
- Contract/unit tests pass and controller smoke tests are recorded for each capability marked Native + Tested.
- Disconnect, speed enforcement, voucher provisioning and captive portal are never claimed unless implemented and verified for that specific vendor/version.
- Unknown/unsupported operations fail closed and are visible to operators.

### Phase 4 — Observability, incident and operations center (P1)

**Deliverables**
- Structured logs, metrics, traces and correlation IDs across web/API/workers/provider adapters.
- Health/readiness checks that test meaningful dependencies without leaking secrets.
- Network/site/device/client health with freshness timestamps, latency, jitter, packet loss and WAN quality where telemetry supports it.
- Deduplicated alerts, maintenance windows, incident ownership, timeline, escalation, resolution and customer impact.
- Synthetic checks for internet/DNS/captive portal/RADIUS from approved probes where deployed.
- Status reporting and exportable incident/SLA evidence.

**Acceptance gate**
- Simulated outages produce one actionable incident, observable transitions and a complete audit trail.
- Stale telemetry is explicitly marked stale, never displayed as current.
- Alert delivery failures and worker backlog are observable.

### Phase 5 — Durable automation and configuration lifecycle (P1)

**Deliverables**
- Visual or declarative workflows with triggers, conditions, actions, timeout, bounded retry, deduplication, approvals and execution history.
- Configuration snapshots/version diffs, change approval, staged rollout, and restore/rollback where the integration supports it.
- Policy guardrails for reboot, firewall changes, mass provisioning, access revocation and other high-impact actions.
- Per-tenant and per-vendor concurrency limits, job leases/locks, idempotency and dead-letter/replay tooling.
- Keep manual override and emergency stop available.

**Acceptance gate**
- Tests cover duplicate events, worker restart, partial failure, retry exhaustion, concurrent actions, authorization and audit.
- Destructive workflows cannot run without the required permission/approval.
- Rollback is never advertised where no safe rollback mechanism exists.

### Phase 6 — Subscriber lifecycle, RADIUS, vouchers and customer experience (P1)

**Deliverables**
- Complete plan purchase → verified payment → access grant → RADIUS/session enforcement → usage accounting → expiry/renewal/revocation.
- Voucher batch generation, secure export/print, redemption limits, device/session limits and anti-sharing policies.
- Reseller/agent scope, commissions and settlement evidence.
- Mobile-first, low-bandwidth operator and customer interfaces; accessible forms, explicit loading/error/empty states and usable exports.
- Field work orders, QR-based device lookup, maintenance checklist and offline queue/sync with conflict handling.

**Acceptance gate**
- End-to-end tests prove the customer receives only the purchased entitlement and that expiry/revocation is enforced or clearly reported as unverified.
- Offline synchronization is idempotent and handles conflicts visibly.
- Users and agents cannot view or mutate unassigned tenants/sites/customers.

### Phase 7 — Notifications, API and integration ecosystem (P1)

**Deliverables**
- Provider-agnostic SMS/email/webhook delivery with tenant-scoped settings, encrypted credentials, safe endpoint allowlists, retries and delivery history.
- Keep provider acceptance distinct from handset delivery; add delivery-receipt adapters only when provider contracts support them.
- Versioned public API, scoped API keys, rotation, rate limits, request IDs and documented error semantics.
- Signed webhooks, replay protection, idempotency keys, event versioning and subscriber-visible delivery/replay history.
- Integration contract tests and sandbox/live environment separation.

**Acceptance gate**
- Unit/contract tests verify retries, permanent vs transient errors, SSRF protections, credential isolation, duplicate requests and delivery status semantics.
- No live SMS or webhook campaign is enabled until provider credentials, sender approval, billing and controlled delivery test are verified.

### Phase 8 — Dual deployment: cloud/SaaS and self-hosted (P0/P1)

**Shared deliverables**
- Same versioned application image and database migration set across deployment profiles.
- Environment validation, documented configuration schema, health/readiness probes, graceful shutdown and background-worker lifecycle.
- Secure secrets injection, least-privilege service accounts, TLS, backups, restore instructions and versioned upgrade/rollback procedure.
- SBOM/dependency provenance, image scanning, signed/reproducible release artifacts where practical.

**Cloud/SaaS profile**
- Tenant provisioning and lifecycle, per-tenant quotas, central observability, managed secret storage, automated backups and tested restore.
- Separate production/staging environments; controlled migrations and progressive rollout.
- Resource and noisy-neighbor limits, operational SLOs, alert routing and incident runbooks.

**Self-hosted profile**
- Supported Docker Compose production configuration with persistent volumes, health checks, non-root containers where feasible, resource limits and explicit network exposure.
- Secrets mounted/injected securely; never commit production `.env` files.
- Offline/limited-connectivity installation instructions, upgrade preflight, backup/restore, diagnostics bundle with secret redaction, and rollback steps.
- Explicitly document which external services require outbound connectivity and which integrations need LAN/VPN access.

**Acceptance gate**
- Fresh install, upgrade from previous supported version, backup/restore and rollback rehearsals pass in isolated test environments for both profiles.
- Cloud and self-hosted profiles pass the same functional/security test suite.
- Docker Compose production guidance follows official Docker guidance for production overrides, health checks and secrets; no deployment is called production-ready before rehearsal evidence exists.

### Phase 9 — Performance, resilience and launch readiness (P0)

**Deliverables**
- Define measurable SLOs for API availability/latency, payment processing, queue delay, notification delivery and network command verification.
- Load-test tenant-heavy queries, dashboard aggregation, webhook bursts, worker retries and concurrent device commands.
- Test database connection exhaustion, Redis interruption, worker restart, provider timeout, disk pressure and partial network outages.
- Verify backup restoration and recovery objectives; document incident response, escalation and security disclosure procedures.
- Run end-to-end browser tests and a production-like staging smoke suite.

**Acceptance gate**
- Target load, latency, error-rate and recovery thresholds are agreed and measured; do not invent performance guarantees before testing.
- Critical data can be restored from backup in a timed rehearsal.
- No unresolved release-blocking security, payment integrity, tenant isolation or data-loss defects.

## 4. Suggested delivery order

1. Restore runner/CI execution and establish a trustworthy baseline.
2. Review open PR #68 and #69 against the baseline; run/fix tests before expanding scope.
3. Close tenant/security and payment integrity blockers.
4. Verify core MikroTik/FreeRADIUS flows and formalize vendor capability reporting.
5. Add observability and incident management.
6. Add safe automation and configuration lifecycle.
7. Finish subscriber/voucher lifecycle and field operations.
8. Verify notifications, public APIs and webhooks.
9. Validate both cloud and self-hosted deployment profiles.
10. Run resilience, performance, backup/restore and release rehearsals.

Workstreams may proceed in parallel only when they do not share risky migrations or domain ownership. Dependencies and current blockers take precedence over the nominal phase number.

## 5. Release evidence template

For every PR/release, record:
- Scope and changed domain(s).
- Branch, commit SHA and PR URL.
- Tests executed, exact commands, pass/fail counts and environment.
- Migration validation and rollback evidence.
- Tenant/security checks and scan results.
- External provider/device/controller versions and whether tests were mocked, sandboxed or live.
- Known limitations, operational risks and rollback plan.
- Release decision: **Blocked**, **Ready for review**, **Staging verified**, or **Production approved**.

A code change or authored test alone is not proof of successful execution. Do not mark a phase complete while its acceptance gate lacks evidence.

## 6. References

- `docs/production-readiness.md`
- `docs/product-architecture.md`
- `docs/COMPETITIVE-GAP-AUDIT.md`
- `docs/UPESIPAY-INTEGRATION.md`
- Docker Compose production guidance: https://docs.docker.com/compose/how-tos/production/
- Docker Compose secrets guidance: https://docs.docker.com/compose/how-tos/use-secrets
- GitHub Actions Node 24 migration context: https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/
