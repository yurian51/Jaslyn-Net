# JASLYN NET — Product Architecture

## Product position
JASLYN NET is a multi-tenant connectivity and ISP operations platform for WiFi billing, vouchers, subscriptions, payments, AAA, sessions and network operations.

## Core domains
- Identity, organization and tenant isolation
- Customers and devices
- Sites and routers
- Plans, purchases and voucher batches
- Payments, verification, settlement and reconciliation
- Entitlements, access bindings and RADIUS credentials
- Sessions, accounting and IPAM
- Network commands, enforcement and incidents
- Notifications, reporting and audit logs

## Architecture rule
JASLYN NET is a modular monolith with strict domain ownership. PostgreSQL is the source of truth. External integrations are adapter boundaries and are never represented as operational until independently verified.

## Canonical ownership
- Customer: `customers` / CustomersService
- Package: `packages` / PackagesService
- Purchase: `wifi_plan_purchases` / PurchasesService
- Payment: `payments` / PaymentsService
- Voucher: `vouchers` / VouchersService
- Financial settlement: `financial_ledger_transactions` + entries / PaymentsService settlement path
- Entitlement: `access_grants` / purchase lifecycle and access reconciliation
- Access binding: `customer_access_bindings` / IspOperationsService
- RADIUS credential: `radius_user_credentials` / RadiusService
- Session: `sessions` / SessionsService
- Accounting: `radius_accounting_events` plus session usage reconciliation
- IP allocation: `ipam_addresses` / IpamService
- Router/NAS: `routers` and `radius_nas_clients`, each with distinct ownership
- Network command: network command fabric
- Enforcement: traffic enforcement adapters
- Incident: `incidents` / IncidentsService
- Notification: `notification_outbox` / NotificationsService
- Audit: `audit_logs` / AuditService

## Integration boundaries
### Payments
`PaymentProvider` is an extension boundary. A provider is not operational merely because it exists in the product catalog or has tenant configuration. Provider execution and verification must be backed by a real adapter. Unsupported external operations fail closed.

### RADIUS
RADIUS authenticates against active access bindings and their credentials. RADIUS accounting is network-observed evidence and must not become a second commercial/session authority.

### Network
Router management and enforcement are capability-driven. A catalog entry is not an implementation. Network state is only updated from verified device interaction or explicit persisted operational evidence.

## Security invariants
- No secrets in Git.
- Strong password hashing and encrypted network credentials.
- Tenant boundaries are enforced in API/service/database access paths.
- Critical mutations produce audit events.
- Payment state transitions are database-guarded.
- Payment settlement requires a persisted successful payment.
- Network mutations use idempotent command state and verified execution.
- Access reconciliation fails closed when network enforcement cannot be verified.
- Real integrations are never represented as connected until verified.


## Capability truth and AI safety

Every externally visible integration or advanced capability must have an explicit operational status:
- **Native + Tested:** executable implementation with repeatable automated tests and recorded integration evidence.
- **Beta / Limited:** executable, but only a documented subset or non-production validation is available.
- **Catalogue only:** metadata/discovery entry exists; no claim of working operational integration.
- **Unavailable:** not executable in the current deployment.

For AI/NOC features:
- Start with read-only evidence retrieval and diagnosis.
- Every finding should include evidence source and observation time; label missing/stale data.
- Enforce tenant scope and RBAC before retrieval and before any proposed action.
- State-changing actions require policy evaluation, an explicit preview, approval when risky, audit logging and verification; provide rollback where supported.
- A language model's output is not authoritative evidence of payment, session, router or customer state.
