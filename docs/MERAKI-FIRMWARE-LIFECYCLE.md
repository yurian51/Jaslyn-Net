# Cisco Meraki Firmware Lifecycle

Status: **implemented API workflow; not yet hardware/tenant validated**.

This adapter uses the official Cisco Meraki Dashboard API v1 rather than downloading a firmware image to Jaslyn Net. The Dashboard controls the actual cloud-managed upgrade and reports its scheduled target.

## Credential setup

When registering or editing a Meraki router/network in Jaslyn Net, use:

- Management protocol: `MERAKI_DASHBOARD_API`
- Vendor: `Cisco Meraki`
- Encrypted management credentials:
  - `apiKey`: Meraki Dashboard API key with read access to network firmware and write access to firmware configuration
  - `networkId`: exact Meraki Dashboard network ID
  - `productType`: one of `wireless`, `appliance`, `switch`, `camera`, `cellularGateway`, `sensor`, `wirelessController`, `campusGateway`, `secureConnect`, `switchCatalyst`

API keys must be stored only in Jaslyn Net's encrypted credential field. Never pass a key in a URL, log, or support ticket.

## API

- `GET /routers/:id/firmware/meraki/live` — reads current version, versions offered for the network/product, pending upgrade and network maintenance settings from `GET /networks/{networkId}/firmwareUpgrades`.
- `POST /routers/:id/firmware/meraki/schedule` — owner/admin only. JSON body:
  ```json
  {
    "targetVersion": "exact Meraki version ID or exact firmware label",
    "scheduledAt": "2026-11-02T02:00:00.000Z",
    "timezone": "Africa/Dar_es_Salaam",
    "approved": true
  }
  ```

The executor checks the requested version against Meraki's live `availableVersions`, rejects the current version, requires explicit approval and a future schedule, preserves other product schedules and the existing network timezone, then checks that the response reports the exact scheduled target. It uses HTTPS to `api.meraki.com`, refuses redirects, has a bounded timeout, and does not automatically retry a mutation whose result may be uncertain.

## Validation and limitations

- Automated executor tests cover live inspection, rejecting unlisted versions, approval/schedule validation, preserving other product schedules and verifying the scheduled target.
- A successful API response means **scheduled**, not that the physical devices have completed reboot/upgrade. Verify actual completion from Meraki's post-upgrade firmware state/events.
- The current Jaslyn Net Meraki workflow does not perform local device configuration backup or automatic rollback. Meraki cloud rollback is a separate vendor operation and is intentionally not inferred from the existence of a schedule endpoint.
- Do not mark production-ready until CI passes and a controlled Meraki test network confirms supported product types, version IDs, scheduling behavior, and post-upgrade state.
