# India Research — Initial Jaslyn Net Repository Gap Map

Date: 2026-10-12
Branch: research/india-top100-platform-audit
Repository reviewed: `yurian51/Jaslyn-Net`, default branch `main`

## Evidence reviewed
- `README.md`: Next.js/TypeScript frontend, NestJS API, PostgreSQL, Redis/BullMQ, FreeRADIUS, vendor-neutral adapter fabric, MikroTik RouterOS v7 first executable native adapter, WireGuard, Docker/GitHub Actions.
- `docs/PRODUCT-STRATEGY-AND-ROADMAP.md`: existing regional competitor benchmark and product principles.
- `docs/WORKFLOW-AUTOMATION-FOUNDATION.md`: native tenant-safe workflow engine specification; document explicitly says PR #83 implements only a subset and remaining items require implementation/verification.
- `docs/ENTERPRISE-CAPABILITIES-IMPLEMENTATION.md`: staged implementation and CI runtime verification blocked by GitHub Actions runner startup failures; migration sequence 062–070 documented as not yet runtime-verified.
- `package.json`: pnpm monorepo scripts for build, lint, test and typecheck.
- `render.yaml`: API and web services plus PostgreSQL; API startup runs migrations. Review production deploy state separately; YAML is not proof of a successful live deployment.

## Early gap hypotheses to verify in code (not yet findings)
1. Workflow engine: compare actual node types and execution guarantees with the workflow foundation acceptance contract; prioritize version isolation, idempotency, retry/dead-letter, webhook replay protection, outbound SSRF controls and cross-tenant tests.
2. Payment assurance: verify webhook signatures, replay protection, idempotency under concurrency, refunds/credits, bank/provider settlement reconciliation, and immutable audit trail.
3. Vendor fabric: distinguish executable adapters from catalogue-only records; prove each adapter with mocked contract tests and a supported device/API. Do not mark vendor supported solely from a UI label.
4. Captive portal/RADIUS: test voucher lifecycle, package expiry, session accounting, disconnect/revoke, duplicate accounting events and tenant boundaries.
5. Database delivery: resolve GitHub Actions runner startup issue, then run fresh install, upgrade, rollback/restore and migration collision checks against disposable PostgreSQL.
6. Offline field operations: test duplicate/out-of-order sync, photo idempotency, conflicts and recovery after network interruption.
7. India-specific capabilities: keep UPI, GST and India regulatory reporting behind regional configuration and provider adapters; do not hard-code into Tanzania tenants.
8. Messaging: validate provider status callbacks, retry/backoff, delivery idempotency, consent/opt-out and tenant-level credential isolation before any live send.

## Research candidate takeaways from official public product pages
- Spacecom/Log2Space publicly describes subscriber billing, multiple NAS/RADIUS, reseller/franchise management, payments, inventory, helpdesk, lead management and messaging. Evaluate as a capability benchmark, not as code to copy.
- Xonware/XIMS publicly describes subscriber lifecycle, billing, payments, CRM/support, partners, field teams, reporting, IPAM/DDI and security products. Evaluate its operational data-model and reconciliation patterns.
- Tathya/OrbOS publicly describes RADIUS AAA, GST billing, provisioning, fiber GIS, TR-069/CPE management, monitoring, inventory and notifications.
- These are vendor statements; validate through technical documentation/demo and tests before adoption.

## Next engineering steps
1. Review the source paths named in the existing implementation-status docs and workflow specification.
2. Run the current CI workflow and collect the exact runner failure before changing workflow logic.
3. Establish a disposable PostgreSQL migration test with fresh install, upgrade and rollback/restore coverage.
4. Add testable contract acceptance criteria for payment, RADIUS, adapter and workflow features.
5. Create a separate implementation PR only after the repository gap is proven and scope is safe.
