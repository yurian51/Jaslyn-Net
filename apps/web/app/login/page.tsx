'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '../../lib/api';
import { getAccessToken, storeAccessToken } from '../../lib/auth';
import SiteShell from '../landing/site-chrome';
import { FieldHint, PasswordToggle, PhoneField, phoneLooksValid } from '../landing/auth-controls';

type LoginResponse = { accessToken: string; expiresIn: number; user: { fullName: string; email: string; role: string }; tenant: { name: string; timezone: string; currency: string } };
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'email' | 'phone'>('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');

  useEffect(() => { if (getAccessToken()) router.replace('/dashboard'); }, [router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setFieldError('');
    if (mode === 'email' && !EMAIL_PATTERN.test(email.trim())) {
      setFieldError('Enter a valid email address.');
      return;
    }
    if (mode === 'phone' && !phoneLooksValid(phone)) {
      setFieldError('Enter a valid mobile number, for example 0712 345 678.');
      return;
    }
    if (!password) {
      setFieldError('Enter your password.');
      return;
    }
    setBusy(true);
    try {
      const result = await apiFetch<LoginResponse>('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: (mode === 'email' ? email : phone).trim(), password }),
      });
      storeAccessToken(result.accessToken, rememberMe);
      router.replace('/dashboard');
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) setError(mode === 'email' ? 'The email or password is incorrect.' : 'The mobile number or password is incorrect.');
      else setError(cause instanceof Error ? cause.message : 'Unable to sign in. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SiteShell mainClass="jl-auth-main">
      <section className="jl-auth" aria-label="Jaslyn Net sign in">
        <div className="jl-auth-grid">
          <div className="jl-auth-intro">
            <h1>Welcome back.</h1>
            <p>Sign in to manage your sites, packages and payments.</p>
            <ul><li>Packages and vouchers</li><li>Payments you can check</li><li>Router and session status</li></ul>
          </div>
          <form className="jl-auth-card" onSubmit={submit} noValidate>
            <div className="jl-auth-head"><h2>Sign in</h2><p>Sign in to your Jaslyn Net workspace.</p></div>
            {fieldError && <div className="jl-auth-error" role="alert">{fieldError}</div>}
            {error && <div className="jl-auth-error" role="alert">{error}</div>}
            <div className="jl-tabs" role="tablist" aria-label="Sign in with">
              {(['email', 'phone'] as const).map((m) => (
                <button key={m} type="button" role="tab" id={`login-tab-${m}`} aria-selected={mode === m} aria-controls="login-identifier-panel" tabIndex={mode === m ? 0 : -1}
                  onClick={() => { setMode(m); setFieldError(''); setError(''); }}
                  onKeyDown={(e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); setMode(m === 'email' ? 'phone' : 'email'); } }}>
                  {m === 'email' ? 'Email' : 'Phone number'}
                </button>
              ))}
            </div>
            <div id="login-identifier-panel" role="tabpanel" aria-labelledby={`login-tab-${mode}`} className="jl-tabpanel">
              {mode === 'email' ? (
                <label htmlFor="login-email">Email address
                  <input id="login-email" type="email" autoComplete="username" inputMode="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="operator@company.com" aria-invalid={Boolean(fieldError)} />
                </label>
              ) : (
                <label htmlFor="login-phone">Mobile number
                  <PhoneField id="login-phone" value={phone} onChange={setPhone} invalid={Boolean(fieldError)} describedBy="login-phone-hint" autoComplete="username" />
                  <FieldHint id="login-phone-hint">Other country? Start with + and the country code.</FieldHint>
                </label>
              )}
            </div>
            <label htmlFor="login-password">Password
              <div className="jl-auth-password">
                <input id="login-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} placeholder="Enter your password" />
                <PasswordToggle shown={showPassword} onToggle={() => setShowPassword(value => !value)} />
              </div>
            </label>
            <div className="jl-auth-options">
              <label className="jl-remember"><input type="checkbox" checked={rememberMe} onChange={event => setRememberMe(event.target.checked)} /> <span>Remember me</span></label>
              <button className="jl-textbtn" type="button" onClick={() => router.push('/forgot-password')}>Forgot password?</button>
            </div>
            <button className="jl-btn jl-auth-submit" type="submit" disabled={busy}>{busy ? 'Authenticating…' : 'Sign in to Jaslyn Net'}</button>
            <p className="jl-auth-security"><span>●</span> Sign-in is verified by the Jaslyn Net API. Never share your password.</p>
            <div className="jl-auth-signup">Don’t have an account? <a href="/register">Create a workspace</a></div>
          </form>
        </div>
      </section>
    </SiteShell>
  );
}
