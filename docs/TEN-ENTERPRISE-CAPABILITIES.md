# Ten Enterprise Capabilities — Integration and Release Plan

**Product:** JASLYN NET  
**Branch:** `feat/ten-enterprise-capabilities-hub`  
**Purpose:** Track and expose the ten requested capability areas without duplicating existing domains or misrepresenting planned work as production-ready.

## Capability integration matrix

| # | Capability | Existing foundation to reuse | Additional work required before claiming complete |
|---|---|---|---|
| 1 | Network Auto-Healing | Router inventory, incidents, workflows, automation and network command verification | Explicit remediation policy allowlist, deduplication/cooldowns, approval gates, rollback strategy, post-action state verification and replay tests |
| 2 | Fiber GIS & OLT/ONU | New tenant-scoped `fiber_network_assets` schema, CRUD API, coordinate links, parent-child topology and audited status updates | OLT/ONU vendor adapters, optical telemetry, provisioning contracts, visual GIS map and device contract tests |
| 3 | Customer Self-Service Portal | Customer commerce, packages, payments, subscriptions and incidents | Subscriber identity/ownership tests, invoices and receipts, renewals, service actions and secure account recovery |
| 4 | Bandwidth Intelligence & QoS | Operations intelligence and capacity estimates | Time-series ingestion from tested adapters, data freshness, per-subscriber/site utilization, vendor-specific shaping policies and read-back verification |
| 5 | Revenue Assurance | Revenue assurance and financial ledger domains | Provider settlement imports, invoice reconciliation against the canonical invoice domain, discrepancy workflows and concurrent/idempotency tests |
| 6 | SLA & Smart Dispatch | Incidents, SLA policy, field operations and technician workflows | End-to-end SLA clock calculations, assignment constraints, dispatch receipts, offline synchronization and closure evidence |
| 7 | Configuration Backup & Rollback | Network inventory, secret vault, audit and network change intelligence | Encrypted/redacted snapshots, versioned diffs, retention, dry-run, approval, vendor restore contracts and verified rollback |
| 8 | Reseller & Franchise | Agent/sales domains, tenant hierarchy, commissions and usage quotas | Explicit delegated scopes, parent approval, commission settlement reconciliation and cross-tenant denial tests |
| 9 | Security Operations Center | Security posture, audit, synthetic monitoring and incident lifecycle | Unified alert queue, severity/ownership/escalation, evidence links, deduplication and tested incident-to-resolution workflow |
| 10 | SaaS Marketplace & Tenant Plans | Tenant usage/quota controls, API/webhooks and tenant branding | Canonical platform plan entitlements, plan lifecycle, enforcement at every API boundary, subscription billing integration and quota tests |

## Safety and implementation rules

- No AI feature is introduced by this work.
- Every request must remain tenant-scoped and permission-checked in the API; UI hiding is not authorization.
- State-changing router operations must use the existing command fabric and vendor capability contract. Do not claim success until device state is read back.
- Do not create a second source of truth for invoices, payments, entitlements, incidents, tenant plans or device inventory.
- Hardware-dependent capabilities must show `Integration required` until the actual adapter is configured and passes contract tests.
- Database changes must use the next unused migration number after checking every relevant base/stacked branch. Never guess the next migration number from a single branch.
- Never commit credentials, tokens, customer data or router configuration secrets.
- A capability is complete only after API/UI integration, migration/fresh-install/upgrade/rollback checks, tenant-isolation tests, permission tests, unit/integration tests, and reproducible verification evidence.

## Current UI truth

The new Enterprise Capabilities page is a navigation and status surface, not proof that all ten end-to-end implementations are complete. Existing foundations are marked separately from external integration work and planned Fiber GIS/OLT/ONU work. Do not use the status catalog as a release certification.
