# JASLYN NET Production Readiness

## Current foundation

> The package filter names below are retained as currently documented; verify them against the workspace manifests before using these commands in release automation.

- Repository identity: `yurian51/Jaslyn-Net`
- Frontend: Next.js + TypeScript
- API: NestJS + TypeScript
- Database: PostgreSQL
- Authentication: JWT with issuer/audience validation
- Multi-tenant overview queries scoped by `tenant_id`
- CI validates migrations, typechecks and builds both applications
- Health endpoint: `/api/v1/health`
- Readiness endpoint: `/api/v1/ready`
- Branded loading, runtime-error and not-found experiences

## Release gates

1. `pnpm install --no-frozen-lockfile --ignore-scripts`
2. `pnpm --filter @nexora/api typecheck`
3. `pnpm --filter @nexora/web typecheck`
4. `pnpm --filter @nexora/api build`
5. `pnpm --filter @nexora/web build`
6. Validate database migrations against a disposable PostgreSQL instance.
7. Run API unit/integration tests.
8. Run authenticated tenant-isolation tests.
9. Verify payment webhook idempotency and signature validation before enabling production payments.
10. Verify router connectivity and RADIUS flows against non-production network hardware.

## Production blockers to close before launch

- Real payment-provider adapters and webhook signature verification
- MikroTik/RouterOS integration with retry, timeout and credential isolation
- RADIUS/PPPoE lifecycle automation
- Background jobs and durable retry queues
- Secrets management and environment validation
- Rate limiting and abuse protection
- Structured logging, metrics and tracing
- Backup/restore verification
- Disaster recovery procedure
- Production deployment and smoke tests
