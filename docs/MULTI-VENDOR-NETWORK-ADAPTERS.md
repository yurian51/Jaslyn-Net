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
| Aruba Central | Read-only client/session collection adapter with per-device bearer token | Native adapter class; exact official client endpoint must be configured and tested for the account's Central API family/region | No enforcement or disconnect |
| Cambium cnMaestro | Read-only session/client collection adapter with per-device bearer token | Native adapter class; exact API resource and permissions must be configured and tested | No enforcement or disconnect |
| Grandstream GWN | Read-only client/session collection adapter with per-device token or API Developer credentials | Native adapter class; GWN.Cloud and GWN Manager API versions differ; exact resource/auth flow requires controller validation | No enforcement or disconnect |
| Ruckus SmartZone | Read-only client/session collection adapter with per-device bearer token | Native adapter class for deployments exposing a token-authenticated endpoint; SmartZone session-cookie API versions require a dedicated login flow before production use | No enforcement or disconnect |
| Teltonika RMS | Read-only client/session collection adapter with per-device bearer token | Native adapter class; configured endpoint must be an RMS resource that actually returns client/session records | No subscriber AAA or direct enforcement |
| Peplink InControl | Read-only client/session collection adapter with per-device bearer token | Native adapter class; requires an authorized InControl API token and a supported client/session resource | No subscriber AAA or direct enforcement |
| pfSense / OPNsense | Read-only client/session collection adapter using API key/secret Basic authentication | Native adapter class; exact endpoint is installation/plugin/version-specific; only endpoints returning client/session rows can feed this interface | No firewall changes or enforcement |

RADIUS is the preferred vendor-neutral AAA path for supported NAS/controller devices. It is not a substitute for a device-specific traffic enforcement adapter: rate limits, disconnects and captive-portal actions must be supported by the NAS and verified against observed device state.

## Additional vendor adapters added in this change

The following seven protocol identifiers now dispatch to dedicated adapter classes instead of the catalogue-only failure branch: Aruba Central, Cambium cnMaestro, Grandstream GWN, Ruckus SmartZone, Teltonika RMS, Peplink InControl, and pfSense/OPNsense. They share a hardened read-only transport and client/session normalizer, but deliberately require `controllerEndpoint` to be the exact documented client/session collection resource. This avoids guessing version- or region-specific paths and avoids calling a device-inventory endpoint and pretending it represents subscriber sessions.

Credential expectations:
- Aruba Central, Cambium cnMaestro, Ruckus SmartZone, Teltonika RMS and Peplink InControl: per-device encrypted `accessToken` (or `apiKey` for bearer-token deployments).
- Grandstream GWN: provider-issued `accessToken`, or API Developer credentials where the deployment's documented endpoint supports that auth mode.
- pfSense/OPNsense: per-device encrypted API key and secret; API key may be stored in `apiKey` (or `username`) and secret in `clientSecret` (or `password`).

**Release boundary:** these are read-only endpoint adapters, not yet verified end-to-end integrations for every controller release. Ruckus SmartZone deployments that require session-cookie login need a version-aware login flow; Peplink requires its approved InControl OAuth client/token workflow; and Grandstream/Cambium/Teltonika endpoint paths and auth permissions must be confirmed against each account's official API guide. Do not enable production traffic collection until a connection test and provider-specific smoke tests confirm the exact endpoint and response schema. None of these adapters claims bandwidth enforcement, verified disconnect, voucher creation, or captive-portal control.

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
