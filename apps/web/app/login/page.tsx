'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '../../lib/api';
import { getAccessToken, storeAccessToken } from '../../lib/auth';
import BrandLogo from '../brand-logo';

type LoginResponse = {
  accessToken: string;
  expiresIn: number;
  user: { fullName: string; email: string; role: string };
  tenant: { name: string; timezone: string; currency: string };
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@jaslyn.net');
  const [password, setPassword] = useState('admin123');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (getAccessToken()) router.replace('/dashboard');
  }, [router]);

  async function performLogin(loginEmail: string, loginPass: string) {
    setBusy(true);
    setError('');
    try {
      const result = await apiFetch<LoginResponse>('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail.trim(), password: loginPass }),
      });
      storeAccessToken(result.accessToken);
      router.replace('/dashboard');
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        setError('Barua pepe au nenosiri si sahihi.');
      } else {
        setError(cause instanceof Error ? cause.message : 'Imeshindikana kuingia. Tafadhali jaribu tena.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    await performLogin(email, password);
  }

  return (
    <main className="auth-page">
      <section className="auth-shell" aria-label="Jaslyn Net sign in">
        <div className="auth-brand-block">
          <BrandLogo className="auth-brand-logo" alt="JASLYN NET official logo" />
        </div>
        <div className="auth-layout">
          <div className="auth-intro">
            <span className="auth-kicker">NETWORK &amp; ISP OPERATIONS</span>
            <h1>
              Simamia mtandao wako<br />
              kutoka kituo kimoja.
            </h1>
            <p>
              Subscribers, active sessions, MikroTik/Ruijie/Cambium devices, Wi-Fi packages,
              na malipo ya M-Pesa/Airtel Money katika mfumo mmoja thabiti.
            </p>
            <div className="auth-capabilities">
              <span><i /> Taarifa za mtandao live</span>
              <span><i /> Vouchers &amp; Hotspot billing</span>
              <span><i /> Udhibiti wa wateja &amp; router</span>
            </div>
          </div>

          <form className="auth-card" onSubmit={submit} noValidate>
            <div className="auth-card-head">
              <span>SECURE ACCESS · MFUMO WA MSIMAMIZI</span>
              <h2>Ingia kwenye Mfumo</h2>
              <p>Tumia akaunti yako ya msimamizi wa Jaslyn Net.</p>
            </div>

            {error && <div className="auth-error" role="alert">{error}</div>}

            <label>
              Barua pepe (Email)
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="operator@company.com"
              />
            </label>

            <label>
              Nenosiri (Password)
              <div className="auth-password">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Weka nenosiri"
                />
                <button type="button" onClick={() => setShowPassword((value) => !value)}>
                  {showPassword ? 'Ficha' : 'Onyesha'}
                </button>
              </div>
            </label>

            <button className="auth-submit" disabled={busy}>
              {busy ? 'Inathibitisha…' : 'Ingia kwenye Jaslyn Net →'}
            </button>

            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #e2e8f0', display: 'grid', gap: 8 }}>
              <button
                type="button"
                onClick={() => performLogin('admin@jaslyn.net', 'admin123')}
                disabled={busy}
                style={{
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  borderRadius: 10,
                  padding: '10px 14px',
                  fontWeight: 700,
                  fontSize: 13,
                  color: '#1e293b',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <span>⚡</span> Ingia Mara Moja kama Msimamizi (One-Click Demo)
              </button>
              <p style={{ margin: 0, fontSize: 11, color: '#64748b', textAlign: 'center' }}>
                Akaunti ya majaribio: <b>admin@jaslyn.net</b> / <b>admin123</b>
              </p>
            </div>

            <p className="auth-security">
              <span>●</span> Vipindi vyote vilivyoidhinishwa vinalindwa na Jaslyn Net API.
            </p>
          </form>
        </div>

        <footer className="auth-footer">
          <span>JASLYN NET</span>
          <span>
            <a href="/legal/privacy">Faragha</a> · <a href="/legal/terms">Vigezo</a> ·{' '}
            <a href="/legal/cookies">Cookies</a> · <a href="/legal">Legal Center</a> · Mtandao mpya?{' '}
            <a href="/register">Fungua akaunti mpya</a>
          </span>
        </footer>
      </section>
    </main>
  );
}
