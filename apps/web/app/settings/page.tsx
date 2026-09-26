'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { getAccessToken } from '../../lib/auth';

type Density = 'comfortable' | 'compact';
type FontScale = 'normal' | 'large';

type Preferences = {
  density: Density;
  reduceMotion: boolean;
  paymentSubtitles: boolean;
  fontScale: FontScale;
  autoplayTelemetry: boolean;
};

type AccountSummary = {
  profile?: {
    businessName?: string;
    contactName?: string;
    phone?: string;
    email?: string;
    address?: string;
  };
  tenant?: {
    tenantId?: string;
    name?: string;
    timezone?: string;
  };
  subscription?: {
    plan?: string;
    status?: string;
  };
};

const STORAGE_KEY = 'jaslyn-net.preferences';
const DEFAULTS: Preferences = {
  density: 'comfortable',
  reduceMotion: false,
  paymentSubtitles: true,
  fontScale: 'normal',
  autoplayTelemetry: true,
};

function readPreferences(): Preferences {
  if (typeof window === 'undefined') return DEFAULTS;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;

    const parsed = JSON.parse(raw) as Partial<Preferences>;

    return {
      density: parsed.density === 'compact' ? 'compact' : 'comfortable',
      reduceMotion: Boolean(parsed.reduceMotion),
      paymentSubtitles: parsed.paymentSubtitles !== false,
      fontScale: parsed.fontScale === 'large' ? 'large' : 'normal',
      autoplayTelemetry: parsed.autoplayTelemetry !== false,
    };
  } catch {
    return DEFAULTS;
  }
}

function applyPreferences(next: Preferences) {
  document.documentElement.dataset.jnDensity = next.density;
  document.documentElement.dataset.jnReduceMotion = String(next.reduceMotion);
  document.documentElement.dataset.jnPaymentSubtitles = String(next.paymentSubtitles);
  document.documentElement.dataset.jnFontScale = next.fontScale;
  document.documentElement.dataset.jnAutoplayTelemetry = String(next.autoplayTelemetry);
}

function Icon({ name }: { name: 'account' | 'workspace' | 'network' | 'payments' | 'notifications' | 'privacy' | 'devices' | 'appearance' | 'language' | 'developer' | 'support' | 'display' | 'motion' | 'telemetry' }) {
  const icons = {
    account: <><circle cx="12" cy="8" r="3.2" /><path d="M4.5 20c.7-3.2 3-5 7.5-5s6.8 1.8 7.5 5" /></>,
    workspace: <><rect x="3.5" y="5" width="17" height="14" rx="2" /><path d="M8 5V3h8v2M7 10h10M7 14h5" /></>,
    network: <><path d="M5 9a10 10 0 0 1 14 0M8 12a6 6 0 0 1 8 0M11 15a2 2 0 0 1 2 0" /><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" /></>,
    payments: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h4" /></>,
    notifications: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    privacy: <><path d="M12 3 19 6v5c0 4.5-2.5 7.2-7 10-4.5-2.8-7-5.5-7-10V6l7-3Z" /><path d="m9 12 2 2 4-4" /></>,
    devices: <><rect x="5" y="4" width="14" height="10" rx="1.5" /><path d="M3 19h18M9 14v3h6v-3" /></>,
    appearance: <><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5a8.5 8.5 0 0 1 0 17M12 3.5v17M3.5 12h17" /></>,
    language: <><circle cx="12" cy="12" r="8.5" /><path d="M3.8 9h16.4M3.8 15h16.4M12 3.5c2.1 2.5 3.2 5.3 3.2 8.5S14.1 18 12 20.5c-2.1-2.5-3.2-5.3-3.2-8.5S9.9 6 12 3.5Z" /></>,
    developer: <><path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" /></>,
    support: <><circle cx="12" cy="12" r="8.5" /><path d="M9.5 9a2.5 2.5 0 1 1 4.1 1.9c-.9.7-1.6 1.2-1.6 2.4M12 17h.01" /></>,
    display: <><rect x="3.5" y="4" width="17" height="12.5" rx="2" /><path d="M8 20h8M12 16.5V20" /></>,
    motion: <><path d="M5 12h14M12 5v14M7 7l10 10M17 7 7 17" /></>,
    telemetry: <><path d="M4 17h16M6 13h12M8 9h8M10 5h4" /></>,
  } as const;

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {icons[name]}
    </svg>
  );
}

function SettingRow({
  icon,
  title,
  description,
  href,
  trailing,
  onClick,
}: {
  icon: React.ComponentProps<typeof Icon>['name'];
  title: string;
  description?: string;
  href?: string;
  trailing?: React.ReactNode;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="settings-row-icon"><Icon name={icon} /></span>
      <span className="settings-row-copy">
        <strong>{title}</strong>
        {description ? <small>{description}</small> : null}
      </span>
      <span className="settings-row-trailing">
        {trailing}
        {href ? <span className="settings-chevron" aria-hidden="true">›</span> : null}
      </span>
    </>
  );

  if (href) {
    return <Link href={href} className="settings-row-link">{content}</Link>;
  }

  return <button type="button" className="settings-row-link settings-row-button" onClick={onClick}>{content}</button>;
}

function ToggleRow({
  icon,
  title,
  description,
  checked,
  onChange,
}: {
  icon: React.ComponentProps<typeof Icon>['name'];
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="settings-row-link settings-row-button">
      <span className="settings-row-icon"><Icon name={icon} /></span>
      <span className="settings-row-copy"><strong>{title}</strong><small>{description}</small></span>
      <span className={`settings-switch ${checked ? 'on' : ''}`}>
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} aria-label={title} />
        <i />
      </span>
    </div>
  );
}

export default function SettingsPage() {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULTS);
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [saved, setSaved] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const next = readPreferences();
    setPreferences(next);
    applyPreferences(next);

    const token = getAccessToken();
    if (!token) return;

    void apiFetch<AccountSummary>('/account', {
      headers: { Authorization: `Bearer ${token}` },
    }).then(setAccount).catch(() => setAccount(null));
  }, []);

  function update<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    applyPreferences(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  }

  function resetPreferences() {
    setPreferences(DEFAULTS);
    window.localStorage.removeItem(STORAGE_KEY);
    applyPreferences(DEFAULTS);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  }

  const displayName =
    account?.profile?.businessName ||
    account?.profile?.contactName ||
    account?.tenant?.name ||
    'JASLYN NET operator';

  const subtitle = account?.profile?.email || account?.profile?.phone || 'Workspace settings';

  const query = search.trim().toLowerCase();

  const sections = useMemo(() => [
    {
      title: 'Account',
      rows: [
        { icon: 'account' as const, title: 'Account & Workspace', description: 'Identity, team access and workspace controls', href: '/account' },
      ],
    },
    {
      title: 'Connectivity',
      rows: [
        { icon: 'network' as const, title: 'Network & Devices', description: 'Routers, access network, IPAM and WAN', href: '/network' },
        { icon: 'devices' as const, title: 'Sessions & Devices', description: 'Active sessions and connected infrastructure', href: '/sessions' },
        { icon: 'notifications' as const, title: 'Notifications', description: 'Operational alerts and activity updates', href: '/notifications' },
      ],
    },
    {
      title: 'Business',
      rows: [
        { icon: 'payments' as const, title: 'Payments & Billing', description: 'Transactions, packages, vouchers and finance', href: '/payments' },
        { icon: 'workspace' as const, title: 'Plans & Products', description: 'Commercial products and access plans', href: '/packages' },
      ],
    },
    {
      title: 'Privacy & Security',
      rows: [
        { icon: 'privacy' as const, title: 'Security & Audit', description: 'Audit activity and security controls', href: '/audit' },
        { icon: 'devices' as const, title: 'Connected Devices', description: 'Review the operator devices and sessions surface', href: '/sessions' },
      ],
    },
    {
      title: 'Appearance',
      rows: [
        { icon: 'display' as const, title: 'Interface density', description: preferences.density === 'compact' ? 'Compact' : 'Comfortable', href: '#display' },
        { icon: 'appearance' as const, title: 'Reading scale', description: preferences.fontScale === 'large' ? 'Large' : 'Normal', href: '#accessibility' },
        { icon: 'language' as const, title: 'Language', description: 'English • interface language', href: '#language' },
      ],
    },
    {
      title: 'Developer',
      rows: [
        { icon: 'developer' as const, title: 'Network Commands', description: 'Operational command fabric', href: '/network-commands' },
        { icon: 'developer' as const, title: 'RADIUS / AAA', description: 'Authentication and authorization services', href: '/radius' },
      ],
    },
    {
      title: 'Help',
      rows: [
        { icon: 'support' as const, title: 'Support', description: 'Open the account support workflow', href: '/account#support' },
        { icon: 'support' as const, title: 'Privacy & Legal', description: 'Terms, privacy and current legal documents', href: '/legal' },
      ],
    },
  ] as const, [preferences.density, preferences.fontScale]);

  const visibleSections = query
    ? sections.map(section => ({
        ...section,
        rows: section.rows.filter(row =>
          `${row.title} ${row.description} ${section.title}`.toLowerCase().includes(query),
        ),
      })).filter(section => section.rows.length)
    : sections;

  return (
    <main className="settings-page">
      <header className="settings-telegram-hero">
        <div className="settings-profile">
          <div className="settings-profile-avatar"><span>{displayName.slice(0, 1).toUpperCase()}</span></div>
          <div className="settings-profile-copy">
            <strong>{displayName}</strong>
            <span>{subtitle}</span>
            <small>{account?.tenant?.tenantId || 'JASLYN NET workspace'}{account?.tenant?.timezone ? ` · ${account.tenant.timezone}` : ''}</small>
          </div>
        </div>
        <div className="settings-profile-actions">
          <Link href="/account" aria-label="Open account"><Icon name="account" /></Link>
          <Link href="/notifications" aria-label="Open notifications"><Icon name="notifications" /></Link>
        </div>
      </header>

      <div className="settings-search">
        <span><Icon name="network" /></span>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search settings" aria-label="Search settings" />
        {search ? <button type="button" onClick={() => setSearch('')} aria-label="Clear settings search">×</button> : null}
      </div>

      <div className="settings-body">
        <aside className="settings-side-nav">
          <span>JASLYN NET</span>
          <b>Settings</b>
          <small>Workspace control center</small>
        </aside>

        <div className="settings-content">
          {visibleSections.map(section => (
            <section className="settings-group" key={section.title} id={section.title.toLowerCase().replace(/[^a-z]+/g, '-')}>
              <div className="settings-group-label">{section.title}</div>
              <div className="settings-group-surface">
                {section.rows.map(row => (
                  <SettingRow
                    key={row.title}
                    icon={row.icon}
                    title={row.title}
                    description={row.description}
                    href={row.href}
                  />
                ))}
              </div>
            </section>
          ))}

          {!query ? (
            <>
              <section className="settings-group" id="display">
                <div className="settings-group-label">Interface preferences</div>
                <div className="settings-group-surface">
                  <div className="settings-row-link settings-row-button settings-static-row">
                    <span className="settings-row-icon"><Icon name="display" /></span>
                    <span className="settings-row-copy"><strong>Interface density</strong><small>Choose how much operational information fits on screen.</small></span>
                    <span className="settings-segment">
                      <button type="button" className={preferences.density === 'comfortable' ? 'active' : ''} onClick={() => update('density', 'comfortable')}>Comfortable</button>
                      <button type="button" className={preferences.density === 'compact' ? 'active' : ''} onClick={() => update('density', 'compact')}>Compact</button>
                    </span>
                  </div>

                  <ToggleRow icon="motion" title="Reduce motion" description="Minimize non-essential transitions and loading animation." checked={preferences.reduceMotion} onChange={(value) => update('reduceMotion', value)} />
                  <ToggleRow icon="telemetry" title="Live telemetry refresh" description="Allow supported surfaces to refresh operational data automatically." checked={preferences.autoplayTelemetry} onChange={(value) => update('autoplayTelemetry', value)} />
                  <ToggleRow icon="payments" title="Payment provider descriptions" description="Show provider context beneath payment provider marks." checked={preferences.paymentSubtitles} onChange={(value) => update('paymentSubtitles', value)} />

                  <div className="settings-row-link settings-static-row">
                    <span className="settings-row-icon"><Icon name="display" /></span>
                    <span className="settings-row-copy"><strong>Reading scale</strong><small>Increase copy and control sizing across supported surfaces.</small></span>
                    <span className="settings-segment">
                      <button type="button" className={preferences.fontScale === 'normal' ? 'active' : ''} onClick={() => update('fontScale', 'normal')}>Normal</button>
                      <button type="button" className={preferences.fontScale === 'large' ? 'active' : ''} onClick={() => update('fontScale', 'large')}>Large</button>
                    </span>
                  </div>
                </div>
              </section>

              <section className="settings-group" id="language">
                <div className="settings-group-label">Language</div>
                <div className="settings-group-surface">
                  <div className="settings-row-link settings-static-row">
                    <span className="settings-row-icon"><Icon name="language" /></span>
                    <span className="settings-row-copy"><strong>Interface language</strong><small>Current interface language</small></span>
                    <span className="settings-row-trailing"><b>English</b></span>
                  </div>
                </div>
              </section>

              <section className="settings-group">
                <div className="settings-group-label">Workspace context</div>
                <div className="settings-context-strip">
                  <div><span>Subscription</span><strong>{account?.subscription?.plan || 'Workspace plan'}</strong></div>
                  <div><span>Status</span><strong>{account?.subscription?.status || 'Active session'}</strong></div>
                  <div><span>Timezone</span><strong>{account?.tenant?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Browser timezone'}</strong></div>
                </div>
              </section>

              <section className="settings-reset">
                <button type="button" onClick={resetPreferences}>Reset interface preferences</button>
                <p>Only local interface preferences are reset. Network, payment, customer and account data remain unchanged.</p>
              </section>
            </>
          ) : null}
        </div>
      </div>

      <div className={`settings-save ${saved ? 'visible' : ''}`} role="status" aria-live="polite">Preferences saved on this device.</div>
    </main>
  );
}
