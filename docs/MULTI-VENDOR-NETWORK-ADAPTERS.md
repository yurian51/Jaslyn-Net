# Multi-vendor network adapter status

JASLYN NET uses two distinct concepts: the vendor catalogue describes potential device capabilities, while executable adapters describe operations actually implemented. A protocol must not be presented as fully supported merely because it appears in the catalogue.

## Executable adapter coverage in this change

| Vendor / protocol | Implemented operations | Lifecycle | Not implied |
|---|---|---|---|
| MikroTik RouterOS REST | HotSpot client counters, managed simple queues, verified bandwidth enforcement, verified disconnect | Native + tested in unit specs; live hardware validation still required | RouterOS versions and configuration may differ |
| Cisco Meraki Dashboard API | Client policy bandwidth enforcement and verification | Native; unit specs exist, live org validation required | Does not imply every Meraki endpoint/feature is implemented |
| TP-Link Omada Controller Open API | OAuth client-credentials token acquisition and client-session telemetry | Native, limited to client telemetry | No direct bandwidth enforcement/disconnect adapter yet |
| Ruijie / Reyee Cloud API | Current-client telemetry using per-router token and group ID | Native, limited to client telemetry | No direct bandwidth enforcement/disconnect adapter yet |
| UniFi Network API | Client-session telemetry | Native, limited | No direct enforcement adapter in this release |
| OpenWrt ubus | Associated Wi-Fi client telemetry | Native, limited | No direct enforcement adapter in this release |
| Other listed vendors | Catalogue metadata / generic HTTP where explicitly configured | Catalogue-only or generic | Do not claim native integration |

RADIUS is the preferred vendor-neutral AAA path for supported NAS/controller devices. It is not a substitute for a device-specific traffic enforcement adapter: rate limits, disconnects and captive-portal actions must be supported by the NAS and verified against observed device state.

## Omada setup

Configure a router with managementProtocol=OMADA_CONTROLLER_API, controllerEndpoint set to the HTTPS origin of the Omada controller, and encrypted management credentials containing:
- clientId
- clientSecret
- omadacId
- siteId

Create an Open API application in Omada and grant it access to the required site. The adapter obtains a short-lived access token and calls the Open API client endpoint. Controller versions can expose different response envelopes and capabilities; an application-level non-zero errorCode is treated as a failure.

## Ruijie / Reyee setup

Configure managementProtocol=RUIJIE_REYEE_CLOUD_API, controllerEndpoint set to the HTTPS base URL for the Ruijie Cloud API region, and encrypted management credentials containing:
- accessToken (or apiKey, if issued by the provider)
- groupId

The adapter reads the provider's current-user endpoint and normalizes the available username, IP, MAC and traffic counters. Ruijie Cloud API access and endpoint availability depend on the account, region and enabled API permissions.

## Security and release gates

- Omada and Ruijie secrets and account identifiers are stored inside the router's encrypted credential payload; this adapter does not use shared global tenant credentials.
- HTTPS is required, redirects are rejected, loopback targets are blocked, and requests have bounded timeouts. Private on-prem Omada controller addresses are blocked by default; set JASLYN_NETWORK_ALLOW_PRIVATE_ENDPOINTS=true only for a trusted deployment that requires them.
- Router credentials must be configured for each tenant/device. Never put credentials in Git or URL user-info.
- Traffic samples are only persisted when a client can be matched to an active Jaslyn session and counters are valid.
- Automated tests are authored for Omada and Ruijie response handling. They still need to run in CI; no live controller credentials or hardware were available in this change.
- Before enabling a vendor in production, run a connection check against the exact controller/firmware, verify telemetry freshness, and exercise enforcement/rollback only for capabilities the registry explicitly lists.

## Next adapter implementation order

1. Add controller-version-aware Omada enforcement and disconnect, with read-after-write verification.
2. Implement Ruijie Cloud API enforcement/portal operations where the account/API permissions support them; otherwise use RADIUS and mark unsupported direct enforcement.
3. Add native adapters for Cambium cnMaestro, Aruba Central, Grandstream GWN, Ruckus SmartZone, Teltonika RMS, Peplink InControl and pfSense/OPNsense one at a time, each with official API contracts and tests.
4. Implement SNMP as a dedicated read-only transport with explicit MIB support; do not pretend SNMP alone can perform subscriber AAA or verified disconnects.
5. Add a router connection-test UI that reports protocol-specific supported operations, last successful observation and safe error categories.
