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
const routeLoading = read('apps/web/app/loading.tsx');
const skeleton = read('apps/web/app/loading-skeleton.tsx');

const required = [
  ['premium.css import', layout.includes("import './premium.css';")],
  ['LandingNav import', landing.includes("import LandingNav from './landing-nav';")],
  ['LandingNav usage', landing.includes('<LandingNav />')],
  ['registration CTA', landing.includes('href="/register"')],
  ['confirm password field', register.includes('confirmPassword')],
  ['password strength UX', register.includes('passwordStrength')],
  ['mobile nav control', nav.includes('landing-menu-toggle')],
  ['integration logo markup', landing.includes('jn-integration-logo')],
  ['local integration logo source', landing.includes('/integrations/') && !landing.includes('https://cdn.simpleicons.org/')],
  ['official logo asset reference', landing.includes('/brand/jaslyn-official.svg')],
  ['official logo in navigation', nav.includes('/brand/jaslyn-official.svg')],
  ['official logo in console chrome', chrome.includes('/brand/jaslyn-official.svg')],
  ['official logo in auth', login.includes('/brand/jaslyn-official.svg') && register.includes('/brand/jaslyn-official.svg')],
  ['branded route loader', routeLoading.includes('JASLYN NET') && routeLoading.includes('brand-loading-track')],
  ['console skeleton loader', skeleton.includes('console-skeleton-page') && skeleton.includes('aria-busy="true"')],
  ['loading stylesheet', layout.includes("import './loading.css';")],
];

const assets = [
  'apps/web/public/brand/jaslyn-official.svg',
  'apps/web/public/brand/jaslyn-net-mark.svg',
  'apps/web/public/brand/jaslyn-net-wordmark.svg',
];

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

console.log(`JASLYN NET UI verification passed (${required.length} assertions, ${assets.length} brand assets, ${integrationLogoFiles.length} integration brand marks)`);
