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

JASLYN NET is a standalone connectivity and network operations product. **JASLYN and JASLYN NET are distinct products and JASLYN NET does not embed an AI assistant or AI operating layer.**

## Architecture

- Frontend: Next.js + TypeScript
- Backend: NestJS + TypeScript
- Database: PostgreSQL
- Cache/queues: Redis + BullMQ
- AAA: FreeRADIUS
- Network: MikroTik RouterOS v7
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
- Reports, alerts and audit logs
- Captive portals and integrations
- Network operations and router connectivity

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
