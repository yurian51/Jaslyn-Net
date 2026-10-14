# Ten Enterprise Capabilities — Integration and Release Plan

**Product:** JASLYN NET  
**Branch:** `feat/ten-enterprise-capabilities-hub`  
**Purpose:** Track and expose the ten requested capability areas without duplicating existing domains or misrepresenting planned work as production-ready.

## Capability integration matrix

| # | Capability | Existing foundation to reuse | Additional work required before claiming complete |
|---|---|---|---|
| 1 | Network Auto-Healing | New disabled-by-default tenant policy, bounded retry ledger, cooldown, audit and retry queue through the existing network command worker | Router reboot and general remediation remain unsupported; prove migration, concurrency, command replay and post-action verification in integration tests |
| 2 | Fiber GIS & OLT/ONU | New tenant-scoped `fiber_network_assets` schema, CRUD API, coordinate links, parent-child topology and audited status updates | OLT/ONU vendor adapters, optical telemetry, provisioning contracts, visual GIS map and device contract tests |
| 3 | Customer Self-Service Portal | Migration `080_customer_self_service_portal.sql`; one-time hashed invitations; scrypt password storage; customer-scoped, revocable 12-hour sessions; token-bound overview, packages, support and purchase-intent endpoints; portal and invitation UIs | Run activation/login lockout/session revocation/tenant-isolation/payment intent tests; SMS/email delivery of invitations is not automated, and self-service plan purchase/renewal orchestration remains limited to existing pending purchases and commerce flows |
| 4 | Bandwidth Intelligence & QoS | Operations intelligence and capacity estimates | Time-series ingestion from tested adapters, data freshness, per-subscriber/site utilization, vendor-specific shaping policies and read-back verification |
| 5 | Revenue Assurance | Revenue assurance and financial ledger domains | Provider settlement imports, invoice reconciliation against the canonical invoice domain, discrepancy workflows and concurrent/idempotency tests |
| 6 | SLA & Smart Dispatch | Incidents, SLA policy, field operations and technician workflows | End-to-end SLA clock calculations, assignment constraints, dispatch receipts, offline synchronization and closure evidence |
| 7 | Configuration Backup & Rollback | Network inventory, secret vault, audit and network change intelligence | Encrypted/redacted snapshots, versioned diffs, retention, dry-run, approval, vendor restore contracts and verified rollback |
| 8 | Reseller & Franchise | Agent/sales domains, tenant hierarchy, commissions and usage quotas | Explicit delegated scopes, parent approval, commission settlement reconciliation and cross-tenant denial tests |
| 9 | Security Operations Center | Security posture, audit, synthetic monitoring and incident lifecycle | Unified alert queue, severity/ownership/escalation, evidence links, deduplication and tested incident-to-resolution workflow |
| 10 | SaaS Marketplace & Tenant Plans | Tenant usage/quota controls, API/webhooks and tenant branding | Canonical platform plan entitlements, plan lifecycle, enforcement at every API boundary, subscription billing integration and quota tests |

## Added end-to-end foundations in this change\n\n- **Fiber topology inventory:** migration `078_fiber_topology_inventory.sql`, tenant-scoped CRUD endpoints at `/api/v1/fiber/assets`, parent-child validation, case-insensitive tenant asset codes, coordinates, optional same-tenant router links, and audit events. This is not yet a live optical telemetry or vendor provisioning integration.\n- **Network Auto-Healing:** migration `079_network_auto_healing.sql`, tenant policy API and console, disabled-by-default bounded retries for supported failed network commands, cooldown, a unique attempt ledger, and audit records. Retries re-enter the existing network command worker; only that worker can execute and verify. Router reboot and arbitrary command execution are deliberately unsupported.\n- **Customer self-service:** migration `080_customer_self_service_portal.sql`; operators issue one-time invitation tokens (only token hashes are stored), customers activate a password with scrypt hashing, login attempts are locked after repeated failures, and portal JWT sessions are checked against a revocable database session on every request. Customer endpoints derive the customer ID from the verified portal token and check purchase ownership before creating payment intents.\n- **Automated tests authored:** service tests cover tenant isolation and bounded retry logic. They must still execute in CI and against PostgreSQL before these capabilities can be called verified.\n\n## Safety and implementation rules

- No AI feature is introduced by this work.
- Every request must remain tenant-scoped and permission-checked in the API; UI hiding is not authorization.
- State-changing router operations must use the existing command fabric and vendor capability contract. Do not claim success until device state is read back.
- Do not create a second source of truth for invoices, payments, entitlements, incidents, tenant plans or device inventory.
- Hardware-dependent capabilities must show `Integration required` until the actual adapter is configured and passes contract tests.
- Migrations `078`–`080` are independent of the staged financial/MSP migrations `073`–`077`; when those changes land together, run all migrations in lexical order. Verify migration-prefix uniqueness and run fresh-install/upgrade tests before release.
- Never commit credentials, tokens, customer data or router configuration secrets.
- A capability is complete only after API/UI integration, migration/fresh-install/upgrade/rollback checks, tenant-isolation tests, permission tests, unit/integration tests, and reproducible verification evidence.

## Current UI truth

The new Enterprise Capabilities page is a navigation and status surface, not proof that all ten end-to-end implementations are complete. Existing foundations are marked separately from external integration work and planned Fiber GIS/OLT/ONU work. Do not use the status catalog as a release certification.
