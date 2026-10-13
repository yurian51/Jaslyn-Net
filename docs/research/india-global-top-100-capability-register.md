# Jaslyn Net — India + Global Capability Research Register

Status: research backlog only. No candidate is an approved integration until source, APIs/protocols, licensing, security, compatibility, tests, and deployment behavior are verified.

## Decision labels
- Already implemented — verified in code and tests.
- Needs improvement — present but fails acceptance criteria.
- Missing — not found after repository audit.
- Integration candidate — external system may add value after API/security/license review.
- Not suitable — duplicative, incompatible, unsupported, or too risky.

## Candidate register (140 candidates; not a ranking)

### India telecom, ISP, messaging and payments
1. Spacecom Software / Log2Space
2. Xonware / XIMS
3. Tathya Technologies / OrbOS
4. BillingISP
5. ISPRadius (verify identity)
6. NovaServe Radius (verify identity)
7. NowaCRM (verify product/API)
8. Xceednet (verify product details)
9. NetSight India (verify exact vendor/product)
10. NextFi (verify exact vendor/product)
11. 6D Technologies
12. Sterlite Technologies
13. Tech Mahindra
14. Tata Consultancy Services
15. Infosys telecom solutions
16. HCLTech telecom engineering
17. Amdocs India operations
18. Comviva
19. Route Mobile
20. Tanla Platforms
21. Gupshup
22. Kaleyra (verify current status)
23. ValueFirst
24. Netcore Cloud
25. Exotel
26. Knowlarity
27. Zoho
28. Freshworks
29. Chargebee
30. Juspay
31. Razorpay
32. Cashfree Payments
33. PayU India
34. CCAvenue / Infibeam Avenues
35. BillDesk
36. PhonePe
37. Paytm
38. Easebuzz
39. Worldline India
40. NPCI UPI ecosystem (eligibility review)

### ISP billing, RADIUS, captive portal and Wi-Fi
41. Sonar Software
42. Splynx
43. Powercode
44. VISP
45. Azotel
46. WispHub
47. Wispro
48. Powerlynx
49. DMA Softlab Radius Manager
50. Mikrobill
51. NetElastic
52. FreeRADIUS
53. daloRADIUS
54. PacketFence
55. CoovaChilli
56. OpenWISP
57. RADIUSdesk
58. IronWiFi
59. Purple
60. Cloud4Wi
61. Cisco Meraki Guest Wi-Fi
62. Aruba Central
63. Ruckus Cloud
64. Cambium cnMaestro
65. Grandstream GWN.Cloud
66. Ubiquiti UniFi Network
67. MikroTik RouterOS / User Manager
68. TP-Link Omada
69. Cisco ISE
70. Juniper Mist

### Network management, provisioning and security
71. NetBox
72. Nautobot
73. phpIPAM
74. Infoblox
75. EfficientIP
76. BlueCat
77. OpenNMS
78. LibreNMS
79. Zabbix
80. Prometheus
81. Grafana
82. Icinga
83. Checkmk
84. PRTG
85. ManageEngine OpManager
86. SolarWinds NPM
87. Domotz
88. Auvik
89. Oxidized
90. Ansible
91. Nornir
92. Netmiko
93. NAPALM
94. GenieACS (TR-069)
95. USP/TR-369 controllers (evaluate maturity)
96. NetFlow/IPFIX/sFlow collectors (evaluate implementations)
97. Wazuh
98. OpenSearch
99. Graylog
100. Sentry

### Workflow, ERP, finance, support and observability
101. n8n
102. Node-RED
103. Temporal
104. Camunda
105. Apache Airflow
106. Kestra
107. Windmill
108. ERPNext
109. Odoo
110. Dolibarr
111. Akaunting
112. Frappe Framework
113. Metabase
114. Apache Superset
115. PostHog (privacy review)
116. GLPI
117. Zammad
118. osTicket
119. FreeScout
120. OpenProject
121. Snipe-IT
122. Paperless-ngx
123. MinIO
124. Keycloak
125. OpenBao (maturity review)
126. HashiCorp Vault (license/edition review)
127. OpenTelemetry
128. Grafana Loki
129. Jaeger
130. RabbitMQ
131. Apache Kafka
132. NATS
133. Redis / Valkey
134. PostgreSQL
135. pgAudit
136. Debezium
137. Stripe Billing (regional availability review)
138. Adyen (regional availability review)
139. PayPal / Braintree (market-fit review)
140. Apache Superset semantic/reporting ecosystem

## Initial official sources
- Spacecom / Log2Space: https://www.spacecom.in/ and https://www.spacecom.in/product/log2space
- Xonware / XIMS: https://www.xonware.com/
- Tathya / OrbOS: https://tathyatechnologies.com/products/orbos/
- BillingISP: https://billingisp.in/
- Razorpay: https://razorpay.com/
- Cashfree: https://www.cashfree.com/
- Gupshup: https://www.gupshup.io/
- 6D Technologies: https://www.6dtechnologies.com/
- n8n: https://n8n.io/
- Node-RED: https://nodered.org/
- FreeRADIUS: https://freeradius.org/
- OpenWISP: https://openwisp.org/
- NetBox: https://netboxlabs.com/
- ERPNext: https://erpnext.com/

## Required work
1. Audit repository modules, migrations, routes, adapters, tests, CI and deployment configuration.
2. Record each candidate's official evidence, exact product, relevant capability, API/protocol, licensing, regional availability, security implications and evidence date.
3. Map every capability to actual Jaslyn Net code and tests; UI labels alone do not prove functionality.
4. Prioritize tenant isolation, payment idempotency/reconciliation, migration integrity, executable vendor adapters, captive portal/RADIUS, observability and offline field workflows.
5. Implement only verified gaps in a branch and PR; do not silently merge or deploy.
6. Test unit/integration, fresh migrations, upgrades, rollbacks, tenant isolation, duplicate events, retries and CI. Use sandbox credentials; do not claim live payment/SMS or production success without evidence.
7. Keep India-specific GST/UPI/regulatory features configurable, never hard-coded for Tanzania.
