# Jaslyn Net — 140-Candidate Market Audit (India-first, global benchmarks)

**Audit date:** 2026-10-12  
**Scope:** All 140 entries in `india-global-top-100-capability-register.md`, not a six-vendor sample. This is a public-evidence capability audit, not proof of vendor API access or production compatibility. Vendor marketing claims are treated as claims until independently tested.

## How to read the verdicts

- **Benchmark/build**: use the capability pattern to implement natively in Jaslyn Net; do not copy the product.
- **Adapter candidate**: build an isolated, tenant-scoped adapter only after checking official API, license, rate limits, credentials and sandbox tests.
- **Optional integration**: useful for customers who already use it; keep optional and replaceable.
- **Reference only**: enterprise-scale pattern or expensive/overlapping product, not a dependency.
- **Verify first**: exact vendor/product/API/maintenance status was not established sufficiently in this research pass; do not claim compatibility.
- **Not a runtime dependency**: protocol/standard/database/library, not a product to integrate as an external SaaS.

## Findings for all 140 candidates

### 1–40: India telecom, ISP, messaging and payments

| # | Candidate | Public-evidence capability / fit | Jaslyn Net decision |
|---:|---|---|---|
| 1 | [Spacecom / Log2Space](https://www.spacecom.in/product/log2space) | ISP OSS/BSS; subscriber lifecycle, PPPoE/IPoE/RADIUS, reseller hierarchy, billing, collections/reconciliation, inventory, helpdesk and messaging. | **Benchmark/build** core ISP workflows; API/license proof required before adapter. |
| 2 | [Xonware / XIMS](https://xonware.com/isp-billing-software-india) | Claims GST-native billing, UPI/payment gateways, reconciliation, RADIUS, MikroTik, OLT and TR-069. | **Benchmark/build** reconciliation and provisioning; validate all vendor/API claims in a demo. |
| 3 | [Tathya / OrbOS](https://tathyatechnologies.com/products/orbos/) | Claims multi-tenant ISP trees, RADIUS AAA/accounting, provisioning, fibre GIS, TR-069, OLT monitoring, inventory and migration. | **Benchmark/build** hierarchy, migration and operations; do not assume product integration API exists. |
| 4 | [BillingISP](https://billingisp.in/) | Subscriber billing/collections, payment verification, field tasks, attendance/payroll, customer portal, reminders and offline-first field use. | **Benchmark/build** field collection/offline UX; verify API and data export before adapter. |
| 5 | [ISPRadius](https://www.ispradius.net/) | Public site claims combined RADIUS, billing, OLT, franchise, compliance, subscriber portal and IPDR/NetFlow. Independent proof unavailable. | **Verify first** identity, real deployments, API and lawful log/security model; no commitment yet. |
| 6 | NovaServe Radius | Exact vendor/product identity and trustworthy official API documentation not established. | **Verify first**; keep off implementation shortlist until identity, ownership, docs and maintenance are proven. |
| 7 | NowaCRM | Product/API identity insufficiently established in this pass. | **Verify first**; no integration work until official docs and active support are found. |
| 8 | [Xceednet](https://www.xceednet.com/isp-billing-and-management-software) | ISP billing, prepaid/postpaid/usage/prorated plans, bandwidth/FUP, payment gateways, CRM/helpdesk and subscriber lifecycle. | **Benchmark/build** plan lifecycle and support; optional adapter only after authenticated API proof. |
| 9 | NetSight India | Exact product/vendor identity ambiguous; avoid confusing similarly named network products. | **Verify first**; no compatibility claim. |
| 10 | NextFi | Exact product/vendor and API not sufficiently verified. | **Verify first**; no integration commitment. |
| 11 | [6D Technologies](https://www.6dtechnologies.com/products-solutions/digital-bss-solutions/) | Enterprise digital BSS, multi-play monetization, sales/distribution, orchestration and customer value management. | **Reference only** for BSS domain design; likely too broad/enterprise-heavy as a dependency. |
| 12 | [Sterlite Technologies](https://stl.tech/) | Optical/fibre infrastructure, network deployment and digital/network services. | **Optional integration/reference** for fibre/asset context; no presumed public operational API. |
| 13 | [Tech Mahindra](https://www.techmahindra.com/industries/communications/) | Telecom engineering, OSS/BSS transformation, network automation and managed services. | **Reference only**; services provider, not a default software dependency. |
| 14 | [TCS](https://www.tcs.com/what-we-do/industries/communications-media-information-services) | Large-scale telecom IT, BSS/OSS and systems integration. | **Reference only** for enterprise architecture and service assurance. |
| 15 | [Infosys telecom](https://www.infosys.com/industries/communications.html) | Telecom engineering, operations and digital transformation services. | **Reference only**; do not treat service portfolio as a drop-in product. |
| 16 | [HCLTech telecom](https://www.hcltech.com/industries/telecom) | Telecom product engineering, OSS/BSS modernization and network operations. | **Reference only** for large-scale patterns. |
| 17 | [Amdocs](https://www.amdocs.com/) | Carrier-grade customer experience, charging, billing and service management. | **Reference only**; benchmark domain boundaries, not a dependency for an ISP platform. |
| 18 | [Comviva](https://www.comviva.com/) | Digital BSS, charging, digital financial services and customer engagement. | **Reference only**; useful high-level product-lifecycle benchmark. |
| 19 | [Route Mobile](https://routemobile.com/) | CPaaS/messaging APIs and enterprise communications. | **Adapter candidate** for SMS/WhatsApp where country, sender ID, delivery reports and pricing fit. |
| 20 | [Tanla Platforms](https://www.tanla.com/) | CPaaS/A2P messaging and communications platform. | **Adapter candidate** only if Tanzania delivery, regulatory requirements and API terms are confirmed. |
| 21 | [Gupshup](https://www.gupshup.io/developer/guide) | Messaging APIs including WhatsApp Business; REST/HTTP integration. | **Adapter candidate** for optional WhatsApp notifications; opt-in/template/consent controls required. |
| 22 | [Kaleyra](https://developers.kaleyra.io/) | SMS and WhatsApp APIs; account, sender ID and regional endpoint prerequisites. | **Adapter candidate** after Tanzania route and sender registration checks. |
| 23 | [ValueFirst](https://www.valuefirst.com/) | Enterprise messaging/CPaaS portfolio; local routing and API availability need commercial confirmation. | **Verify first** for Tanzania availability, DLR, sender IDs, support and pricing. |
| 24 | [Netcore Cloud](https://netcorecloud.com/) | Customer engagement and email/messaging automation. | **Optional integration**; native transactional outbox remains system of record. |
| 25 | [Exotel](https://exotel.com/) | Cloud telephony/contact-centre APIs and communications. | **Optional integration** for support/call workflows; verify local numbers and country coverage. |
| 26 | [Knowlarity](https://www.knowlarity.com/) | Cloud telephony and contact-centre workflows. | **Optional integration**; India-focused availability may not fit Tanzania. |
| 27 | [Zoho](https://www.zoho.com/) | CRM, finance, support and business application APIs. | **Optional integration** via explicit export/sync; avoid duplicate customer/ledger ownership. |
| 28 | [Freshworks](https://www.freshworks.com/) | Customer support/CRM/helpdesk products and APIs. | **Optional integration** for customers already using it; Jaslyn ticketing must remain functional without it. |
| 29 | [Chargebee](https://www.chargebee.com/features/) | Subscription billing, invoicing, dunning, revenue operations, webhooks and integrations. | **Reference/optional**; Jaslyn needs ISP-specific service lifecycle and local ledger ownership. |
| 30 | [Juspay](https://docs.juspay.io/) | Payment orchestration, UPI callbacks, refunds and settlement/MIS flows. | **Adapter candidate** for India-only UPI routes; not a default Tanzania payment dependency. |
| 31 | [Razorpay](https://razorpay.com/) | Indian payment gateway; signed webhooks, duplicate-event handling, refunds and reconciliation references. | **Adapter candidate** for eligible India tenants; implement raw-body signature validation + durable idempotency. |
| 32 | [Cashfree Payments](https://www.cashfree.com/devstudio/) | Indian payment gateway with signed webhook verification and settlement/reconciliation tooling. | **Adapter candidate** for eligible India tenants; reconcile net settlement/fees, not just payment status. |
| 33 | [PayU India](https://docs.payu.in/) | Payment APIs/webhooks; official docs require hash validation and idempotent duplicate handling. | **Adapter candidate** for India tenants after sandbox tests and settlement-file review. |
| 34 | [CCAvenue / Infibeam](https://www.ccavenue.com/) | Payment gateway and merchant checkout services. | **Adapter candidate** only after current API, signature, refund and settlement docs are validated. |
| 35 | [BillDesk](https://www.billdesk.com/) | Payment collection and recurring/payment ecosystem, subject to merchant onboarding. | **Adapter candidate** for India use only after commercial/API eligibility confirmation. |
| 36 | [PhonePe PG](https://www.phonepe.com/business-solutions/payment-gateway) | Payment gateway with REST APIs and SDKs. | **Adapter candidate** for India tenants; verify callback signatures, refund and settlement behaviour. |
| 37 | [Paytm Business](https://business.paytm.com/docs/) | Payment gateway APIs, callbacks and webhooks for transaction/refund status. | **Adapter candidate** for India tenants; callbacks are not sufficient alone—verify final transaction state. |
| 38 | [Easebuzz](https://easebuzz.in/) | Indian payment gateway and merchant payment APIs. | **Adapter candidate** after docs/sandbox and settlement reconciliation validation. |
| 39 | [Worldline India](https://worldline.com/en-in/home/main) | Merchant payment acquiring/gateway services. | **Adapter candidate** only where contract, API access and local support are confirmed. |
| 40 | [NPCI UPI ecosystem](https://www.npci.org.in/what-we-do/upi/product-overview) | UPI scheme/ecosystem, not a generic merchant gateway; access depends on regulated participants and onboarding. | **Not a direct integration**; connect through eligible PSP/acquirer/gateway. Tanzania payments remain separate. |

### 41–70: ISP billing, RADIUS, captive portal and Wi-Fi

| # | Candidate | Public-evidence capability / fit | Jaslyn Net decision |
|---:|---|---|---|
| 41 | [Sonar Software](https://sonar.software/) | ISP-focused billing, customer management, provisioning and operations. | **Benchmark/optional**; inspect public API and avoid replacing native subscriber ledger. |
| 42 | [Splynx](https://splynx.com/network-management/) | ISP billing/network operations, RADIUS, IPAM, SNMP monitoring, TR-069 ACS and REST API. | **Benchmark/build** adapter boundaries; possible optional migration/import integration. |
| 43 | [Powercode](https://powercode.com/) | ISP billing, customer management, provisioning and network operations. | **Optional integration/benchmark**; API and current plan availability must be verified. |
| 44 | [VISP](https://visp.net/) | ISP/WISP billing and subscriber operations. | **Benchmark/optional**; test API access before sync integration. |
| 45 | [Azotel](https://www.azotel.com/) | ISP operations/support/billing platform. | **Benchmark/optional**; verify API and region fit. |
| 46 | [WispHub](https://wisphub.net/) | ISP/WISP subscriber billing and network management. | **Benchmark/optional**; confirm API, supported vendors and current maintenance. |
| 47 | [Wispro](https://wispro.co/) | ISP operations/billing/field management; exact target market and API scope require verification. | **Verify first** for product fit and official API details. |
| 48 | [Powerlynx](https://powerlynx.app/) | WISP/ISP subscriber billing and network operations. | **Benchmark/optional**; validate API and supported router functions. |
| 49 | [DMA Softlab Radius Manager](https://www.dmasoftlab.com/) | RADIUS-based subscriber billing/management. | **Benchmark** for AAA/accounting workflows; check licensing, supported RADIUS versions and security updates. |
| 50 | Mikrobill | Exact current product identity/API docs need additional verification. | **Verify first**; do not implement from name alone. |
| 51 | [NetElastic](https://www.netelastic.com/) | Virtual BNG and broadband network functions. | **Reference/adapter candidate** only for operators actually running its BNG and with approved integration access. |
| 52 | [FreeRADIUS](https://www.freeradius.org/) | Scalable open-source AAA server supporting authentication, authorization and accounting. | **Build around/test**; native RADIUS integration is a core system boundary, not SaaS vendor lock-in. |
| 53 | [daloRADIUS](https://github.com/lirantal/daloradius) | Web management interface for FreeRADIUS/accounting data. | **Optional admin reference**; do not duplicate admin panels unless there is a clear operational need. |
| 54 | [PacketFence](https://www.packetfence.com/features/) | Network access control, RADIUS, captive portal, VLAN enforcement and remediation. | **Optional integration** for enterprise NAC use cases; separate from subscriber billing. |
| 55 | [CoovaChilli](https://coova.github.io/CoovaChilli/) | Captive-portal access controller supporting hotspot authentication patterns. | **Protocol/adapter candidate** for compatible hotspot deployments; validate maintained versions and security. |
| 56 | [OpenWISP](https://openwisp.org/features/) | Open-source configuration, monitoring, RADIUS, hotspot, IPAM, provisioning and multi-tenancy. | **High-priority benchmark**; prefer standards/API integration over importing its whole control plane. |
| 57 | [RADIUSdesk](https://radiusdesk.com/) | Wi-Fi hotspot, RADIUS and network access management. | **Benchmark/optional**; verify API, maintenance and deployment architecture. |
| 58 | [IronWiFi](https://help.ironwifi.com/getting-started) | Cloud RADIUS and customizable captive portals; broad vendor compatibility claims. | **Optional integration** for managed guest Wi-Fi; do not depend on cloud for core subscriber authentication. |
| 59 | [Purple](https://purple.ai/) | Guest Wi-Fi captive portal and visitor engagement with RADIUS-based access. | **Optional integration** for venues/guest Wi-Fi; check data-processing/consent requirements. |
| 60 | [Cloud4Wi](https://cloud4wi.ai/all-features/) | Guest Wi-Fi, RADIUS, Passpoint and identity/access use cases. | **Optional integration** for enterprise venues, not default ISP AAA. |
| 61 | [Cisco Meraki Guest Wi-Fi/API](https://developer.cisco.com/meraki/api-v1/) | REST APIs manage/monitor networks and devices; guest access features are ecosystem-dependent. | **Adapter candidate**; implement vendor-scoped credentials, pagination, rate limits and dry-run. |
| 62 | [Aruba Central](https://developer.arubanetworks.com/) | Cloud-managed networking and device APIs; exact endpoints depend on product/tenant. | **Adapter candidate**; confirm API version, region and scopes before write operations. |
| 63 | [Ruckus Cloud / RUCKUS One](https://www.ruckusnetworks.com/developer-central/) | Public REST/OpenAPI materials for multiple RUCKUS Cloud domains. | **Adapter candidate**; separate read and write permissions, test per product model. |
| 64 | [Cambium cnMaestro](https://www.cambiumnetworks.com/products/software-tools/cnmaestro/) | Centralized management for Cambium wireless/network equipment. | **Adapter candidate**; validate API and device capabilities by model/firmware. |
| 65 | [Grandstream GWN.Cloud](https://www.gwn.cloud/) | Cloud management for GWN APs/controllers; API access needs product/tenant verification. | **Adapter candidate**; test onboarding, config drift, reboot and firmware workflows. |
| 66 | [Ubiquiti UniFi Network](https://help.ui.com/) | Controller-managed Wi-Fi/switching and site/device management; API options differ by controller version. | **Adapter candidate**; do not rely on undocumented endpoints without version-pinned tests. |
| 67 | [MikroTik RouterOS / User Manager](https://help.mikrotik.com/docs/) | RouterOS API/CLI, queues, firewall, hotspot/PPPoE and RADIUS-related operations. | **Highest-priority native adapter**; use least privilege, capability checks, safe timeouts and simulator tests. |
| 68 | [TP-Link Omada](https://www.tp-link.com/us/omada-sdn/) | SDN controller for AP/switch/gateway management; API surface depends on controller/version. | **Adapter candidate**; validate official supported endpoints and tenant isolation. |
| 69 | [Cisco ISE](https://developer.cisco.com/docs/identity-services-engine/) | Enterprise identity/NAC, RADIUS and policy APIs. | **Optional integration** for enterprise access control; not an ISP subscriber billing engine. |
| 70 | [Juniper Mist](https://www.juniper.net/documentation/) | Cloud-managed enterprise networking with APIs and event-driven operations. | **Adapter candidate** for customers with Mist; validate RBAC, API limits and device-level effects. |

### 71–100: Network management, provisioning and security

| # | Candidate | Public-evidence capability / fit | Jaslyn Net decision |
|---:|---|---|---|
| 71 | [NetBox](https://netboxlabs.com/docs/netbox/features/api-integration/) | Source of truth for network inventory/IPAM with REST/GraphQL APIs, webhooks and metrics. | **High-priority optional integration**; define ownership boundaries before syncing devices/IPAM. |
| 72 | [Nautobot](https://docs.nautobot.com/) | Network source of truth and automation platform with extensibility/API. | **Optional integration** alternative to NetBox; avoid supporting two sources of truth by default. |
| 73 | [phpIPAM](https://phpipam.net/api/) | IPAM with API and subnet/address management. | **Optional integration** if already deployed; native IPAM must not silently diverge. |
| 74 | [Infoblox](https://www.infoblox.com/) | Enterprise DDI/IPAM/DNS/DHCP and automation APIs. | **Enterprise adapter candidate**; commercial license and account API permissions required. |
| 75 | [EfficientIP](https://www.efficientip.com/) | Enterprise DDI and IPAM/DNS/DHCP automation. | **Enterprise adapter candidate**; validate API/license and avoid hard dependency. |
| 76 | [BlueCat](https://bluecatnetworks.com/) | Enterprise DDI and network services orchestration. | **Enterprise adapter candidate**; commercial access required. |
| 77 | [OpenNMS](https://www.opennms.com/) | Network monitoring, event and performance management. | **Optional integration**; consume alarms/metrics through supported APIs rather than reimplementing NMS. |
| 78 | [LibreNMS](https://www.librenms.org/) | Open-source SNMP network monitoring with alerting/API. | **High-value optional integration** for monitoring existing networks; keep alert deduplication. |
| 79 | [Zabbix](https://www.zabbix.com/documentation) | Monitoring/alerting and API for infrastructure and network devices. | **Optional integration**; synchronize actionable incidents, not every metric. |
| 80 | [Prometheus](https://prometheus.io/docs/introduction/overview/) | Metrics collection/querying and alerting ecosystem. | **Build observability around**; expose Jaslyn metrics, don't treat it as a business-data store. |
| 81 | [Grafana](https://grafana.com/docs/) | Dashboards/alerting over metrics, logs and traces. | **Optional observability UI**; keep tenant-safe product dashboards native. |
| 82 | [Icinga](https://icinga.com/docs/) | Infrastructure/network monitoring and alerting. | **Optional integration** if customer already runs it. |
| 83 | [Checkmk](https://docs.checkmk.com/) | Infrastructure/network monitoring with APIs and alerting. | **Optional integration**; normalize alerts into a common incident schema. |
| 84 | [PRTG](https://www.paessler.com/manuals/prtg) | Commercial monitoring/sensors/alerts. | **Optional integration**; confirm API access and licensing. |
| 85 | [ManageEngine OpManager](https://www.manageengine.com/network-monitoring/) | Network monitoring, fault/performance and device inventory. | **Optional integration**; adapter must be read-only initially. |
| 86 | [SolarWinds NPM](https://www.solarwinds.com/network-performance-monitor) | Commercial network performance monitoring and alerting. | **Optional integration**; use documented APIs and scoped credentials. |
| 87 | [Domotz](https://www.domotz.com/) | Remote network monitoring/management for MSPs. | **Optional integration**; verify API plan and managed-device controls. |
| 88 | [Auvik](https://www.auvik.com/) | MSP network monitoring, topology and configuration insight. | **Optional integration**; use APIs only where licensed. |
| 89 | [Oxidized](https://github.com/ytti/oxidized) | Network device configuration backup/versioning. | **Build/optional integration** for config backup; encrypt secrets and redact credentials from diffs. |
| 90 | [Ansible](https://docs.ansible.com/ansible/latest/network/) | Declarative network automation via modules/collections. | **High-priority execution backend candidate**; approvals, dry-run, inventory scoping and rollback required. |
| 91 | [Nornir](https://nornir.readthedocs.io/) | Python automation framework for network inventory/task execution. | **Optional backend** for code-first network jobs; avoid multiple overlapping orchestration engines initially. |
| 92 | [Netmiko](https://ktbyers.github.io/netmiko/) | Python SSH CLI automation across network vendors. | **Library candidate** for vendor adapters; command allowlists and sanitized logs are mandatory. |
| 93 | [NAPALM](https://napalm.readthedocs.io/) | Multi-vendor network device abstraction for configuration/state operations. | **Library candidate** where drivers support target hardware; capability-test every vendor/model. |
| 94 | [GenieACS](https://genieacs.com/) | TR-069 auto-configuration server for CPE management. | **High-priority optional integration** for ACS needs; test provisioning templates and credential handling. |
| 95 | [USP / TR-369](https://usp.technology/) | Broadband Forum device-management protocol and ecosystem; controller maturity varies. | **Standards track**; design adapter interface but do not promise universal support. |
| 96 | [NetFlow/IPFIX/sFlow](https://www.rfc-editor.org/rfc/rfc7011) | Traffic telemetry protocols/collectors, not one vendor product. | **Protocol support candidate**; define retention, sampling, tenant attribution and privacy. |
| 97 | [Wazuh](https://documentation.wazuh.com/) | Open security platform for endpoint/security telemetry and detection. | **Optional security integration**; alert ingest and response actions need authorization gates. |
| 98 | [OpenSearch](https://opensearch.org/docs/latest/) | Search/analytics engine for logs and event data. | **Optional log backend**; define retention, PII redaction, access control and cost limits. |
| 99 | [Graylog](https://go2docs.graylog.org/) | Centralized log management, search and alerting. | **Optional log backend**; no unbounded raw subscriber data retention. |
| 100 | [Sentry](https://docs.sentry.io/) | Application error/performance monitoring with SDKs and event capture. | **Optional integration**; scrub credentials, payment data and subscriber PII before events. |

### 101–140: Workflow, ERP, finance, support and observability

| # | Candidate | Public-evidence capability / fit | Jaslyn Net decision |
|---:|---|---|---|
| 101 | [n8n](https://docs.n8n.io/) | Visual workflows, connectors, triggers and self-hosting. | **Benchmark/optional integration**; Jaslyn business-critical actions still require tenant-aware auth, audit and idempotency. |
| 102 | [Node-RED](https://nodered.org/docs/user-guide/) | Event-driven low-code flows, nodes, context and self-hosted runtime. | **Optional integration** for edge/IoT automation; isolate runtime and restrict unsafe custom code. |
| 103 | [Temporal](https://docs.temporal.io/) | Durable execution for long-running workflows, retries and recovery. | **Architecture benchmark**; consider only if native queue workers cannot meet durability needs. |
| 104 | [Camunda](https://docs.camunda.io/) | BPMN/process orchestration and human task workflows. | **Optional enterprise integration/reference**; avoid duplicating a simpler native workflow engine. |
| 105 | [Apache Airflow](https://airflow.apache.org/docs/) | Scheduled/data-pipeline orchestration, retries, history and UI. | **Not primary business workflow engine**; suitable for analytics/batch jobs, not interactive provisioning. |
| 106 | [Kestra](https://kestra.io/docs/) | Declarative event/scheduled workflows with retry/replay controls. | **Benchmark/optional**; compare with native workflow and n8n before adding another engine. |
| 107 | [Windmill](https://www.windmill.dev/docs) | Scripts, flows and internal developer tools. | **Optional integration** for internal ops; constrain secrets, permissions and code execution. |
| 108 | [ERPNext](https://docs.erpnext.com/) | Open-source accounting, procurement, inventory, CRM, HR and REST API. | **High-priority benchmark** for balanced ledger, purchase cycle, stock valuation; integrate only if ERP remains external system of record. |
| 109 | [Odoo](https://www.odoo.com/documentation) | Modular ERP/CRM/accounting/inventory with edition-dependent licensing/features. | **Optional integration/reference**; assess edition and license before committing. |
| 110 | [Dolibarr](https://www.dolibarr.org/) | Open-source ERP/CRM, invoices, orders, products and stock. | **Optional integration** for small-business ERP use; do not fork financial truth between systems. |
| 111 | [Akaunting](https://akaunting.com/) | Small-business accounting/invoicing and expenses. | **Optional integration**; accounting API and local tax fit require validation. |
| 112 | [Frappe Framework](https://docs.frappe.io/framework/user/en/api/rest) | Extensible framework with generated REST APIs and custom applications. | **Reference/integration** for ERPNext; not an extra standalone dependency if ERPNext is already used. |
| 113 | [Metabase](https://www.metabase.com/docs/latest/) | BI queries/dashboards and data exploration. | **Optional BI**; enforce tenant-scoped database permissions and curated views. |
| 114 | [Apache Superset](https://superset.apache.org/docs/) | BI dashboards, SQL exploration and semantic metrics. | **Optional BI**; same tenant-safe data access rules; avoid duplicate #140 entry. |
| 115 | [PostHog](https://posthog.com/docs) | Product analytics/feature flags/session analytics; privacy implications. | **Optional after privacy review**; disable or mask sensitive session recording and subscriber identifiers. |
| 116 | [GLPI](https://glpi-project.org/) | IT asset management, helpdesk and service management. | **Optional integration** for internal IT, not subscriber billing. |
| 117 | [Zammad](https://docs.zammad.org/) | Support/helpdesk with APIs and ticket workflows. | **Optional integration**; sync ticket IDs/status with clear system of record. |
| 118 | [osTicket](https://docs.osticket.com/) | Open-source support ticketing. | **Optional integration**; verify current API/plugin and security maintenance. |
| 119 | [FreeScout](https://freescout.net/) | Shared inbox/helpdesk; module/API coverage can vary. | **Verify first**; confirm required API/modules before promising integration. |
| 120 | [OpenProject](https://www.openproject.org/docs/) | Project/work-package management with API. | **Optional integration** for delivery projects/maintenance plans, not real-time provisioning. |
| 121 | [Snipe-IT](https://snipe-it.readme.io/) | IT asset inventory and API. | **Optional integration** for internal assets; field CPE stock may need a native inventory ledger. |
| 122 | [Paperless-ngx](https://docs.paperless-ngx.com/) | Document ingestion, OCR and searchable archive. | **Optional integration** for supplier/field documents; enforce access control and retention policies. |
| 123 | [MinIO](https://min.io/docs/) | S3-compatible object storage. | **Infrastructure option** for evidence/photos/exports; configure tenant-safe object keys, encryption and lifecycle rules. |
| 124 | [Keycloak](https://www.keycloak.org/documentation) | Identity and access management, OIDC/SAML and federation. | **Optional identity integration**; use only with explicit auth architecture and tenant-role mapping. |
| 125 | [OpenBao](https://openbao.org/docs/) | Open-source secrets management fork; operational maturity must be evaluated. | **Maturity review** before production secrets dependency; test recovery, HA, upgrades and audit. |
| 126 | [HashiCorp Vault](https://developer.hashicorp.com/vault/docs) | Secrets management and dynamic credentials; edition/license terms vary. | **Optional secrets backend** after license and operational-cost review; never store secrets in source control. |
| 127 | [OpenTelemetry](https://opentelemetry.io/docs/) | Vendor-neutral traces, metrics and logs instrumentation. | **High-priority standard**; instrument API/workers/adapters with tenant-safe attributes and PII filtering. |
| 128 | [Grafana Loki](https://grafana.com/docs/loki/latest/) | Log aggregation designed for label-based queries. | **Optional log backend**; do not label by raw username/phone/IP or other high-cardinality PII. |
| 129 | [Jaeger](https://www.jaegertracing.io/docs/) | Distributed tracing. | **Optional tracing backend**; use trace IDs to diagnose jobs without leaking payloads. |
| 130 | [RabbitMQ](https://www.rabbitmq.com/docs) | Durable messaging/queues with acknowledgements and retry/dead-letter patterns. | **Optional broker**; Jaslyn already documents Redis/BullMQ, so add only for a proven requirement. |
| 131 | [Apache Kafka](https://kafka.apache.org/documentation/) | Distributed event streaming and durable event logs. | **Not default** for current scale unless event throughput/replay requirements justify operational complexity. |
| 132 | [NATS](https://docs.nats.io/) | Messaging, pub/sub and JetStream persistence. | **Optional broker**; benchmark against existing queue infrastructure before adoption. |
| 133 | [Redis / Valkey](https://valkey.io/topics/) | Cache, ephemeral coordination and queue infrastructure. | **Existing-stack fit**; never use cache as sole payment/audit source of truth. |
| 134 | [PostgreSQL](https://www.postgresql.org/docs/) | Transactional relational database and constraints/transactions. | **Core system of record**; enforce migration discipline, tenant scoping and financial constraints. |
| 135 | [pgAudit](https://github.com/pgaudit/pgaudit) | PostgreSQL session/object audit logging extension. | **Security candidate**; evaluate log volume, coverage and retention alongside application-level audit trail. |
| 136 | [Debezium](https://debezium.io/documentation/) | Change-data capture from databases to event streams. | **Optional data integration**; not a replacement for domain events or financial audit records. |
| 137 | [Stripe Billing](https://stripe.com/billing) | Subscription/invoicing/usage billing; regional account availability and payment methods vary. | **Reference/optional**; not default Tanzania gateway; check country eligibility and local collection methods. |
| 138 | [Adyen](https://docs.adyen.com/) | Enterprise payments, webhooks and settlement tooling; merchant onboarding required. | **Optional enterprise adapter** only if merchant-country support and contract make sense. |
| 139 | [PayPal / Braintree](https://developer.paypal.com/) | Online payments and payment APIs; market/merchant eligibility varies. | **Optional adapter** after country support, fees, refunds and settlement checks; not default local payment rail. |
| 140 | Apache Superset semantic/reporting ecosystem | Duplicate of #114, not a separate vendor/product. Superset supports BI dashboards, SQL and semantic metrics. | **Deduplicate**; count #140 as duplicate entry and retain one evaluation, not a false 140th unique product. |

## Cross-candidate conclusions

1. **The list contains 139 unique candidate identities at most**, because #140 duplicates Apache Superset (#114). Several names (#6, #7, #9, #10, #50) remain identity/API-unverified and must not be treated as validated vendors. This correction is intentional; do not inflate coverage by counting duplicates.
2. **Do not import 140 products into Jaslyn Net.** Most value comes from building native capabilities and a small number of optional, replaceable adapters.
3. **Best native-build benchmarks:** subscriber lifecycle and reseller hierarchy (Log2Space/XIMS/OrbOS); cash collection and field/offline workflows (BillingISP); RADIUS/session accounting (FreeRADIUS/OpenWISP/Splynx); network inventory/IPAM (NetBox); safe automation (Ansible/Nornir); balanced accounting and stock valuation (ERPNext); event-driven workflows (n8n/Node-RED); observability (OpenTelemetry + existing backend).
4. **Payment safety baseline:** raw-body signature verification; durable unique provider-event ID; unique payment/order/idempotency constraints; tolerate out-of-order events; verify final state against provider API where required; separate payment success from settlement; reconcile gross, fees, refunds, reversals and net payout; exception queue and immutable audit trail. Razorpay and Cashfree official docs explicitly describe webhook signature verification and duplicate handling.
5. **Country separation:** India-only UPI, GST, TRAI/DoT, DLT and INR assumptions must be configuration/region modules. Tanzania must have independent gateway adapters, currency/tax rules, SMS routes and legal-retention policy.
6. **Tenant/security baseline for every adapter:** tenant-scoped credentials; least privilege; secret rotation; per-tenant rate limits; request signing; timeouts; bounded retries with jitter; dead-letter/replay tooling; audit events; redact secrets/PII; capability discovery; circuit breaker; dry-run for destructive operations; contract tests with recorded fixtures.
7. **No code-level status is inferred from product marketing.** “Already implemented” or “missing” can only be assigned after reviewing actual source files and tests. This audit assigns market fit and candidate disposition; it does not claim any adapter, payment integration, CI run, or deployment is production-ready.

## Sources used for evidence sampling

- India ISP OSS/BSS: [Log2Space](https://www.spacecom.in/product/log2space), [XIMS](https://xonware.com/isp-billing-software-india), [OrbOS](https://tathyatechnologies.com/products/orbos/), [Xceednet](https://www.xceednet.com/isp-billing-and-management-software), [BillingISP](https://billingisp.in/).
- Network and access: [OpenWISP](https://openwisp.org/features/), [FreeRADIUS](https://www.freeradius.org/), [Splynx](https://splynx.com/network-management/), [PacketFence](https://www.packetfence.com/features/), [Meraki API](https://developer.cisco.com/meraki/api-v1/), [NetBox API integration](https://netboxlabs.com/docs/netbox/features/api-integration/).
- Payments: [Razorpay webhook validation/idempotency](https://github.com/razorpay/markdown-docs/blob/master/webhooks/validate-test.md), [Cashfree webhook verification](https://www.cashfree.com/devstudio/preview/pg/tools/webhookVerification), [PayU webhooks](https://docs.payu.in/docs/general-faqs), [Juspay UPI callbacks/settlement](https://docs.juspay.io/upi-consumer-stack/docs/overview/onboarding-guide-issuance).
- Workflows/data: [Node-RED guide](https://nodered.org/docs/user-guide/), [Airflow docs](https://airflow.apache.org/docs/), [Frappe REST API](https://docs.frappe.io/framework/user/en/api/rest), [ERPNext docs](https://docs.erpnext.com/), [Superset docs](https://superset.apache.org/docs/), [OpenTelemetry](https://opentelemetry.io/docs/).

## Work not claimed by this document

This is a vendor/capability market audit based on public sources and documented evidence. It does **not** mean 140 live demos were performed, 140 APIs were authenticated, legal contracts/licenses were reviewed, or integrations were tested against Jaslyn Net. The next engineering gate is to map each priority capability to concrete repository paths and tests, then implement and verify a narrow production-safe slice in a PR.
