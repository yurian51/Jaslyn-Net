# UpesiLipa → Jaslyn Net parity

Jaslyn Net uses the public UpesiLipa product surface as a functional benchmark for WiFi operators. It does not copy UpesiLipa's internal implementation and does not claim unsupported vendor APIs are native.

## Implemented against Jaslyn's canonical modules

- Custom hourly/daily/weekly/monthly WiFi packages → packages
- Prepaid voucher batches and redemption → vouchers
- Mobile-money payment method catalog → payments
- Live customer sessions → sessions
- Router/site inventory → routers + locations
- Native MikroTik enforcement → network command/traffic fabric
- UniFi, OpenWrt and Meraki telemetry/control surfaces where native adapters exist
- Cloud RADIUS / NAS model → radius
- Branded portal configuration → upesilipa_site_settings
- Multiple portal themes → validated theme enum
- Site health → router status/heartbeat data
- Multi-site operation → canonical locations
- Grace-period configuration → site policy data

## Current operator API

- GET /upesilipa/capabilities
- GET /upesilipa/dashboard
- GET /upesilipa/sites/:locationId
- PATCH /upesilipa/sites/:locationId
- GET /upesilipa/sites/:locationId/health

All dashboard and health values are read from the live tenant database. No demo revenue, customer counts, router counts, or fake health values are inserted.

## Explicitly not claimed as native

UpesiLipa advertises a broad hardware surface. Jaslyn marks unsupported native APIs as CATALOG_ONLY or RADIUS until an executable, vendor-verified adapter is available. This prevents the dashboard from presenting a vendor logo as proof of control.

## Source

Public product information: https://upesilipa.com/


## Gateway lifecycle

Jaslyn now exposes the eight payment gateways listed by UpesiLipa as an explicit provider catalog:
PalmPesa, PlusPesa, FimiPay, ClickPesa, AzamPay, Snippe, Selcom, and SonicPesa.

They are intentionally marked `CATALOG_ONLY`. A catalog entry is not treated as a working payment adapter until Jaslyn has a verified executable API contract, credentials model, webhook verification, idempotency handling, settlement/reconciliation path, and automated tests.

## Grace-period enforcement

The UpesiLipa-style site grace-period setting is now enforced by the canonical Jaslyn access/session reconciliation path. It is tenant- and site-scoped through the router's location. Expiry reconciliation waits until `ends_at + grace_period`, while session admission and active-grant verification use the same effective access window. This avoids a UI-only setting that has no operational effect.
