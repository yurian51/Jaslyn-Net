'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '../../lib/api';
import { getAccessToken, storeAccessToken } from '../../lib/auth';

type LoginResponse = {
  accessToken: string;
  expiresIn: number;
  user: { fullName: string; email: string; role: string };
  tenant: { name: string; timezone: string; currency: string };
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (getAccessToken()) router.replace('/dashboard');
  }, [router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await apiFetch<LoginResponse>('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      storeAccessToken(result.accessToken);
      router.replace('/dashboard');
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) setError('The email or password is incorrect.');
      else setError(cause instanceof Error ? cause.message : 'Unable to sign in. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-shell" aria-label="Jaslyn Net sign in">
        <div className="auth-brand-block">
          <div className="auth-mark">J</div>
          <div><strong>JASLYN NET</strong><span>Connectivity operations platform</span></div>
        </div>
        <div className="auth-layout">
          <div className="auth-intro">
            <span className="auth-kicker">NETWORK OPERATIONS</span>
            <h1>Run your network<br />from one control plane.</h1>
            <p>Subscribers, sessions, devices, billing and network state connected in one operational workspace.</p>
            <div className="auth-capabilities">
              <span><i /> Live network state</span>
              <span><i /> Subscriber & billing control</span>
              <span><i /> Audited operator actions</span>
            </div>
          </div>
          <form className="auth-card" onSubmit={submit} noValidate>
            <div className="auth-card-head"><span>SECURE ACCESS</span><h2>Sign in</h2><p>Use your Jaslyn Net operator account.</p></div>
            {error && <div className="auth-error" role="alert">{error}</div>}
            <label>Email address<input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="operator@company.com" /></label>
            <label>Password<div className="auth-password"><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} placeholder="Enter your password" /><button type="button" onClick={() => setShowPassword(value => !value)}>{showPassword ? 'Hide' : 'Show'}</button></div></label>
            <button className="auth-submit" disabled={busy}>{busy ? 'Authenticating…' : 'Sign in to Jaslyn Net'}</button>
            <p className="auth-security"><span>●</span> Authenticated sessions are protected by the Jaslyn Net API.</p>
          </form>
        </div>
        <footer className="auth-footer"><span>JASLYN NET</span><span>Network • Customers • Billing • Operations</span></footer>
      </section>
    </main>
  );
}
