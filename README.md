# JASLYN NET

**Connectivity & ISP Operating System**

JASLYN NET is the network operations platform within the JASLYN ecosystem, built by YURIAN TECH LTD for WiFi businesses, hotspot operators and ISPs.

## Product

JASLYN NET unifies WiFi/ISP billing, customers, locations, routers, HotSpot, vouchers, subscriptions, payments, sessions, agents, reporting and network operations in one control plane.

## Product identity

- **Master brand:** JASLYN
- **Product:** JASLYN NET
- **Company:** YURIAN TECH LTD
- **Category:** Connectivity & ISP Operating System
- **Tagline:** Connect. Control. Grow.

JASLYN NET is a standalone connectivity and network operations product designed to support an evidence-first AI operating layer. AI/NOC capabilities are roadmap intent unless the relevant end-to-end implementation and tests demonstrate they are available. Any AI-assisted operation must remain constrained by tenant scope, RBAC, risk policies, approvals, audit trails and verification.

## Architecture

- Frontend: Next.js + TypeScript
- Backend: NestJS + TypeScript
- Database: PostgreSQL
- Cache/queues: Redis + BullMQ
- AAA: FreeRADIUS
- Network: vendor-neutral adapter fabric with MikroTik RouterOS v7 as the first executable native adapter
- Secure router connectivity: WireGuard
- Deployment: Docker + GitHub Actions

## Core modules

- Executive overview and analytics
- Multi-tenant organizations and locations
- Customer and device management
- Plans, packages, vouchers and subscriptions
- Hotspots, routers, RADIUS and live sessions
- Payments, transactions and reconciliation
- Agents and reseller operations
- Reports, alerts, audit logs and AI agent runs
- AI agent orchestration, specialist agents, skills, dynamic tool registry and policy-controlled autonomy
- Evidence-first incident investigation, payment reconciliation and network operations planning
- Captive portals and integrations
- Network operations and router connectivity
- Hybrid adapter registry with explicit executable vs catalogue-only capability state
- AI operating layer over the universal command fabric, with approval-gated state-changing actions
- Vendor-neutral RADIUS/AAA fallback for supported NAS/controller environments

## Security baseline

JASLYN NET is designed around tenant isolation, RBAC and least privilege, audit logging, signed payment webhooks, encrypted router credentials, rate limiting, idempotent payment processing and controlled destructive operations. Secrets must never be committed to Git.

## Engineering principle

This repository is developed as a real production system, not a static demo. Features must connect end-to-end across the control plane, database, payment layer, AAA layer, network integration and user interface, with verification before being considered complete.

## Status

**FOUNDATION / JASLYN NET BRAND MIGRATION**

## Ecosystem

JASLYN NET is one product in the wider JASLYN ecosystem. Other JASLYN products may exist independently, but their capabilities must not be represented as features of JASLYN NET unless they are explicitly implemented in this repository.


## Intellectual property and source control

JASLYN NET is proprietary software of YURIAN TECH LTD. Repository access does not grant a license to copy, redistribute, modify, reverse engineer, or publish the source. Development access is controlled through GitHub permissions, protected branches, CODEOWNERS and security checks.

Production credentials and secrets are never part of the repository. Use environment/deployment secret storage for credentials.


## Product strategy and delivery documents
- [Enterprise platform execution roadmap (cloud/SaaS + self-hosted)](docs/ENTERPRISE-PLATFORM-ROADMAP.md)

- [Product strategy, 10-competitor benchmark and 90-day roadmap](docs/PRODUCT-STRATEGY-AND-ROADMAP.md)
- [Platform subscription vs WiFi subscriber plan UX and ownership rules](docs/PLAN-CATALOGUE-UX-AND-OWNERSHIP.md)
- [Platform subscription API and UI implementation](docs/PLATFORM-SUBSCRIPTION-IMPLEMENTATION.md)
- [Landing page quality and conversion update](docs/LANDING-PAGE-QUALITY-UPDATE.md)
- [Competitive gap audit and prioritized execution backlog](docs/COMPETITIVE-GAP-AUDIT.md)
- [Production readiness gates and launch blockers](docs/production-readiness.md)
- [Product architecture and source-of-truth rules](docs/product-architecture.md)
- [UpesiPay integration boundary and verification notes](docs/UPESIPAY-INTEGRATION.md)

**Capability truth rule:** AI-NOC and other roadmap capabilities must be treated as intended product direction unless an end-to-end implementation and its tests prove the capability exists. Never infer production readiness from README wording alone.
