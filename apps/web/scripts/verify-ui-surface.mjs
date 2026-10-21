import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const layout = read('apps/web/app/layout.tsx');
const robots = read('apps/web/app/robots.ts');
const landing = read('apps/web/app/page.tsx');
const landingNav = read('apps/web/app/landing-nav.tsx');
const landingCss = read('apps/web/app/landing-premium.css');
const register = read('apps/web/app/register/page.tsx');
const login = read('apps/web/app/login/page.tsx');
const nav = read('apps/web/app/landing-nav.tsx');
const chrome = read('apps/web/app/console-chrome.tsx');
const dashboard = read('apps/web/app/dashboard/page.tsx');
const dashboardCss = read('apps/web/app/dashboard/dashboard.css');
const routeLoading = read('apps/web/app/loading.tsx');
const skeleton = read('apps/web/app/loading-skeleton.tsx');
const brandLogo = read('apps/web/app/brand-logo.tsx');
const platformSubscription = read('apps/web/app/dashboard/platform-subscription/page.tsx');

const routeExists = (route) => {
  const segments = route.split('/').filter(Boolean);
  const visit = (directory, index) => {
    if (index === segments.length) {
      return ['page.tsx', 'page.ts', 'page.jsx', 'page.js', 'route.ts'].some((file) => fs.existsSync(path.join(directory, file)));
    }
    const exact = path.join(directory, segments[index]);
    if (fs.existsSync(exact) && fs.statSync(exact).isDirectory() && visit(exact, index + 1)) return true;
    return fs.readdirSync(directory, { withFileTypes: true })
      .some((entry) => entry.isDirectory() && /^\[.+\]$/.test(entry.name) && visit(path.join(directory, entry.name), index + 1));
  };
  return visit('apps/web/app', 0);
};

const consoleNavigationRoutes = [...chrome.matchAll(/\['[^']+',\s*'[^']+',\s*'([^']+)'\]/g)].map((match) => match[1]);
const operatorWorkspaceBlock = dashboard.split('const OPERATOR_WORKSPACES = [')[1]?.split('] as const;')[0] ?? '';
const operatorWorkspaceRoutes = [...operatorWorkspaceBlock.matchAll(/href: '([^']+)'/g)].map((match) => match[1]);
const payments = read('apps/web/app/payments/page.tsx');
const sessions = read('apps/web/app/sessions/page.tsx');
const finance = read('apps/web/app/finance/page.tsx');
const purchases = read('apps/web/app/purchases/page.tsx');
const customers = read('apps/web/app/customers/page.tsx');
const vouchers = read('apps/web/app/vouchers/page.tsx');
const network = read('apps/web/app/network/page.tsx');
const notificationsPage = read('apps/web/app/notifications/page.tsx');
const notificationsCss = read('apps/web/app/notifications/notifications.css');
const notificationsService = read('apps/api/src/notifications/notifications.service.ts');
const notificationsController = read('apps/api/src/notifications/notifications.controller.ts');
const smsProvider = read('apps/api/src/notifications/sms.provider.ts');
const smsWorker = read('apps/api/src/notifications/notifications.worker.ts');
const smsMigration = read('apps/api/migrations/060_sms_delivery_provider.sql');
const smsCampaignMigration = read('apps/api/migrations/061_sms_campaigns.sql');

// Shared UI system contracts: keep accessibility and failure states covered by the existing
// repository verification script without introducing a separate test-runner dependency.
const uiButton = read('apps/web/app/components/ui/button.tsx');
const uiFields = read('apps/web/app/components/ui/field.tsx');
const uiTable = read('apps/web/app/components/ui/data-table.tsx');
const uiFeedback = read('apps/web/app/components/ui/feedback.tsx');
const uiExports = read('apps/web/app/components/ui/index.ts');
const uiStyles = read('apps/web/app/components/ui/ui.css');
const uiGallery = read('apps/web/app/ui-kit/page.tsx');

const required = [
  ['internal console uses public-site surface and accent tokens', read('apps/web/app/console-chrome.css').includes('--console-bg: #f6f8fb;') && read('apps/web/app/console-chrome.css').includes('--console-blue: #3b6fd1;')],
  ['internal console has keyboard focus and reduced-motion rules', read('apps/web/app/console-chrome.css').includes('.console-chrome-content :is(a, button, [role="button"]):focus-visible') && read('apps/web/app/console-chrome.css').includes('@media (prefers-reduced-motion: reduce)')],
  ['premium.css import', layout.includes("import './premium.css';")],
  ['LandingNav import', landing.includes("import LandingNav from './landing-nav';")],
  ['LandingNav usage', landing.includes('<LandingNav />')],
  ['mobile menu focus management', landingNav.includes('focusable?.[0]?.focus()') && landingNav.includes('event.key === \'Escape\'') && landingNav.includes('last.focus()')],
  ['mobile menu trigger semantics', landingNav.includes('aria-expanded={open}') && landingNav.includes('aria-controls="landing-mobile-menu"')],
  ['all navigation section targets exist', ['platform', 'architecture', 'operations', 'integrations', 'modules', 'faq'].every((id) => landing.includes('id="' + id + '"'))],
  ['real routes exist for landing CTAs', ['/register', '/login', '/packages'].every((route) => landing.includes('href="' + route + '"'))],
  ['integration claims include deployment caveat', landing.includes('confirm compatibility before planning a production cutover')],
  ['no green live-status marker on illustrative preview', !landing.includes('className="status-dot"') && landing.includes('className="jn-preview-example-dot"')],
  ['mobile landing breakpoints present', landingCss.includes('@media(max-width:760px)') && landingCss.includes('@media(max-width:520px)')],
  ['reduced-motion preference respected', landingCss.includes('@media(prefers-reduced-motion:reduce)')],
  ['outcomes section adapts to mobile', landingCss.includes('@media(max-width:620px)') && landingCss.includes('.jn-outcomes-grid{grid-template-columns:1fr')],
  ['social card does not claim missing large image', read('apps/web/app/layout.tsx').includes("card: 'summary'")],
  ['public indexing policy is explicit', layout.includes('robots: { index: true, follow: true }') && robots.includes("allow: '/'")],
  ['Apple touch icon uses raster asset', layout.includes("apple: '/1000242339.png'")],
  ['preview explicitly illustrative', landing.includes('ILLUSTRATIVE WORKSPACE') && landing.includes('Illustrative session')],
  ['subscription API errors do not show false empty state', platformSubscription.includes('!loading && !current && !error')],
  ['subscription catalogue error differs from unpublished pricing', platformSubscription.includes('Platform plans are temporarily unavailable.') && platformSubscription.includes('Platform pricing has not been published yet.')],
  ['dashboard does not report clean health without telemetry', dashboard.includes('No health conclusion can be drawn without an API snapshot') && dashboard.includes('API UNAVAILABLE')],
  ['payment ledger and provider methods fail independently', payments.includes('paymentResult') && payments.includes('methodResult') && payments.includes('failures.join')],
  ['payment ledger empty state requires a successful response', payments.includes('paymentsLoaded') && payments.includes('Payment ledger unavailable')],
  ['payment-method empty state requires a successful response', payments.includes('methodsLoaded') && payments.includes('Payment-method configuration could not be loaded.')],
  ['payment currency formatter tolerates unknown codes', payments.includes('catch{return `${c||\'Unknown currency\'}')],

  ['payment totals respect currency boundaries', payments.includes('totalByCurrency') && payments.includes('Object.entries(totalByCurrency)')],
  ['payment ledger search and status filter', payments.includes('visiblePayments') && payments.includes('statusFilter') && payments.includes('Search payments')],
  ['session inventory supports operational search', sessions.includes('visibleSessions') && sessions.includes('Search sessions')],
  ['session empty state distinguishes search filtering', sessions.includes('No sessions match this search and status filter.')],
  ['finance domains survive partial endpoint failures', finance.includes('const results=await Promise.all(endpoints.map') && finance.includes('failures.join')],
  ['finance empty states require successful domain reads', finance.includes('loadedDomains.includes(\'Invoices\')') && finance.includes('Invoice data unavailable; an empty result cannot be confirmed.')],
  ['purchase ledger does not show false zero metrics', purchases.includes('loadedDomains.includes(\'Purchases\')') && purchases.includes('Purchase ledger unavailable')],

  ['purchase domains load independently', purchases.includes('const [purchaseResult, methodsResult, packageResult, customerResult, routerResult] = requests') && purchases.includes('failures.join')],
  ['customer purchase history distinguishes unavailable from empty', customers.includes('salesError') && customers.includes('Purchase history unavailable:') && customers.includes('No customer purchases were returned')],
  ['customer directory supports active-only filtering', customers.includes("activeOnly:String(onlyActive)") && customers.includes('Show active customers only')],
  ['customer counts are not presented before successful load', customers.includes("customersLoaded?pagination.total.toLocaleString():'—'") && customers.includes("salesLoaded&&!salesLoading?sales.length.toLocaleString()")],
  ['voucher and package APIs load independently', vouchers.includes('Promise.allSettled') && vouchers.includes('setVoucherError') && vouchers.includes('setPackageError')],
  ['voucher ledger distinguishes unavailable from verified empty', vouchers.includes('Voucher ledger unavailable.') && vouchers.includes('No vouchers were returned for this tenant.')],
  ['voucher generation requires verified active package data', vouchers.includes('disabled={!packagesLoaded||packages.length===0}')],
  ['voucher print output escapes HTML content', vouchers.includes('escapeHtml(code)') && vouchers.includes('escapeHtml(lastBatch.printStyle)')],
  ['network KPIs wait for a successful inventory snapshot', network.includes('routersLoaded ? routers.length.toLocaleString()') && network.includes('routersLoaded ? online.toLocaleString()') && network.includes('routersLoaded && !filteredRouters.length')],

  ['preview avoids false live payment claims', landing.includes('Illustrative only') && !landing.includes('Reconciled')],
  ['preview avoids false live access claims', landing.includes('Example policy') && !landing.includes('>Applied</span>')],
  ['outcomes section exists', landing.includes('id="jn-outcomes-title"') && landing.includes('jn-outcomes-grid')],
  ['all landing navigation targets exist', ['platform', 'architecture', 'operations', 'integrations', 'modules', 'faq'].every((id) => landing.includes('id="' + id + '"'))],
  ['registration CTA', landing.includes('href="/register"')],
  ['confirm password field', register.includes('confirmPassword')],
  ['password strength UX', register.includes('passwordStrength')],
  ['mobile nav control', nav.includes('landing-menu-toggle')],
  ['integration logo markup', landing.includes('jn-integration-logo')],
  ['local integration logo source', landing.includes('/integrations/') && !landing.includes('https://cdn.simpleicons.org/')],
  ['uploaded brand logo set', brandLogo.includes('/ram-logo-scalable.svg') && brandLogo.includes('/1000242339.png') && brandLogo.includes('/capricon.png')],

  ['official vector logo reference', brandLogo.includes('/ram-logo-scalable.svg')],
  ['official raster fallback references', brandLogo.includes('/1000242339.png') && brandLogo.includes('/capricon.png')],
  ['official logo in navigation', nav.includes("BrandLogo")],
  ['official logo in console chrome', chrome.includes("BrandLogo")],
  ['official logo in auth', login.includes("BrandLogo") && register.includes("BrandLogo")],
  ['branded route loader', routeLoading.includes('JASLYN NET') && routeLoading.includes('brand-loading-progress')],
  ['console navigation avoids dead WiFi operations route', chrome.includes("['WiFi Operations', 'isp', '/isp']") && !chrome.includes("'/upesilipa'")],
  ['all console navigation routes resolve to app pages', consoleNavigationRoutes.length > 0 && consoleNavigationRoutes.every(routeExists)],
  ['nested dashboard routes do not double-highlight overview', chrome.includes("href !== '/dashboard' && pathname.startsWith")],
  ['command palette keyboard handler tracks live search results', chrome.includes('[commandOpen, commandResults, commandIndex, router]') && chrome.indexOf('const commandResults = useMemo') < chrome.indexOf('[commandOpen, commandResults, commandIndex, router]')],
  ['command palette traps and restores keyboard focus', chrome.includes("event.key === 'Tab'") && chrome.includes('commandOpenerRef.current?.focus()') && chrome.includes('commandOpenerRef.current = event.currentTarget')],
  ['dashboard premium commandbar', dashboard.includes('dashboard-commandbar') && dashboard.includes('commandbar-refresh')],
  ['operator launchpad links resolve to real app routes', operatorWorkspaceRoutes.length >= 12 && operatorWorkspaceRoutes.every(routeExists)],
  ['operator launchpad covers core operations domains', ['/network', '/customers', '/sessions', '/payments', '/incidents', '/field-operations', '/network-commands', '/audit', '/ipam', '/radius', '/fiber', '/automation'].every((route) => operatorWorkspaceRoutes.includes(route))],
  ['dashboard health recommendation fails closed on partial telemetry', dashboard.includes('hasOperationalSignals') && dashboard.includes('data.network?.offline !== undefined && data.network?.degraded !== undefined')],
  ['welcome status dot follows API connection state', dashboard.includes("operator-welcome-live-dot ${connection === 'online'")],
  ['dashboard actions do not duplicate the global Ctrl/Cmd+K palette', dashboard.includes('Dashboard actions') && !dashboard.includes("event.key.toLowerCase() === 'k'")],
  ['snapshot export preserves browser download lifecycle', dashboard.includes('window.setTimeout(() => URL.revokeObjectURL(url), 1000)')],
  ['dashboard premium KPI composition', dashboard.includes('overview-kpi-icon') && dashboard.includes('Network availability')],
  ['dashboard locations posture', dashboard.includes('SITE FOOTPRINT') && dashboard.includes('ACCESS POSTURE')],
  ['dashboard premium CSS', dashboardCss.includes('.overview-kpi{') && dashboardCss.includes('.dashboard-commandbar{')],
  ['SMS provider fails closed until explicitly enabled and configured', smsProvider.includes("SMS_ENABLED') === 'true'") && smsProvider.includes('!status.configured') && smsProvider.includes('BEEM_SECRET_KEY')],
  ['SMS outbox is tenant-scoped and idempotent', notificationsService.includes('ON CONFLICT (tenant_id,dedupe_key)') && notificationsService.includes('WHERE tenant_id = $1') && notificationsService.includes('claimSms')],
  ['marketing SMS requires tenant-specific opt-in', notificationsService.includes('sms_marketing_consent=true') && notificationsService.includes('Marketing SMS requires recorded customer opt-in')],
  ['SMS worker does not claim while provider is disabled', smsWorker.includes('if (!this.sms.status().configured) return') && smsWorker.includes('if (this.running || !this.sms.status().configured) return')],
  ['SMS worker has bounded exponential retries', smsWorker.includes('Math.min(3600, 15 * 2 **') && notificationsService.includes('attempts >= 8')],
  ['provider acknowledgement is tracked without exposing secrets', notificationsService.includes('provider_message_id') && smsProvider.includes('credentialsPresent')],
  ['bulk SMS API caps campaign size and normalizes numbers', notificationsService.includes('between 1 and 1000 recipients') && notificationsService.includes('new Set(input.recipients.map(normalizeTanzaniaPhone))') && notificationsController.includes("@Post('sms/bulk')")],
  ['bulk marketing requires opt-in for every recipient', notificationsService.includes('Marketing SMS requires recorded opt-in for every recipient') && notificationsService.includes('SELECT DISTINCT')],
  ['bulk campaigns are tenant-scoped and idempotent', notificationsService.includes('INSERT INTO sms_campaigns') && notificationsService.includes('ON CONFLICT (tenant_id,idempotency_key)') && smsCampaignMigration.includes('FOREIGN KEY (tenant_id,campaign_id) REFERENCES sms_campaigns(tenant_id,id)')],
  ['campaign history query is tenant-scoped', notificationsService.includes('listSmsCampaigns(tenantId: string') && notificationsService.includes('WHERE c.tenant_id=$1')],
  ['bulk composer requires explicit operator confirmation', notificationsPage.includes('queueBulkCampaign') && notificationsPage.includes('Queue bulk SMS') && notificationsPage.includes('disabled={bulkSending || !bulkConfirmed}')],
  ['campaign history shows accepted and failed counts', notificationsPage.includes('Recent bulk campaigns') && notificationsPage.includes('campaign.accepted') && notificationsPage.includes('campaign.failed')],
  ['notification CSS is imported and responsive', notificationsPage.includes("import './notifications.css';") && notificationsCss.includes('.notifications-bulk-form') && notificationsCss.includes('@media(max-width:760px)')],
  ['skeleton brand state', routeLoading.includes('brand-loading-skeleton') && skeleton.includes('console-skeleton-page')],

  ['console skeleton loader', skeleton.includes('console-skeleton-page') && skeleton.includes('aria-busy="true"')],
  ['loading stylesheet', layout.includes("import './loading.css';")],
  ['no superseded generated logo references', !landing.includes('jaslyn-official.svg') && !nav.includes('jaslyn-official.svg') && !chrome.includes('jaslyn-official.svg') && !login.includes('jaslyn-official.svg') && !register.includes('jaslyn-official.svg')],
  ['unboxed integration layout', landing.includes('jn-integration-brand') && !landing.includes('jn-integration-watermark')],
  ['unboxed identity styling', !landing.includes('jn-integration-watermark') && read('apps/web/app/landing-premium.css').includes('/* Final integration composition: floating marks, no card containers. */')],
  ['unboxed auth brand', !read('apps/web/app/auth.css').includes('.auth-brand-logo{border:1px')],
  ['unboxed product-preview brand', read('apps/web/app/landing-premium.css').includes('/* Product-preview brand mark follows the same unboxed identity rule. */') && read('apps/web/app/landing-premium.css').includes('border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;')],

  ['provider-agnostic SMS settings UI', read('apps/web/app/notifications/page.tsx').includes('SMS Gateway Settings') && read('apps/web/app/notifications/page.tsx').includes('/notifications/sms/settings')],
  ['SMS secret handling and host allowlist guidance', read('apps/web/app/notifications/page.tsx').includes('Credentials are write-only') && read('apps/web/app/notifications/page.tsx').includes('SMS_CUSTOM_ALLOWED_HOSTS')],

  // Dashboard visual-reference contract: keep the real operations UI polished without
  // changing the API-backed data flow or adding a second UI test framework.
  ['dashboard premium dark palette is scoped to overview page', dashboardCss.includes('.overview-page{') && dashboardCss.includes('--ov-bg:#061329;') && dashboardCss.includes('--ov-blue:#17a9ff;')],
  ['dashboard KPI cards retain responsive premium surfaces', dashboardCss.includes('.overview-kpi:nth-child(4) .overview-kpi-icon') && dashboardCss.includes('grid-template-columns:repeat(4,minmax(0,1fr))') && dashboardCss.includes('@media(max-width:560px)')],
  ['dashboard charts and tables have dark-theme contrast tokens', dashboardCss.includes('.overview-chart svg line{stroke:#173b66}') && dashboardCss.includes('.table-wrap th{background:#0b2042;color:#83a5d1')],
  ['dashboard keyboard focus is visible on primary actions', dashboardCss.includes('.commandbar-primary a:focus-visible') && dashboardCss.includes('.operator-launchpad-item:focus-visible')],
  ['dashboard responsive overrides preserve small-screen padding', dashboardCss.includes('@media(max-width:820px)') && dashboardCss.includes('.overview-page{padding:14px 9px 28px}'),
  ['dashboard CSS respects reduced-motion preference', dashboardCss.includes('@media(prefers-reduced-motion:reduce)') && dashboardCss.includes('.overview-kpi:hover{transform:none}')],

];

const assets = [
  'apps/web/public/ram-logo-scalable.svg',
  'apps/web/public/1000242339.png',
  'apps/web/public/capricon.png',
];

const uploadedBrandFiles = ['ram-logo-scalable.svg','1000242339.png','capricon.png'];

for (const file of uploadedBrandFiles) {
  const assetPath = path.join(root, 'apps/web/public', file);
  if (!fs.existsSync(assetPath)) throw new Error(`UI verification failed: missing uploaded brand asset ${file}`);
}

const integrationLogoFiles = [
  'mikrotik.svg',
  'ubiquiti.svg',
  'tplink.svg',
  'cambium-networks.svg',
  'meraki.svg',
  'aruba.svg',
  'grandstream.svg',
  'ruijie-reyee.svg',
  'ruckus.svg',
  'openwrt.svg',
  'teltonika.svg',
  'peplink.svg',
  'pfsense.svg',
  'opnsense.svg',
  'freeradius.svg',
];

for (const file of integrationLogoFiles) {
  if (!landing.includes(`/integrations/${file}`)) {
    throw new Error(`UI verification failed: missing integration logo reference ${file}`);
  }
  const assetPath = path.join(root, 'apps/web/public/integrations', file);
  if (!fs.existsSync(assetPath)) {
    throw new Error(`UI verification failed: missing integration logo asset ${file}`);
  }
}

for (const [label, ok] of required) {
  if (!ok) throw new Error(`UI verification failed: ${label}`);
}
for (const asset of assets) {
  if (!fs.existsSync(path.join(root, asset))) throw new Error(`UI verification failed: missing asset ${asset}`);
}

if (login.includes('Supreme Hybrid Network Operating Engine')) {
  throw new Error('UI verification failed: stale public product title remains in landing source');
}

console.log(`JASLYN NET UI verification passed (${required.length} assertions, ${assets.length} tracked brand assets, ${integrationLogoFiles.length} integration brand marks)`);
