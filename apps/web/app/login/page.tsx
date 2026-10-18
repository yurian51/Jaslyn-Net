'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '../../lib/api';
import { getAccessToken, storeAccessToken } from '../../lib/auth';
import SiteShell from '../landing/site-chrome';

type LoginResponse = { accessToken: string; expiresIn: number; user: { fullName: string; email: string; role: string }; tenant: { name: string; timezone: string; currency: string } };
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [recoveryHelp, setRecoveryHelp] = useState(false);

  useEffect(() => { if (getAccessToken()) router.replace('/dashboard'); }, [router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setFieldError('');
    setRecoveryHelp(false);
    if (!EMAIL_PATTERN.test(email.trim())) {
      setFieldError('Enter a valid email address.');
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
        body: JSON.stringify({ email: email.trim(), password }),
      });
      storeAccessToken(result.accessToken, rememberMe);
      router.replace('/dashboard');
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) setError('The email or password is incorrect.');
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
            {recoveryHelp && <div className="jl-auth-recovery" role="status">Self-service password recovery is not enabled yet. Please contact your workspace administrator to reset your password securely.</div>}
            <label htmlFor="login-email">Email address
              <input id="login-email" type="email" autoComplete="username" inputMode="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="operator@company.com" aria-invalid={Boolean(fieldError && !EMAIL_PATTERN.test(email.trim()))} />
            </label>
            <label htmlFor="login-password">Password
              <div className="jl-auth-password">
                <input id="login-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} placeholder="Enter your password" />
                <button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>{showPassword ? 'Hide' : 'Show'}</button>
              </div>
            </label>
            <div className="jl-auth-options">
              <label className="jl-remember"><input type="checkbox" checked={rememberMe} onChange={event => setRememberMe(event.target.checked)} /> <span>Remember me</span></label>
              <button className="jl-textbtn" type="button" onClick={() => { setRecoveryHelp(true); setError(''); setFieldError(''); }}>Forgot password?</button>
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
