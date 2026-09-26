import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const layout = read('apps/web/app/layout.tsx');
const landing = read('apps/web/app/page.tsx');
const register = read('apps/web/app/register/page.tsx');
const nav = read('apps/web/app/landing-nav.tsx');

const required = [
  ['premium.css import', layout.includes("import './premium.css';")],
  ['LandingNav import', landing.includes("import LandingNav from './landing-nav';")],
  ['LandingNav usage', landing.includes('<LandingNav />')],
  ['registration CTA', landing.includes('href="/register"')],
  ['confirm password field', register.includes('confirmPassword')],
  ['password strength UX', register.includes('passwordStrength')],
  ['mobile nav control', nav.includes('landing-menu-toggle')],
  ['integration logo markup', landing.includes('jn-integration-logo')],
  ['integration logo source', landing.includes('https://cdn.simpleicons.org/')],
];

const assets = [
  'apps/web/public/brand/jaslyn-net-mark.svg',
  'apps/web/public/brand/jaslyn-net-wordmark.svg',
];

const integrationLogoSlugs = [
  'mikrotik',
  'ubiquiti',
  'tplink',
  'cambiumnetworks',
  'meraki',
  'arubanetworks',
  'grandstream',
  'ruijie',
  'ruckuswireless',
  'openwrt',
  'teltonika',
  'peplink',
  'pfsense',
  'opnsense',
  'freeradius',
];

for (const slug of integrationLogoSlugs) {
  if (!landing.includes(`https://cdn.simpleicons.org/${slug}`)) {
    throw new Error(`UI verification failed: missing integration logo slug ${slug}`);
  }
}

for (const [label, ok] of required) {
  if (!ok) throw new Error(`UI verification failed: ${label}`);
}
for (const asset of assets) {
  if (!fs.existsSync(path.join(root, asset))) throw new Error(`UI verification failed: missing asset ${asset}`);
}

if (landing.includes('Supreme Hybrid Network Operating Engine')) {
  throw new Error('UI verification failed: stale public product title remains in landing source');
}

console.log(`JASLYN NET UI verification passed (${required.length} assertions, ${assets.length} assets, ${integrationLogoSlugs.length} integration brand marks)`);
