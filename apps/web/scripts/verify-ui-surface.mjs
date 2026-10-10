import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const layout = read('apps/web/app/layout.tsx');
const landing = read('apps/web/app/page.tsx');
const register = read('apps/web/app/register/page.tsx');
const login = read('apps/web/app/login/page.tsx');
const nav = read('apps/web/app/landing-nav.tsx');
const chrome = read('apps/web/app/console-chrome.tsx');
const dashboard = read('apps/web/app/dashboard/page.tsx');
const dashboardCss = read('apps/web/app/dashboard/dashboard.css');
const routeLoading = read('apps/web/app/loading.tsx');
const skeleton = read('apps/web/app/loading-skeleton.tsx');
const brandLogo = read('apps/web/app/brand-logo.tsx');

const required = [
  ['premium.css import', layout.includes("import './premium.css';")],
  ['LandingNav import', landing.includes("import LandingNav from './landing-nav';")],
  ['LandingNav usage', landing.includes('<LandingNav />')],
  ['preview explicitly illustrative', landing.includes('ILLUSTRATIVE WORKSPACE') && landing.includes('Illustrative session')],
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

  ['official vector logo reference', landing.includes('/ram-logo-scalable.svg')],
  ['official raster fallback references', brandLogo.includes('/1000242339.png') && brandLogo.includes('/capricon.png')],
  ['official logo in navigation', nav.includes("BrandLogo")],
  ['official logo in console chrome', chrome.includes("BrandLogo")],
  ['official logo in auth', login.includes("BrandLogo") && register.includes("BrandLogo")],
  ['branded route loader', routeLoading.includes('JASLYN NET') && routeLoading.includes('brand-loading-progress')],
  ['dashboard premium commandbar', dashboard.includes('dashboard-commandbar') && dashboard.includes('commandbar-refresh')],
  ['dashboard premium KPI composition', dashboard.includes('overview-kpi-icon') && dashboard.includes('Network availability')],
  ['dashboard locations posture', dashboard.includes('SITE FOOTPRINT') && dashboard.includes('ACCESS POSTURE')],
  ['dashboard premium CSS', dashboardCss.includes('.overview-kpi{') && dashboardCss.includes('.dashboard-commandbar{')],
  ['skeleton brand state', routeLoading.includes('brand-loading-skeleton') && skeleton.includes('console-skeleton-page')],

  ['console skeleton loader', skeleton.includes('console-skeleton-page') && skeleton.includes('aria-busy="true"')],
  ['loading stylesheet', layout.includes("import './loading.css';")],
  ['no superseded generated logo references', !landing.includes('jaslyn-official.svg') && !nav.includes('jaslyn-official.svg') && !chrome.includes('jaslyn-official.svg') && !login.includes('jaslyn-official.svg') && !register.includes('jaslyn-official.svg')],
  ['unboxed integration layout', landing.includes('jn-integration-brand') && !landing.includes('jn-integration-watermark')],
  ['unboxed identity styling', !read('apps/web/app/landing-premium.css').includes('jn-integration-logo-box') && !read('apps/web/app/landing-premium.css').includes('jn-integration-watermark')],
  ['unboxed auth brand', !read('apps/web/app/auth.css').includes('.auth-brand-logo{border:1px')],
  ['unboxed product-preview brand', read('apps/web/app/landing-premium.css').includes('.jn-preview-brand img') && !read('apps/web/app/landing-premium.css').includes('jn-preview-brand img{width:29px')],


];

const assets = [
  'apps/web/public/ram-logo-scalable.svg',
  'apps/web/public/1000242339.png',
  'apps/web/public/capricon.png',
  'apps/web/public/brand/jaslyn-net-mark.svg',
  'apps/web/public/brand/jaslyn-net-wordmark.svg',
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
