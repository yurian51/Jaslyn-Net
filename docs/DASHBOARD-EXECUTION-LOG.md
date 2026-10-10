# Dashboard execution log

**Date:** 2026-10-10  
**Branch:** `work/competitive-gap-audit`  
**Scope:** Direct dashboard and operational-page implementation; not a release certification.

## Changes committed

- `apps/web/app/dashboard/page.tsx`: do not report “No attention signals”, “NO INVENTORY”, or a stable entitlement posture as if health had been verified before an API snapshot exists. The dashboard now labels those health summaries as unavailable until telemetry is present.
- `apps/web/app/payments/page.tsx`: payment ledger and payment-method configuration load independently, so a failure in one endpoint does not hide successful results from the other. Successful amounts are grouped by currency rather than summed and mislabeled as TZS; unsupported currency metadata falls back to a readable amount rather than crashing the view. Added search/status filtering and unavailable-versus-empty states for both ledger and provider configuration. 
- `apps/web/app/sessions/page.tsx`: added search by session ID, customer, router, username, IP, MAC and status; shows visible records separately from API record count; distinguishes search filtering from an empty API result. Session KPIs remain unavailable until the API successfully responds.
- `apps/web/app/finance/page.tsx`: invoices, resellers, commissions, refunds, disputes and reconciliation load independently. Partial failures identify affected domains while successful domains can still refresh. Each domain's KPI and empty state distinguishes a failed first load from a verified empty result; currency formatting is defensive.
- `apps/web/app/purchases/page.tsx`: purchases, payment methods, packages, customers and routers load independently; a failed endpoint no longer blocks all other operational data. Purchase KPIs, counts, and the ledger show unavailable rather than false zeros/empty results until their own API domain has succeeded.
- `apps/web/app/console-chrome.tsx`: removed the dead `/upesilipa` navigation target and routes the WiFi Operations entry to the existing `/isp` page.
- `apps/web/scripts/verify-ui-surface.mjs`: added source regression assertions for dashboard truth states, payment currency/search behavior, session search, partial-failure handling in finance/purchases, and the repaired console navigation target.

## Validation status

The changes above are committed to the working branch. The UI verification script has been extended but **has not been executed in a functioning repository runtime in this session**. Typecheck, lint, unit tests, production build, and browser tests are not claimed as passing. Previous GitHub Actions runs reported `startup_failure` before jobs were created, and direct clone attempts failed because repository DNS/network access was unavailable.

## Operational invariants preserved

- A failed endpoint must not be rendered as a verified empty result.
- Financial totals must not combine different currencies into one amount.
- Dashboard health summaries must not imply success without a successful telemetry snapshot.
- These UI changes do not prove that external payment providers, routers, RADIUS, or production entitlements are live or verified.
