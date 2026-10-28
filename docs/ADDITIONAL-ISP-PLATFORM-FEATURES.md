# Jaslyn Net — Additional ISP Platform Features

**Status:** proposed engineering backlog, not a claim of implementation. These items extend the existing 28-feature operations scope. Build them natively inside Jaslyn Net and integrate with existing billing, subscriber, vendor-adapter, audit, RBAC and tenant systems. No AI-specific features.

## Access network and addressing

29. **IPAM and Address Lifecycle:** tenant-scoped IPv4/IPv6 pools, subnet allocation, reservation, conflict detection, DHCP lease visibility, utilization alerts and audited release/reassignment.
30. **CGNAT and Public-IP Accounting:** track subscriber-to-public-IP/port mappings from supported sources, retention policies, precise time windows, export controls and access auditing.
31. **IPv6-First Subscriber Operations:** prefix delegation, IPv6 pools, DHCPv6/RA status, dual-stack entitlements, reachability checks and IPv4/IPv6 parity reporting.
32. **BGP/ASN and Upstream Health:** peer state, prefix counts, route-change events, upstream latency/loss and controlled maintenance records from supported router telemetry.
33. **Fiber Plant GIS and Optical Budget:** map routes, poles, splice closures, splitters, ODF/ODP, ports, strands and customer drops; record optical readings and calculate estimated loss with source and confidence.
34. **OLT/ONT Provisioning Lifecycle:** supported vendor capability matrix, serial/LOID registration, service-port/VLAN profiles, optical signal, rogue/unauthorized ONT alerts and read-back verification.
35. **Wi-Fi Controller and RF Operations:** AP inventory, SSID/security profiles, channel and power state, client roaming, interference and per-radio capacity where controller/device APIs support them.
36. **Spectrum and Link Quality Register:** record wireless link endpoints, frequency/channel width, RSSI/SNR, modulation, noise floor, alignment and licensed/unlicensed spectrum constraints.

## AAA, access policy and service delivery

37. **RADIUS Accounting Reconciliation:** reconcile Start/Interim-Update/Stop records, detect stale sessions, deduplicate events, recover missing stops and expose session history with tenant-safe queries.
38. **Captive Portal and Voucher Studio:** branded portal templates, voucher batches, expiration, device limits, terms acceptance, redemption audit and payment-to-access entitlement linkage.
39. **AAA Policy Test Bench:** safely simulate authorization inputs against configured policies, show matched rules and expected attributes, and test policy changes before rollout without opening a live session.
40. **Subscriber Device and CPE Management:** CPE/ONT/router association, provisioning state, firmware eligibility, remote diagnostics and supported TR-069/TR-369 or vendor API capability tracking.
41. **Service Activation Orchestrator:** explicit activation state machine across payment, subscriber record, AAA, address assignment, device provisioning and customer notification; retries, compensation and operator repair queue.

## Commercial and partner operations

42. **Reseller and Wholesale Hierarchy:** parent/child tenants, delegated customer ownership, wholesale rate cards, reseller margin, usage attribution and strict visibility/permission boundaries.
43. **White-Label Tenant Provisioning:** branded domain, logo, theme, sender identities, invoice/receipt templates and tenant-level feature entitlements with safe defaults.
44. **Recurring Billing and Tax Rules:** billing cycles, proration, discounts, credits, tax configuration, invoice numbering and immutable invoice adjustments with jurisdiction-specific configuration.
45. **Payment Provider Failover and Settlement Tracking:** provider health, idempotent payment intents, callback verification, settlement batches, fees, chargebacks and operator-controlled failover rules.
46. **Collections and Debt Recovery Workflow:** aging buckets, promises to pay, reminders, dispute holds, partial settlements, write-off approvals and complete ledger linkage.
47. **Procurement and Supplier Performance:** purchase requests, approvals, purchase orders, goods receipt, supplier invoices, lead times, returns and landed-cost allocation to inventory.

## Reliability, governance and integrations

48. **Event Bus and Transactional Outbox:** durable domain events, outbox relay, consumer idempotency, dead-letter queues, replay controls and per-tenant event visibility.
49. **Webhook Delivery Operations:** signed payloads, endpoint verification, delivery attempts, exponential backoff, replay protection, dead-letter handling and secret rotation.
50. **API Client and Quota Management:** scoped API credentials, expiry/rotation, per-tenant rate limits, usage metering, revocation, audit and machine-readable API compatibility.
51. **Data Retention and Privacy Controls:** configurable retention by record category, legal holds, controlled export, redaction/anonymization workflows and auditable deletion evidence.
52. **Backup Integrity and Restore Validation:** encrypted backup manifests, checksums, restore-to-isolated-environment tests, measured RPO/RTO and alerts for missed or invalid backups.
53. **Release and Feature-Flag Governance:** tenant-safe staged rollout, migration compatibility checks, kill switches, rollout audit and automatic disablement on defined health thresholds.
54. **Operational Runbook Library:** versioned runbooks with prerequisites, permissions, impact warnings, dry-run, approval, execution log, verification and rollback instructions.
55. **Data Quality and Duplicate Resolution:** detect duplicate subscribers, devices, invoices and transactions; present explainable matches and require authorized review before merge.

## Engineering acceptance gates

Every item must reuse the canonical domain model where possible and include:
- Schema migration and recovery strategy where needed.
- Authenticated APIs, tenant/site scopes, least-privilege permissions and cross-tenant negative tests.
- UI backed by real API responses with loading, empty, stale, error and retry states.
- Audit events, structured logs, metrics, alerts and an operator runbook.
- Unit, integration and end-to-end tests for the real workflow and its side effects.
- Vendor/provider-specific tests in a sandbox or hardware lab. Simulated behavior must be clearly labeled and cannot count as live integration proof.
- Status evidence on the tested commit: `pass`, `fail`, `blocked` or `not-run`.

## Delivery sequencing

1. **Foundation first:** migrations, CI, tenant isolation, RBAC, audit, secrets and observability.
2. **Access and subscriber paths:** IPAM/IPv6, RADIUS accounting, captive portal, OLT/ONT and service activation.
3. **Network operations:** fiber GIS, Wi-Fi/RF, BGP/upstream health and CPE management.
4. **Commercial scale:** reseller hierarchy, white-label provisioning, recurring billing, collections and supplier procurement.
5. **Platform maturity:** outbox/webhooks, API quotas, retention/privacy, restore validation and release governance.

This backlog must be reconciled against existing code before implementation to avoid duplicate modules. Documentation alone is not implementation evidence.
