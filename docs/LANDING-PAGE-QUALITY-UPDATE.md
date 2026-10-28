# Landing page quality update

Updated the public JASLYN NET landing page to improve product clarity, conversion flow, and claim accuracy.

## Shipped changes

- Reframed the console artwork as a **product preview** and labelled the dashboard states illustrative, not a live workspace or a promise of active connectivity.
- Added a three-part operator-outcomes section: make WiFi packages understandable, connect purchase to service, and work from operational evidence.
- Added direct links to the WiFi package catalogue and relevant landing-page explanations.
- Clarified that router/controller integrations and payment automation depend on adapter, provider, and deployment readiness; the list is not a blanket guarantee that every integration is production-ready.
- Updated document title, description, keywords, Open Graph metadata, and Twitter card metadata for search and sharing.
- Added responsive layouts for the new section across desktop, tablet, and mobile, with reduced-motion-friendly styling.

## Validation status

- Reviewed source changes and verified the new route links against existing landing/package routes in the repository.
- Build, lint, typecheck, visual browser review, and mobile-device testing have not been confirmed because the current GitHub Actions runner reports `startup_failure`. Do not claim the deployment has been visually or functionally certified until these checks run successfully.

## Follow-up quality pass

- The console mock now labels the sidebar session and customer/payment/access states as examples, using neutral styling instead of implying live successful operations.
- The platform-subscription dashboard now distinguishes an API outage from an empty subscription or unpublished catalogue; it no longer reports missing records when the API could not be reached.
- The UI verification script now checks the shared `BrandLogo` component for the vector mark, checks the final CSS overrides rather than obsolete earlier declarations, and only requires brand assets that actually exist in the repository.
- A source-level verification pass checked 35 UI assertions plus all referenced brand and integration-logo paths against the current branch tree. This is not a substitute for running the complete script, typecheck, build, or browser-based checks.

## Landing-page completion pass

- Improved the mobile navigation dialog for keyboard users: opening moves focus into the menu, Tab/Shift+Tab stay inside it, and Escape closes it and returns focus to the menu trigger.
- Replaced the remaining green status dot on the illustrative hero card with a neutral example marker.
- Tightened social metadata to a standard summary card because no verified large social-preview image is configured; made indexing intent explicit and added a public `robots.ts` policy.
- Switched the Apple touch icon to the repository's raster brand asset while retaining the vector browser icon.
- Extended UI regression assertions for section anchors, CTA routes, mobile focus behavior, responsive breakpoints, reduced motion, integration caveats, and metadata.
- Source inspection confirmed the six navigation targets exist once each, the key CTAs reference `/register`, `/login`, and `/packages`, and all 15 referenced integration-logo paths are present in the branch tree.
- Execution limitation remains: the environment could not clone the repository because GitHub DNS/network access was unavailable, and GitHub Actions has not returned a successful run. Browser rendering, production build, and typecheck are therefore not claimed as verified.
