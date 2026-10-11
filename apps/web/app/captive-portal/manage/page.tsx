'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '../../lib/api';
import { getAccessToken } from '../../lib/auth';

type Settings = {
  enabled: boolean;
  title: string | null;
  welcomeMessage: string | null;
  termsText: string;
  supportPhone: string | null;
  supportEmail: string | null;
  updatedAt?: string | null;
};

const defaults: Settings = {
  enabled: false, title: '', welcomeMessage: 'Choose a Wi-Fi package or use a voucher to connect.',
  termsText: 'By connecting, you agree to the network usage policy.', supportPhone: '', supportEmail: '', updatedAt: null,
};

export default function CaptivePortalSettingsPage() {
  const [form, setForm] = useState<Settings>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const headers = () => {
    const token = getAccessToken();
    return { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) };
  };

  useEffect(() => {
    let alive = true;
    apiFetch<Settings>('/captive-portal/settings', { headers: headers() })
      .then(value => { if (alive) setForm({ ...defaults, ...value }); })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : 'Could not load portal settings.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const change = (key: keyof Settings, value: string | boolean) => setForm(old => ({ ...old, [key]: value }));
  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(''); setMessage('');
    try {
      const result = await apiFetch<Settings>('/captive-portal/settings', {
        method: 'PUT', headers: headers(),
        body: JSON.stringify({
          enabled: form.enabled, title: form.title || '', welcomeMessage: form.welcomeMessage || '',
          termsText: form.termsText, supportPhone: form.supportPhone || '', supportEmail: form.supportEmail || '',
        }),
      });
      setForm({ ...defaults, ...result });
      setMessage('Captive portal settings saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Settings could not be saved.');
    } finally { setSaving(false); }
  }

  return <main style={{ maxWidth: 880, margin: '0 auto', padding: '28px 18px 56px', color: '#101828' }}>
    <Link href="/packages" style={{ color: '#175cd3', textDecoration: 'none', fontWeight: 650 }}>← Back to packages</Link>
    <header style={{ margin: '22px 0' }}>
      <p style={{ fontSize: 12, letterSpacing: 1.8, fontWeight: 800, color: '#475467' }}>CUSTOMER EXPERIENCE</p>
      <h1 style={{ fontSize: 30, margin: '8px 0' }}>Captive Portal</h1>
      <p style={{ color: '#475467', lineHeight: 1.6 }}>Configure the public Wi-Fi landing page, terms and support contacts for your organization.</p>
    </header>
    {loading ? <p role="status">Loading portal settings…</p> : <form onSubmit={save} style={{ display: 'grid', gap: 18 }}>
      {error && <p role="alert" style={{ background: '#fff1f0', padding: 12, borderRadius: 10 }}>{error}</p>}
      {message && <p role="status" style={{ background: '#ecfdf3', padding: 12, borderRadius: 10 }}>{message}</p>}
      <section style={{ background: '#fff', border: '1px solid #e4e7ec', borderRadius: 16, padding: 20, display: 'grid', gap: 16 }}>
        <label style={{ display: 'flex', gap: 12, alignItems: 'center', fontWeight: 700 }}>
          <input type="checkbox" checked={form.enabled} onChange={e => change('enabled', e.target.checked)} />
          Enable public captive portal
        </label>
        <p style={{ margin: 0, color: '#667085', fontSize: 13 }}>Only active packages marked “Show on portal” are listed publicly. Enabling this page does not itself configure checkout or grant network access.</p>
        <label style={{ display: 'grid', gap: 6, fontWeight: 650 }}>Portal title
          <input maxLength={120} value={form.title ?? ''} onChange={e => change('title', e.target.value)} placeholder="Business or Wi-Fi name" style={field} />
        </label>
        <label style={{ display: 'grid', gap: 6, fontWeight: 650 }}>Welcome message
          <textarea maxLength={2000} rows={3} value={form.welcomeMessage ?? ''} onChange={e => change('welcomeMessage', e.target.value)} style={field} />
        </label>
      </section>
      <section style={{ background: '#fff', border: '1px solid #e4e7ec', borderRadius: 16, padding: 20, display: 'grid', gap: 16 }}>
        <h2 style={{ margin: 0, fontSize: 19 }}>Terms and support</h2>
        <label style={{ display: 'grid', gap: 6, fontWeight: 650 }}>Terms of use (required)
          <textarea required minLength={1} maxLength={10000} rows={6} value={form.termsText} onChange={e => change('termsText', e.target.value)} style={field} />
        </label>
        <label style={{ display: 'grid', gap: 6, fontWeight: 650 }}>Support phone
          <input maxLength={40} value={form.supportPhone ?? ''} onChange={e => change('supportPhone', e.target.value)} placeholder="+255…" style={field} />
        </label>
        <label style={{ display: 'grid', gap: 6, fontWeight: 650 }}>Support email
          <input type="email" maxLength={254} value={form.supportEmail ?? ''} onChange={e => change('supportEmail', e.target.value)} placeholder="support@example.com" style={field} />
        </label>
      </section>
      <div><button type="submit" disabled={saving || loading} style={{ border: 0, borderRadius: 10, background: '#175cd3', color: '#fff', padding: '12px 18px', fontWeight: 750, cursor: saving ? 'wait' : 'pointer' }}>{saving ? 'Saving…' : 'Save portal settings'}</button></div>
    </form>}
  </main>;
}

const field: React.CSSProperties = { width: '100%', border: '1px solid #d0d5dd', borderRadius: 10, padding: '11px 12px', font: 'inherit', background: '#fff', boxSizing: 'border-box' };
