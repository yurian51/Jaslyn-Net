# Platform subscription implementation

## Implemented surfaces

- `GET /api/v1/platform-subscriptions/plans`: returns active platform SaaS plans, sorted by price and billing interval.
- `GET /api/v1/platform-subscriptions/current`: returns the latest active/trial/past-due subscription where possible, otherwise the latest historical subscription, scoped to the authenticated tenant.
- `/dashboard/platform-subscription`: operator-facing page showing current plan, status, billing period, router/site/customer limits and real API-backed catalogue cards.
- Main navigation separates **Platform Subscription** from **WiFi Tiers** and **Plans & Products**.

## Product-domain separation

1. **Platform subscription** is the fee the WiFi operator pays to use JASLYN NET. Its source tables are `saas_plans` and `organization_subscriptions`.
2. **WiFi subscriber package** is the access bundle an end customer buys. Its source tables and routes remain under `packages`, purchases and payments.

The platform screen deliberately does not invent pricing or claim self-service checkout exists. If there are no active SaaS plans or no subscription assigned, it shows an explicit empty state rather than fabricated values.

## Verification status

- Unit tests added for active-plan catalogue filtering and tenant-scoped subscription reads.
- Route code uses the existing global PostgreSQL pool and existing JWT/RBAC guards.
- Build and integration status must be taken from CI; do not treat file commits as a successful build.
- Payment checkout, subscription provisioning, cancellation, entitlement enforcement and billing renewal are not implemented by this read-only surface and remain separate production work.
