'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '../../lib/api';
import { getAccessToken, storeAccessToken } from '../../lib/auth';

type RegisterResponse = { accessToken: string; user: { fullName: string; email: string; role: string }; tenant: { name: string } };

export default function RegisterPage() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (getAccessToken()) router.replace('/dashboard'); }, [router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const result = await apiFetch<RegisterResponse>('/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ businessName: businessName.trim(), fullName: fullName.trim(), email: email.trim(), password }) });
      storeAccessToken(result.accessToken);
      router.replace('/dashboard');
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) setError('An account with this business or email already exists.');
      else setError(cause instanceof Error ? cause.message : 'Unable to create the workspace. Please try again.');
    } finally { setBusy(false); }
  }

  return (
    <main className="auth-page">
      <section className="auth-shell" aria-label="Create Jaslyn Net workspace">
        <div className="auth-brand-block"><div className="auth-mark">J</div><div><strong>JASLYN NET</strong><span>Connectivity operations platform</span></div></div>
        <div className="auth-layout">
          <div className="auth-intro"><span className="auth-kicker">NEW OPERATIONS WORKSPACE</span><h1>Put your network<br />under one control plane.</h1><p>Create a tenant workspace for subscribers, packages, network devices, sessions, billing and operations.</p><div className="auth-capabilities"><span><i /> Tenant-isolated operations</span><span><i /> Network and billing control</span><span><i /> Secure operator identity</span></div></div>
          <form className="auth-card" onSubmit={submit} noValidate>
            <div className="auth-card-head"><span>WORKSPACE SETUP</span><h2>Create workspace</h2><p>Your first account becomes the workspace owner.</p></div>
            {error && <div className="auth-error" role="alert">{error}</div>}
            <label>Business / network name<input required minLength={2} maxLength={160} value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="Example ISP" /></label>
            <label>Your full name<input required minLength={2} maxLength={160} value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Network administrator" /></label>
            <label>Email address<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@example.com" /></label>
            <label>Password<div className="auth-password"><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" required minLength={12} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 12 characters" /><button type="button" onClick={() => setShowPassword(v => !v)}>{showPassword ? 'Hide' : 'Show'}</button></div></label>
            <button className="auth-submit" disabled={busy}>{busy ? 'Creating workspace…' : 'Create Jaslyn Net workspace'}</button>
            <p className="auth-security"><span>●</span> Your owner account is isolated to the workspace you create.</p>
          </form>
        </div>
        <footer className="auth-footer"><span>JASLYN NET</span><span>Already have an account? <a href="/login">Sign in</a></span></footer>
      </section>
    </main>
  );
}
