'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api';
import SiteShell from '../landing/site-chrome';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token') ?? '');
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSuccess(false);
    if (!token) {
      setError('This reset link is missing its token. Request a new password reset link.');
      return;
    }
    if (password.length < 12) {
      setError('Your new password must contain at least 12 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await apiFetch('/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      setSuccess(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to reset your password. Request a new link and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SiteShell mainClass="jl-auth-main">
      <section className="jl-auth" aria-label="Choose a new Jaslyn Net password">
        <div className="jl-auth-grid">
          <div className="jl-auth-intro">
            <h1>A fresh start.</h1>
            <p>Choose a strong password to secure your Jaslyn Net account.</p>
            <ul><li>At least 12 characters</li><li>Reset links expire after 30 minutes</li><li>All current sessions will be signed out</li></ul>
          </div>
          <form className="jl-auth-card" onSubmit={submit} noValidate>
            <div className="jl-auth-head"><h2>Set a new password</h2><p>Use a password you haven’t used elsewhere.</p></div>
            {error && <div className="jl-auth-error" role="alert">{error}</div>}
            {success && <div className="jl-auth-recovery" role="status">Password updated successfully. You can now sign in with your new password.</div>}
            <label htmlFor="new-password">New password
              <input id="new-password" type="password" autoComplete="new-password" required minLength={12} value={password} onChange={event => setPassword(event.target.value)} placeholder="At least 12 characters" />
            </label>
            <label htmlFor="confirm-password">Confirm new password
              <input id="confirm-password" type="password" autoComplete="new-password" required minLength={12} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} placeholder="Enter it again" />
            </label>
            {success
              ? <button className="jl-btn jl-auth-submit" type="button" onClick={() => router.push('/login')}>Go to sign in</button>
              : <button className="jl-btn jl-auth-submit" type="submit" disabled={busy}>{busy ? 'Updating password…' : 'Update password'}</button>}
          </form>
        </div>
      </section>
    </SiteShell>
  );
}
