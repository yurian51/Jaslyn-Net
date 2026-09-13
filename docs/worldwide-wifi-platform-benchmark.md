# JASLYN NET Worldwide Wi-Fi Platform Benchmark

Research baseline captured 13 September 2026. This document distinguishes market capabilities from capabilities already implemented in Jaslyn NET. A vendor appearing in this benchmark is not automatically an implemented integration.

## Tanzania / East Africa

### UpesiLipa
- Hotspot billing for hostels, hotels, cafes, markets and campuses.
- Mobile-money billing with customer-owned gateway credentials.
- Branded captive portal.
- Live revenue dashboard and reporting.
- Hardware coverage advertised for TP-Link Omada, MikroTik, Ubiquiti UniFi, Ruijie Reyee, Cambium, Cudy, Ruckus, OpenWrt, Grandstream, Aruba, Cisco Meraki and pfSense.
- RADIUS fallback for hardware that does not have a direct integration.
- Voucher/package model and router/site limits.
- Sources: https://upesilipa.com/ and https://upesinet.com/

### Sensible Hotspot
- Tanzania-focused hotspot billing.
- Ruijie AP / WiFiDog onboarding.
- Captive portal, mobile-money integration, pre-auth allowlist and gateway configuration.
- Simple self-service/manual and managed installation paths.
- Source: https://www.sensiblehotspot.cloud/

## Global ISP / WISP platforms

### Splynx
- ISP BSS/OSS with subscriber billing and network automation.
- Native RADIUS AAA, accounting, provisioning and suspension/blocking.
- MikroTik API integration and QoS.
- PPPoE, IPoE/DHCP, Hotspot and static IP service models.
- Integrations for MikroTik, Cambium, Ubiquiti, Cisco BNG, Juniper BNG, LibreQoS, Preseem and Bequant.
- Monitoring, topology and traffic shaping.
- Source: https://splynx.com/

### Powercode Command
- Recurring billing, prorations, taxes, payment plans, autopay and multi-entity/multi-jurisdiction billing.
- Provisioning and service lifecycle automation.
- RADIUS-based and direct equipment provisioning.
- Vendor coverage advertised for Cambium, Ubiquiti, Mimosa, MikroTik, Tarana and fiber CPE.
- Ticketing, tasks, escalations and SLA tracking.
- Source: https://www.powercode.com/command/

### HotspotSystem
- Public Wi-Fi hotspot management and billing.
- Cloud control center for many locations.
- Voucher, SMS, social and card billing options depending on package.
- RADIUS authentication and captive portal workflows.
- Supports gateway architectures where existing AP hardware can remain in place.
- Device/firmware coverage includes MikroTik, OpenWrt, DD-WRT, Ubiquiti/OpenWrt, Aruba Instant, Peplink, Teltonika and other gateway/AP combinations.
- Source: https://hotspotsystem.com/ and https://hotspotsystem.net/supported-devices

## Enterprise vendor API baseline

### Ubiquiti UniFi
- Official Network APIs expose devices, connected clients and traffic insights.
- External Hotspot API supports guest authorization with time, data and rate limits.
- API key authentication is supported.
- Sources: https://help.ui.com/hc/en-us/articles/30076656117655-Getting-Started-with-the-Official-UniFi-API and https://developer.ui.com/network/

### TP-Link Omada
- Omada Controller Open API supports REST access to controller services.
- OAuth 2.0 authorization code and client-credentials modes are supported.
- Suitable for controller-level device/client/portal integration.
- Source: https://static.tp-link.com/upload/manual/2025/202512/20251208/Omada%20Pro%20SDN%20Controller_User%20Guide_REV1.0.0.pdf

### Cambium cnMaestro
- HTTPS REST API with OAuth 2.0 client credentials.
- APIs cover devices, sessions, statistics, Wi-Fi, WLANs, guest access and jobs.
- Source: https://docs.cloud.cambiumnetworks.com/api/5.2.0/

### Cisco Meraki
- Dashboard API supports programmatic network/device/VLAN management and monitoring at scale.
- Wireless APIs expose connected clients, connection statistics, latency, roaming and data-rate history.
- Source: https://developer.cisco.com/meraki/api-v1/

### Aruba Central
- Central API exposes connected wireless clients and monitoring data.
- Source: https://developer.arubanetworks.com/central/reference/apiexternal_controllerget_wireless_clients

### MikroTik RouterOS
- RouterOS supports RADIUS client functionality for HotSpot, PPP, DHCP, wireless and other services.
- User Manager provides centralized authentication/authorization/accounting capabilities.
- Sources: https://manual.mikrotik.com/docs/authentication-authorization-accounting/radius/ and https://help.mikrotik.com/docs/spaces/ROS/pages/2555940/User%2BManager

## Jaslyn NET implementation truth

### Implemented in the current branch
- Vendor-neutral network management protocol model.
- MikroTik REST telemetry and traffic enforcement.
- UniFi, OpenWrt and Cambium protocol identities in the network model.
- Worldwide capability catalog for MikroTik, UniFi, Omada, Cambium, Meraki, Aruba, Grandstream, Ruijie/Reyee, Ruckus, OpenWrt, Teltonika, Peplink, pfSense/OPNsense and FreeRADIUS/RADIUS NAS.
- Authenticated `/api/v1/network-capabilities` catalog endpoint.
- Migration mapping existing router vendor strings into vendor-specific management protocols.

### Not falsely marked as implemented
- A catalog entry does not mean a direct vendor adapter is complete.
- SNMP and RADIUS_NAS remain fail-closed until their transport/accounting behavior is implemented and tested.
- Generic HTTP telemetry is not treated as a vendor-native integration.
- Vendor APIs with OAuth/session/token flows require their real authentication implementation before being enabled for production enforcement.

## Product capability target encoded by this research

Jaslyn NET is being shaped around the common high-value feature set across these systems:

1. Subscriber/customer lifecycle.
2. Plans/packages, prepaid and recurring billing.
3. Mobile-money/card payment gateways.
4. Vouchers and prepaid access.
5. Captive portal and external portal authorization.
6. RADIUS AAA and accounting.
7. PPPoE, IPoE/DHCP, HotSpot and static-IP service models.
8. Automatic activation, suspension and restoration from billing state.
9. Per-subscriber bandwidth limits and fair-share QoS.
10. Session telemetry and byte counters.
11. Device/controller inventory and health.
12. Multi-site and multi-tenant operations.
13. Traffic analytics, reports and audit trails.
14. Tickets/tasks/SLA operational workflows.
15. API/webhook integration and customer-owned payment credentials.
16. Vendor-neutral adapters so APs, gateways and controllers can coexist in one tenant.
