# NetBill-Noc → Jaslyn Net Feature Parity

This document records the feature set audited from `yurian51/NetBill-Noc` and the corresponding Jaslyn Net capability. The goal is functional parity, not copying the NetBill UI or architecture.

## Audited NetBill-Noc capabilities

| NetBill capability | Jaslyn Net target |
|---|---|
| Subscribers / customer lifecycle | Customers + ISP operations |
| Package / plan catalogue | Packages |
| Prepaid/postpaid billing | Billing + purchases |
| Invoices and invoice lines | Billing + financial operations |
| Payments and provider workflows | Payments + provider catalog |
| Payment verification / idempotency | Payment hardening + verification boundary |
| M-Pesa / mobile-money workflow | Payment provider adapter architecture |
| Voucher batches and redemption | Vouchers |
| Free trials / device limits | Packages + vouchers + access grants |
| Entitlements / service access | Access grants + ISP service state |
| Hotspot / PPPoE | RADIUS + network command fabric |
| RADIUS authentication/accounting | RADIUS AAA |
| Live sessions | Sessions |
| Auto activation / suspension | Entitlement + expiry + network enforcement |
| Network devices | Routers / network device management |
| Router command execution | Network Command Fabric |
| MikroTik integration | Native MikroTik REST adapter |
| Network telemetry | Network device adapter registry |
| Multi-WAN | Load balancing |
| Captive portal | Customer/access-network portal flows |
| Customer self-service | Customer/account/purchase/payment surfaces |
| Resellers / commissions | Financial operations + reseller domain |
| Wallet / ledger | Financial ledger + account operations |
| Refunds / adjustments / disputes | Financial operations |
| Reconciliation | Session/payment reconciliation |
| Audit logs / correlation tracing | Audit + correlation context |
| Notifications / reminders | Notifications/outbox |
| Reports / revenue / usage analytics | Overview + billing/payments/sessions analytics |
| Promo codes | Promotions engine (implemented in this change) |
| Background jobs / scheduled operations | Worker services / operational workers |
| Device/site health alerts | Incidents + router health |
| CSV/report export | Reporting/export surfaces |
| Role-based access | Auth + RBAC |

## Important implementation rule

NetBill-Noc is the functional benchmark. Jaslyn Net remains the canonical architecture. Existing Jaslyn capabilities must not be duplicated merely to reproduce NetBill's internal file structure.

## Newly completed parity item

The audited NetBill promotion engine supported:

- percentage and fixed discounts
- expiry
- total usage limits
- per-customer usage limits
- minimum order amount
- maximum discount
- package eligibility
- first-payment-only restrictions
- redemption accounting

Jaslyn now implements these rules transactionally through:

- `apps/api/src/promotions/promotions.service.ts`
- `apps/api/src/promotions/promotions.controller.ts`
- `apps/api/src/promotions/promotions.dto.ts`
- `apps/api/migrations/044_promotions_and_purchase_discounts.sql`

Promo discounts are applied at purchase creation and redemption is recorded only after a successful payment, with a unique purchase redemption boundary to prevent duplicate counting.

## Remaining parity discipline

Where NetBill exposes a vendor-specific behavior that Jaslyn does not have a verified native adapter for, Jaslyn must expose it as unsupported/catalog-only rather than pretending a generic HTTP call is a native vendor adapter. This is especially important for production network control.
