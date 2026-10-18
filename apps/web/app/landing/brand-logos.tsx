import fs from 'node:fs';
import path from 'node:path';

/**
 * Brand marks are shown as images wherever an official file exists in /public. When a file is missing the
 * component falls back to the name; it never draws or approximates a logo.
 */
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const exists = (rel: string) => { try { return fs.existsSync(path.join(PUBLIC_DIR, rel)); } catch { return false; } };

interface Vendor { name: string; file: string; /** logo is drawn for a dark background (e.g. white lettering) */ dark?: boolean }
/** `file` is relative to /public. Entries whose file is missing or is only text render as the name. */
export const VENDOR_LOGOS: Vendor[] = [
  { name: 'MikroTik', file: 'integrations/mikrotik.svg' },
  { name: 'UniFi (Ubiquiti)', file: 'integrations/ubiquiti.svg' },
  { name: 'TP-Link Omada', file: 'integrations/tplink.svg' },
  { name: 'Cambium Networks', file: 'integrations/cambium-networks.svg' },
  { name: 'Cisco Meraki', file: 'integrations/meraki.svg' },
  { name: 'Aruba', file: 'integrations/aruba.svg' },
  { name: 'Grandstream', file: 'integrations/grandstream.svg' },
  { name: 'Ruckus', file: 'integrations/ruckus-logo.svg' }, // not supplied yet: ruckus.svg in the repo is plain text, not a logo
  { name: 'Teltonika', file: 'integrations/teltonika.svg' },
  { name: 'Peplink', file: 'integrations/peplink.svg', dark: true },
  { name: 'pfSense', file: 'integrations/pfsense.svg' },
  { name: 'OPNsense', file: 'integrations/opnsense.svg' },
  { name: 'OpenWrt', file: 'integrations/openwrt.svg' },
  { name: 'Ruijie Reyee', file: 'integrations/ruijie-reyee.svg' },
  { name: 'FreeRADIUS', file: 'integrations/freeradius.svg' },
];

const PAYMENT_FILES: Record<string, string> = {
  'M-Pesa': 'mpesa', 'Mixx by Yas': 'mixx-by-yas', 'Airtel Money': 'airtel-money', 'HaloPesa': 'halopesa', 'AzamPesa': 'azampesa',
};
const EXTENSIONS = ['svg', 'png', 'webp'];

/** URL of the first logo file found for a payment brand, or null. */
export function paymentLogoUrl(name: string): string | null {
  const id = PAYMENT_FILES[name];
  if (!id) return null;
  for (const ext of EXTENSIONS) if (exists(`brands/payments/${id}.${ext}`)) return `/brands/payments/${id}.${ext}`;
  return null;
}

export function paymentLogoMap(names: string[]): Record<string, string | null> {
  return Object.fromEntries(names.map((n) => [n, paymentLogoUrl(n)]));
}

export function VendorLogoWall() {
  return (
    <ul className="jl-logos" aria-label="Supported router brands">
      {VENDOR_LOGOS.map((v) => {
        const available = exists(v.file);
        return (
          <li key={v.name} className={['jl-logo-tile', available ? '' : 'jl-logo-missing', v.dark ? 'jl-logo-dark' : ''].filter(Boolean).join(' ')}>
            {available
              ? <img src={`/${v.file}`} alt={v.name} title={v.name} loading="lazy" decoding="async" />
              : <span>{v.name}</span>}
          </li>
        );
      })}
    </ul>
  );
}

export function PaymentBrandList({ names, size = 'md' }: { names: string[]; size?: 'md' | 'lg' }) {
  return (
    <ul className={`jl-paybrands jl-paybrands-${size}`} aria-label="Mobile-money methods">
      {names.map((n) => {
        const url = paymentLogoUrl(n);
        return (
          <li key={n} className={url ? 'jl-paybrand' : 'jl-paybrand jl-paybrand-text'}>
            {url
              ? <img src={url} alt={n} title={n} loading="lazy" decoding="async" />
              : <span>{n}</span>}
          </li>
        );
      })}
    </ul>
  );
}
