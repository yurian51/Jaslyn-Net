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
