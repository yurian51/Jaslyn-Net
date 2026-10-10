# JASLYN NET Production Readiness

## Current foundation

- Repository identity: `yurian51/Jaslyn-Net`
- Frontend: Next.js + TypeScript
- API: NestJS + TypeScript
- Database: PostgreSQL
- Authentication: JWT with issuer/audience validation
- Multi-tenant overview queries scoped by `tenant_id`
- CI workflow is configured to validate migrations, typechecks and builds both applications; execution is currently unverified because GitHub Actions runs fail before creating jobs (see CI_RUNNER_DIAGNOSTIC.md)
- Health endpoint: `/api/v1/health`
- Readiness endpoint: `/api/v1/ready`
- Branded loading, runtime-error and not-found experiences

## Release gates

1. `pnpm install --no-frozen-lockfile --ignore-scripts`
2. `pnpm --filter @jaslyn-net/api typecheck`
3. `pnpm --filter @jaslyn-net/web typecheck`
4. `pnpm --filter @jaslyn-net/api build`
5. `pnpm --filter @jaslyn-net/web build`
6. `pnpm --filter @jaslyn-net/api test -- --runInBand`
7. Validate database migrations against a disposable PostgreSQL instance.
8. Run authenticated tenant-isolation tests.
9. Verify payment webhook signature validation, duplicate-event handling, durable outbox atomicity, amount/currency matching and settlement idempotency before enabling production payments.
10. Verify router connectivity and RADIUS flows against non-production network hardware.
11. Run `pnpm lint`, `pnpm typecheck` and `pnpm build` from the workspace root once runner execution is restored.

## Production blockers to close before launch

- Provider-specific payment adapters and live provider contract verification (generic HMAC validation alone does not prove a provider integration is production-ready)
- MikroTik/RouterOS integration with retry, timeout and credential isolation
- RADIUS/PPPoE lifecycle automation
- Background jobs and durable retry queues; confirm webhook event + outbox writes are atomic and dead-letter handling is monitored
- Secrets management and environment validation
- Rate limiting and abuse protection
- Structured logging, metrics and tracing
- Backup/restore verification
- Disaster recovery procedure
- Production deployment and smoke tests


## Current verification state (2026-10-10)

- [ ] Full CI pipeline executed successfully on the current branch.
- [ ] API lint, typecheck, unit tests and build confirmed by executed runner output.
- [ ] Web typecheck and build confirmed by executed runner output.
- [ ] Database migrations tested against disposable PostgreSQL.
- [ ] Payment webhook signature/idempotency tests executed.
- [ ] Live provider and non-production router/RADIUS flows verified.

GitHub Actions has previously reported startup failures with zero jobs/steps created, including for a minimal smoke workflow. This is not evidence of an application test failure or a passing build. Follow CI_RUNNER_DIAGNOSTIC.md to restore runner execution before treating CI as release evidence.


## Payment webhook invariants

- Authenticate the exact raw request bytes; never verify a re-serialized JSON body.
- Do not settle, activate Wi-Fi access, or issue refunds directly from receipt of a webhook. Receipt creates an unverified event only.
- Persist the webhook event and its durable domain/outbox event in one database transaction so a queue failure cannot strand a permanently deduplicated event.
- Keep the normalized provider status, internal payment/purchase reference, provider reference, and provider payload available to the downstream verifier.
- Treat retries as idempotent; a reused provider event ID with conflicting event identity must not mutate an earlier event.
- Downstream settlement must independently verify tenant ownership, provider, amount, currency, and permitted state transition before updating the ledger or access.
- Monitor events that remain `RECEIVED` or fail repeatedly; test recovery and replay in a non-production environment.
