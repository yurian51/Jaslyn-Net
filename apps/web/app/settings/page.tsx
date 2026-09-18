'use client';

import { useEffect, useState } from 'react';

type Preferences = {
  density: 'comfortable' | 'compact';
  reduceMotion: boolean;
  paymentSubtitles: boolean;
};

const DEFAULTS: Preferences = { density: 'comfortable', reduceMotion: false, paymentSubtitles: true };

function readPreferences(): Preferences {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = window.localStorage.getItem('jaslyn-net.preferences');
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return {
      density: parsed.density === 'compact' ? 'compact' : 'comfortable',
      reduceMotion: Boolean(parsed.reduceMotion),
      paymentSubtitles: parsed.paymentSubtitles !== false,
    };
  } catch {
    return DEFAULTS;
  }
}

export default function SettingsPage() {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULTS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const next = readPreferences();
    setPreferences(next);
    document.documentElement.dataset.jnDensity = next.density;
    document.documentElement.dataset.jnReduceMotion = String(next.reduceMotion);
  }, []);

  function update<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    window.localStorage.setItem('jaslyn-net.preferences', JSON.stringify(next));
    document.documentElement.dataset.jnDensity = next.density;
    document.documentElement.dataset.jnReduceMotion = String(next.reduceMotion);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1400);
  }

  return (
    <main className="settings-page">
      <header className="settings-header">
        <div className="eyebrow">JASLYN NET / WORKSPACE</div>
        <h1>Settings</h1>
        <p>Control interface preferences for this JASLYN NET workspace.</p>
      </header>

      <section className="settings-grid">
        <article className="settings-card">
          <div className="settings-card-head">
            <div><div className="settings-kicker">INTERFACE</div><h2>Display</h2></div>
            <span className="settings-icon">◌</span>
          </div>
          <label className="setting-row">
            <span><strong>Interface density</strong><small>Choose the amount of information shown per screen.</small></span>
            <select value={preferences.density} onChange={(event) => update('density', event.target.value as Preferences['density'])}>
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </select>
          </label>
          <label className="setting-row setting-toggle">
            <span><strong>Reduce motion</strong><small>Minimize interface transitions and animation.</small></span>
            <input type="checkbox" checked={preferences.reduceMotion} onChange={(event) => update('reduceMotion', event.target.checked)} />
          </label>
        </article>

        <article className="settings-card">
          <div className="settings-card-head">
            <div><div className="settings-kicker">COMMERCIAL</div><h2>Payment display</h2></div>
            <span className="settings-icon">¤</span>
          </div>
          <label className="setting-row setting-toggle">
            <span><strong>Payment provider descriptions</strong><small>Show the short provider status beneath each payment logo.</small></span>
            <input type="checkbox" checked={preferences.paymentSubtitles} onChange={(event) => update('paymentSubtitles', event.target.checked)} />
          </label>
          <div className="settings-info">
            <strong>Provider logos stay compact</strong>
            <span>Payment brands remain inside fixed boxes so an oversized source image cannot expand the payment screen.</span>
          </div>
        </article>

        <article className="settings-card settings-wide">
          <div className="settings-card-head">
            <div><div className="settings-kicker">NAVIGATION</div><h2>Mobile navigation</h2></div>
            <span className="settings-icon">⌘</span>
          </div>
          <div className="mobile-nav-preview">
            {['Overview', 'Customers', 'Sessions', 'Network', 'More', 'Settings'].map((item, index) => (
              <div key={item} className={index === 0 ? 'active' : ''}>
                <span>{index === 5 ? '⚙' : index === 4 ? '•••' : '•'}</span>
                <b>{item}</b>
              </div>
            ))}
          </div>
          <p className="settings-help">Primary operations stay reachable from the bottom navigation. Secondary network, billing and administration modules remain grouped under More.</p>
        </article>
      </section>

      <div className={"settings-save" + (saved ? " visible" : "")} role="status">Preferences saved on this device.</div>
    </main>
  );
}
