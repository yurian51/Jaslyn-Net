# Jaslyn Net — Global ISP Platform Gap Map
**Research date:** 2026-10-11  
**Scope:** Kenya, Tanzania, South Africa, India, United Kingdom, plus globally relevant OSS/BSS, automation, network inventory and operations projects.  
**Purpose:** turn competitive research into a verified implementation backlog. This document is a research artifact, not a claim that these capabilities are already implemented or production-ready.

## Operating rule
Treat previously requested Jaslyn Net capabilities as requirements: payments and reconciliation; receivables/credits/refunds/debt aging; purchase orders/supplier invoices/stock valuation; financial audit trail; tenant-specific reporting/CSV exports; customer captive portal; voucher/login/mobile-money payments; workflow automation; SMS; vendor adapters; security; offline field operations; incidents; independent public routes; and production verification. Exclude AI features as previously requested. Reuse existing code and migrations rather than creating duplicate modules.

## Market map and lessons to investigate

### East Africa
- **Optinet / Kenya** — ISP operations and local payment/captive portal patterns. Verify live demos, actual API coverage, supported NAS/device matrix and whether features are included or add-ons. https://optinet.co.ke/platform/
- **ISPman / Kenya** — local billing, payment and hotspot workflow patterns. https://ispman.co.ke/features
- **Net254 / Kenya** — branded per-ISP captive portal, phone OTP, M-Pesa STK Push, session activation after verified callback, usage caps and SMS expiry alerts. Treat published speed/latency claims as vendor claims until independently tested. https://www.net254.com/
- **NetPay Billing / Kenya** — multiple payment gateway integrations, subscriber/billing/hotspot workflows. Verify provider coverage, idempotency and settlement reports. https://netpaybilling.com/
- **Sparo / Kenya** — newer local market option; compare payment, MikroTik, PPPoE, RADIUS and support maturity. https://sparo.run/blog/isp-billing-systems-kenya-2026-options
- **Farman Connect / Tanzania** — hotspot, mobile money and customer management patterns; verify device support and beta limitations. https://farmanconnect.co.tz/
- **Hotspot Tanzania** — local hotspot/billing workflows. https://hotspots.co.tz/
- **Gradius / regional** — compare local billing and RADIUS workflows. https://zyraaf.cloud/
- **Regional payment adapters to assess** — M-Pesa Daraja, Airtel Money, Mixx by Yas, HaloPesa, Pesapal, Flutterwave, Paystack, Selcom, DPO and bank/mobile-money settlement exports. Do not mark a provider as supported until sandbox tests, signed callback verification, replay protection, reconciliation and refund handling pass.

### South Africa
- **Splynx** — broad ISP billing, subscriber lifecycle, RADIUS, provisioning, field teams, finance and integrations. https://splynx.com/
- **DataTill** — ISP billing and operations; inspect accounting, support and network integration boundaries. https://datatill.com/
- **OneWISP** — customers, billing, RADIUS sessions, highsites, helpdesk, field teams and accounting integrations; named equipment includes MikroTik, Ubiquiti, Cambium, Mimosa, BDCOM, Juniper and Cisco. https://one-wisp.co.za/
- **Iterative Billing** — billing, RADIUS, OLT, TR-069, NOC monitoring and accounting. https://iterativebilling.com/
- Research compliance and commercial requirements separately; do not assume a South African feature or legal requirement automatically applies to Tanzania/Kenya/UK.

### India
- **ISPRadius** — OSS/BSS, subscriber lifecycle, RADIUS/AAA, GST billing, multi-level franchise/revenue share, OLT/switch monitoring, Wi-Fi/hotel, TR-069 and IPDR/NetFlow features. https://ispradius.net/
- **IndiaRadius** — RADIUS, billing, TR-069 and zero-touch CPE provisioning claims; verify vendor support and real deployments. https://indiaradius.com/
- **GlobalRadius** — prepaid/postpaid, AAA, TR-069 and monitoring. https://globalradius.in/
- **NowaCRM** — compare CRM, billing and network integration patterns. https://nowacrm.in/
- India-specific GST, DOT, IPDR and franchise workflows are reference patterns only. Make jurisdiction-specific modules configurable; never hard-code India regulations into the common billing core.

### United Kingdom and global ISP BSS/OSS
- **Splynx UK** — recurring broadband billing, customer self-service and provisioning patterns. https://splynx.com/splynx-for-uk-isps/
- **Sonar** — subscriber lifecycle, billing, provisioning, ticketing and integrations. https://sonar.so/
- **VISP** — ISP billing, customer management and provisioning. https://visp.net/
- **Powercode** — billing, network and subscriber management. https://powercode.com/
- **UISP** — network/device management plus CRM/billing patterns for supported ecosystems. https://uisp.com/
- **gaiia** — broadband operator OSS/BSS and service lifecycle patterns. https://gaiia.com/
- UK references to study: Direct Debit/GoCardless-style recurring payment states, VAT configuration, consumer notices, portability of subscriber data, and auditability. Treat compliance as legal review, not a coding assumption.

### Open-source and infrastructure “hidden gems”
- **NetBox** — source of truth for IPAM/DCIM, inventory, topology and automation integrations. https://netbox.dev/ and https://github.com/netbox-community/ansible_modules
- **OpenWISP** — open-source network management, configuration, monitoring and captive portal/RADIUS-related capabilities. https://openwisp.io/
- **FreeRADIUS + daloRADIUS** — AAA/session accounting and administrative patterns. https://freeradius.org/ ; https://github.com/lirantal/daloradius
- **PHPNuxBill** — open-source ISP billing reference; review maintenance, security and licensing before reuse. https://github.com/hotspotbilling/phpnuxbill
- **Ansible / AWX / Nornir** — controlled network configuration automation, inventory-driven runs, approvals, diff/preview and execution logs. https://www.ansible.com/ ; https://github.com/nornir-automation/nornir
- **Node-RED, Windmill, Activepieces, Temporal** — study visual workflows, job orchestration, durable retries, approval steps, observability and connector architecture. https://nodered.org/ ; https://www.windmill.dev/ ; https://www.activepieces.com/ ; https://temporal.io/
- **n8n** — useful workflow UX and connector reference, but it is fair-code / Sustainable Use licensed rather than a generally permissive MIT/Apache library. Do not embed, fork, redistribute or offer it as a multi-tenant hosted Jaslyn feature without a specific license/legal review. Official license and edition boundaries: https://github.com/n8n-io/n8n and https://docs.n8n.io/deploy/host-n8n/community-edition-features/
- **Prometheus, Grafana, OpenTelemetry, Loki** — metrics, dashboards, traces and logs. https://prometheus.io/ ; https://grafana.com/ ; https://opentelemetry.io/
- **NetFlow/IPFIX/sFlow and SNMP** — traffic/port utilization and alerting; collect only data necessary for operations and configurable retention.

## Candidate feature gaps to check in Jaslyn Net

1. **Commercial ISP lifecycle:** prospect/lead → serviceability check → quote → order → installation appointment → CPE/ONT assignment → activation → recurring/prepaid billing → suspension/reactivation → move/upgrade/downgrade → termination and final invoice.
2. **Network source of truth:** sites/highsites, towers, fiber/OLT/PON/ONU, switches, APs, routers, IPAM/subnets/VLANs, circuits, backhaul, topology, asset ownership, warranties and configuration backups.
3. **Provisioning orchestration:** dry-run/diff, approvals for risky actions, idempotent jobs, rate limits, retries, compensation/rollback, post-change health checks and per-vendor capability matrices.
4. **RADIUS reliability:** accounting interim updates, CoA/Disconnect, stale-session cleanup, NAS health, shared-secret rotation, duplicate session protection, policy versioning, quotas/FUP and session-to-invoice traceability.
5. **Payment correctness:** signed callbacks, replay prevention, idempotency keys, provider transaction references, partial/late payments, unmatched settlement queues, refunds/reversals, chargebacks, credit notes and immutable journal entries.
6. **Finance and stock:** double-entry ledger, AR aging, supplier bills, purchase orders, GRN/receiving, serialized CPE/ONT inventory, stock movement, valuation method, returns/RMA, warranties, cost-of-service and per-tenant exports.
7. **Customer portal:** accessible mobile-first portal, branding/domains, localized language/currency/tax, package eligibility, checkout status, receipts, usage/session history, device management, support tickets, consent/privacy notices and clear payment-failure recovery.
8. **Automation platform:** versioned workflow definitions, visual editor, connector SDK, webhook triggers, schedules, event triggers, typed inputs, secrets references, approvals, retry/backoff, dead-letter queue, replay, cancellation, concurrency limits, tenant quotas, execution history and audit events.
9. **Messaging:** provider abstraction for SMS/email/WhatsApp where authorized, delivery receipts, templates/localization, opt-out/consent, transactional priority, campaign separation, retries and cost reporting.
10. **Field operations:** mobile PWA/offline queue, encrypted local work cache, conflict resolution, QR asset scan, photos/notes, checklists, technician route/dispatch, signatures, parts consumption and synchronization audit.
11. **Reliability and security:** tenant isolation tests, RBAC/least privilege, MFA/SSO where appropriate, session revocation, secrets vault, rotation, rate limits, abuse controls, backups with restore drills, migration rollback strategy, disaster recovery objectives, health/readiness, metrics/traces/logs and alert runbooks.
12. **Customer support and service quality:** SLA clocks, outage/maintenance notifications, incident timeline, customer impact mapping, status page, root-cause follow-up, ticket escalation and service credits.
13. **Regionalization:** country-specific payment connectors, configurable currency/tax/invoice rules, languages, timezone, number formats, lawful data retention, consent and exportable audit evidence.
14. **Platform quality:** every public link has an independent URL and direct-load behavior; API contracts documented; pagination/filtering; tenant-aware CSV exports; accessibility; migration tests; backups; smoke tests and deploy verification.

## Acceptance rule — never call a feature “production-ready” from UI alone
For each module record:
- implemented (code and migration exist),
- automated_tested (unit/integration/regression),
- provider_sandbox_verified (where external provider applies),
- hardware_lab_verified (where device action applies),
- production_smoke_verified (deployed behavior),
- security_reviewed,
- rollback_and_observability_verified.
A feature may be deployed while still marked unverified; do not describe it as approved/production-ready until its relevant gates pass.

## Immediate implementation sequence
1. Inspect current main, open PRs, migrations, routes and test coverage; identify duplicates and conflicts.
2. Stabilize CI/startup failures and establish repeatable build, typecheck, migration and integration test commands.
3. Create a canonical feature registry mapping each requested feature to existing code, owner/module, API/UI, migration, tests and verification state.
4. Prioritize payment correctness, tenant isolation, RADIUS/vendor adapter contracts, workflow engine reliability, financial auditability and restore/deploy checks.
5. Implement in small coherent PRs; do not merge around conflicts or failing CI. Verify Render health and deployed commit after merges.
