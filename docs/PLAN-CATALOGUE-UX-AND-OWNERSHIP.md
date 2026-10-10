# Plan Catalogue UX and Ownership Rules

**Status:** UI alignment started; platform-subscription UI/API remains a blocker.

## The two plan families must never be mixed

JASLYN NET has two commercially different concepts:

1. **JASLYN NET platform subscription** — what the WiFi operator / ISP pays YURIAN TECH LTD to use the software. This belongs to `saas_plans` and `organization_subscriptions`. The subscription controls platform entitlements such as allowed sites, routers, customers, billing period, and account status.
2. **WiFi subscriber access package** — what the operator sells to an end customer to get internet access. This belongs to `packages`, `wifi_plan_purchases`, access grants/bindings, and the RADIUS/network policy lifecycle. It defines customer price, validity, quota, download/upload speed, and allowed devices.

Never label the WiFi access catalogue as “JASLYN NET subscription pricing”; never use a platform subscription price as a subscriber internet bundle. The two products have different buyers, billing events, entitlements, renewals, and support implications.

## Repository audit

- The database migration defines `saas_plans` with monthly/yearly billing and limits for routers, sites, and customers, plus `organization_subscriptions` with lifecycle states.
- The current `/packages` and `/dashboard/packages` screens load `/packages/tiers/availability`. The source catalog defines eight tiers with internet validity, data quota, bandwidth, device limits, and network features. These are WiFi subscriber access packages, not SaaS platform subscriptions.
- The repository currently has no discovered SaaS-plan controller/service and no dedicated platform subscription/pricing screen wired to the `saas_plans` records. Therefore platform subscription plans cannot honestly be represented as an operational, purchasable UI yet.
- Avoid hardcoding a public SaaS price card or claiming a plan is available until plan records, entitlement checks, billing/renewal lifecycle, and UI are connected end-to-end.

## UI contract for WiFi subscriber package cards

All package cards in the console must share the same responsive grid and card geometry, with equal visual weight and aligned price/specification/action areas. Desktop uses four columns where space permits, tablet two, and mobile one. The featured package can be highlighted with a restrained border/accent, but must not change the height or hide other plans.

Every card should answer, in this order:

1. **Package name and intended use** in plain language.
2. **Total price and validity** (for example, TZS 1,000 / 24 hours).
3. **Included data** with “Unlimited” only when the stored policy actually means unlimited.
4. **Download and upload speeds** stated separately, not as unexplained abbreviations.
5. **Allowed devices**.
6. **Important access conditions** such as free trial, voucher-only/payment flow, or whether the plan is visible on the subscriber portal.
7. **One clear action** whose label reflects the actual state: configure, publish, or sell—not a generic “Upgrade” where it may mislead the operator.

Do not silently turn missing data into “Unlimited” if the API uses null for “not configured”; agree a canonical null/unlimited meaning with the backend before using that label on a customer-facing portal.

## UI contract for platform subscription plans

When the SaaS plan domain is implemented, its cards should use the same design tokens, spacing, typography, border, price alignment, responsive breakpoints, and featured-state treatment as the WiFi package catalogue, but a different data model and explicit title (“JASLYN NET Platform Plans”). Each card should show:

- Monthly or annual price and billing interval.
- Number of sites and routers included.
- Customer/subscriber capacity.
- Included platform modules/features.
- Trial terms, renewal/cancellation behavior, and what happens on expiry or past-due state.
- A clear comparison table with consistent rows and “Included / Not included / Limit” values.
- A single primary action appropriate to the tenant state (start trial, choose plan, change plan, or manage subscription).

Platform plan cards must be backed by the `saas_plans` API and enforced server-side. Hiding a button or showing a visual plan card is not entitlement enforcement.

## Market benchmark consulted

Publicly visible WiFi billing pages reviewed for presentation and information hierarchy include:

- [UpesiLipa](https://upesilipa.com/) — separates operator platform tiers from customer internet bundles and explains limits per tier.
- [ChinoWiFi](https://chinowifi.com/) — customer-facing bundles clearly show validity and TZS price, then explain mobile-money purchase.
- [SkyConnect TZ](https://skyconnecttz.com/) — operator subscription cards state routers, sellers, support and billing period.
- [KADILI HOTSPOT](https://kadilihotspot.online/) — clearly distinguishes manual voucher selling from automated payment/auto-connect modes and separates installation from recurring fees.
- [ClickTel](https://clicktel.online/pricing) — uses a consistent plan comparison and explains activation cost separately.
- [B5 Internet](https://b5internet.com/) — distinguishes operator subscriptions by locations/routers from end-customer WiFi package examples.

These are snapshots of public marketing pages, not independent verification of the vendors' actual performance or contractual terms.

## Acceptance checklist

- [x] Existing WiFi package screens explicitly identify their audience as WiFi subscribers/operators configuring access packages.
- [x] Both WiFi package surfaces share responsive card-grid/card-geometry rules.
- [x] Card terms distinguish data, download/upload speed, and allowed devices.
- [ ] Add the platform subscription controller/service and tenant-scoped read API.
- [ ] Seed or migrate actual SaaS plans and define source-of-truth pricing/currency.
- [ ] Implement platform subscription UI against real API data, including annual/monthly intervals.
- [ ] Enforce site/router/customer limits server-side and cover trial, renewal, past-due, cancel, and expiry states.
- [ ] Add a true subscriber-facing portal view that only shows active, published packages and explains the purchase/activation flow.
- [ ] Run visual regression, accessibility, mobile viewport, API integration, and billing lifecycle tests when CI is healthy.
