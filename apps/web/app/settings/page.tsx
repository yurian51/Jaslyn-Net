'use client';

import { useEffect, useMemo, useState } from 'react';

type Density = 'comfortable' | 'compact';
type FontScale = 'normal' | 'large';

type Preferences = {
  density: Density;
  reduceMotion: boolean;
  paymentSubtitles: boolean;
  fontScale: FontScale;
};

const STORAGE_KEY = 'jaslyn-net.preferences';
const DEFAULTS: Preferences = {
  density: 'comfortable',
  reduceMotion: false,
  paymentSubtitles: true,
  fontScale: 'normal',
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
}

function SettingsIcon({ name }: { name: 'display' | 'accessibility' | 'payments' | 'navigation' | 'security' }) {
  const paths = {
    display: <><rect x="3.5" y="4" width="17" height="12.5" rx="2" /><path d="M8 20h8M12 16.5V20" /></>,
    accessibility: <><circle cx="12" cy="4.5" r="2" /><path d="M5 8h14M12 7v13M8 12l4 3 4-3M8.5 20l3.5-5 3.5 5" /></>,
    payments: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h4" /></>,
    navigation: <><path d="M4 7h16M4 12h16M4 17h16" /><circle cx="8" cy="7" r="1.5" fill="currentColor" stroke="none" /><circle cx="16" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="10" cy="17" r="1.5" fill="currentColor" stroke="none" /></>,
    security: <><path d="M12 3 19 6v5c0 4.5-2.5 7.2-7 10-4.5-2.8-7-5.5-7-10V6l7-3Z" /><path d="m9 12 2 2 4-4" /></>,
  } as const;

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

export default function SettingsPage() {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULTS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const next = readPreferences();
    setPreferences(next);
    applyPreferences(next);
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

  const browserTimezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Browser timezone',
    [],
  );

  return (
    <main className="settings-page">
      <header className="settings-header settings-hero">
        <div>
          <div className="settings-kicker">JASLYN NET / WORKSPACE</div>
          <h1>Settings</h1>
          <p>Shape the operator experience without changing your network or billing data.</p>
        </div>
        <div className="settings-status">
          <span className="settings-status-dot" />
          <div><strong>Preferences active</strong><small>Stored locally on this device</small></div>
        </div>
      </header>

      <div className="settings-layout">
        <aside className="settings-index" aria-label="Settings sections">
          <div className="settings-index-label">SETTINGS</div>
          <a href="#display" className="active"><SettingsIcon name="display" /><span>Display</span></a>
          <a href="#accessibility"><SettingsIcon name="accessibility" /><span>Accessibility</span></a>
          <a href="#payments"><SettingsIcon name="payments" /><span>Payments</span></a>
          <a href="#navigation"><SettingsIcon name="navigation" /><span>Navigation</span></a>
          <a href="#security"><SettingsIcon name="security" /><span>Session &amp; security</span></a>
        </aside>

        <section className="settings-main">
          <section id="display" className="settings-section">
            <div className="settings-section-heading">
              <div><span className="settings-kicker">01 / INTERFACE</span><h2>Display</h2><p>Choose the information density that fits your operating style.</p></div>
              <span className="settings-section-icon"><SettingsIcon name="display" /></span>
            </div>

            <div className="settings-option-grid">
              <label className={`settings-choice ${preferences.density === 'comfortable' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="density"
                  checked={preferences.density === 'comfortable'}
                  onChange={() => update('density', 'comfortable')}
                />
                <span><b>Comfortable</b><small>More breathing room for monitoring and review.</small></span>
                <em>Default</em>
              </label>
              <label className={`settings-choice ${preferences.density === 'compact' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="density"
                  checked={preferences.density === 'compact'}
                  onChange={() => update('density', 'compact')}
                />
                <span><b>Compact</b><small>Higher information density for active operations.</small></span>
                <em>Dense</em>
              </label>
            </div>
          </section>

          <section id="accessibility" className="settings-section">
            <div className="settings-section-heading">
              <div><span className="settings-kicker">02 / ACCESSIBILITY</span><h2>Accessibility &amp; motion</h2><p>Keep the control plane comfortable during long operational sessions.</p></div>
              <span className="settings-section-icon"><SettingsIcon name="accessibility" /></span>
            </div>

            <div className="settings-row-list">
              <label className="settings-row">
                <span><b>Reduce motion</b><small>Minimize non-essential animation, transitions and shimmer effects.</small></span>
                <span className={`settings-switch ${preferences.reduceMotion ? 'on' : ''}`}>
                  <input type="checkbox" checked={preferences.reduceMotion} onChange={(event) => update('reduceMotion', event.target.checked)} aria-label="Reduce motion" />
                  <i />
                </span>
              </label>

              <div className="settings-row">
                <span><b>Reading scale</b><small>Increase interface copy and control sizing across supported surfaces.</small></span>
                <div className="settings-segment">
                  <button type="button" className={preferences.fontScale === 'normal' ? 'active' : ''} onClick={() => update('fontScale', 'normal')}>Normal</button>
                  <button type="button" className={preferences.fontScale === 'large' ? 'active' : ''} onClick={() => update('fontScale', 'large')}>Large</button>
                </div>
              </div>
            </div>
          </section>

          <section id="payments" className="settings-section">
            <div className="settings-section-heading">
              <div><span className="settings-kicker">03 / COMMERCE</span><h2>Payment display</h2><p>Control presentation of provider context without changing transaction behavior.</p></div>
              <span className="settings-section-icon"><SettingsIcon name="payments" /></span>
            </div>

            <div className="settings-row-list">
              <label className="settings-row">
                <span><b>Provider descriptions</b><small>Show short provider context beneath payment provider marks.</small></span>
                <span className={`settings-switch ${preferences.paymentSubtitles ? 'on' : ''}`}>
                  <input type="checkbox" checked={preferences.paymentSubtitles} onChange={(event) => update('paymentSubtitles', event.target.checked)} aria-label="Provider descriptions" />
                  <i />
                </span>
              </label>
            </div>

            <div className="settings-note">
              <span className="settings-note-mark">i</span>
              <div><strong>Presentation only</strong><p>These preferences affect this device's interface. Payment provider configuration and transaction state remain server-controlled.</p></div>
            </div>
          </section>

          <section id="navigation" className="settings-section">
            <div className="settings-section-heading">
              <div><span className="settings-kicker">04 / NAVIGATION</span><h2>Mobile navigation</h2><p>The primary control plane stays within one thumb-friendly navigation surface.</p></div>
              <span className="settings-section-icon"><SettingsIcon name="navigation" /></span>
            </div>

            <div className="settings-navigation-preview">
              {[
                ['Overview', '⌂'],
                ['Customers', '◦'],
                ['Sessions', '≋'],
                ['Network', '⌘'],
                ['More', '•••'],
              ].map(([label, glyph], index) => (
                <div key={label} className={index === 0 ? 'active' : ''}>
                  <span>{glyph}</span><b>{label}</b>
                </div>
              ))}
              <div className="settings-navigation-note"><strong>More</strong><span>Secondary network, commercial and administration modules stay grouped here.</span></div>
            </div>
          </section>

          <section id="security" className="settings-section">
            <div className="settings-section-heading">
              <div><span className="settings-kicker">05 / SESSION</span><h2>Session &amp; security</h2><p>Browser-level information only. Authentication remains governed by JASLYN NET.</p></div>
              <span className="settings-section-icon"><SettingsIcon name="security" /></span>
            </div>

            <div className="settings-security-grid">
              <div><span>Browser timezone</span><strong>{browserTimezone}</strong></div>
              <div><span>Preference storage</span><strong>Local device</strong></div>
              <div><span>Interface session</span><strong>Protected workspace</strong></div>
            </div>
          </section>

          <section className="settings-reset">
            <div><div><strong>Reset interface preferences</strong><span>Return density, motion, reading scale and payment display to the default state on this device.</span></div>
            <button type="button" onClick={resetPreferences}>Reset preferences</button></div>
          </section>
        </section>
      </div>

      <div className={`settings-save ${saved ? 'visible' : ''}`} role="status" aria-live="polite">
        Preferences saved on this device.
      </div>
    </main>
  );
}
