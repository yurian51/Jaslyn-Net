'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '../../lib/api';
import SiteShell from '../landing/site-chrome';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSent(false);
    setBusy(true);
    try {
      await apiFetch('/auth/password-reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      setSent(true);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 503) {
        setError('Password recovery email is not configured yet. Please contact the Jaslyn Net administrator.');
      } else {
        setError(cause instanceof Error ? cause.message : 'Unable to request a reset link. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <SiteShell mainClass="jl-auth-main">
      <section className="jl-auth" aria-label="Recover Jaslyn Net password">
        <div className="jl-auth-grid">
          <div className="jl-auth-intro">
            <h1>Get back in.</h1>
            <p>We’ll email you a secure, one-time link to choose a new password.</p>
            <ul><li>Reset links expire after 30 minutes</li><li>Links can only be used once</li><li>Existing sessions are revoked after reset</li></ul>
          </div>
          <form className="jl-auth-card" onSubmit={submit} noValidate>
            <div className="jl-auth-head"><h2>Forgot password?</h2><p>Enter the email address on your Jaslyn Net account.</p></div>
            {error && <div className="jl-auth-error" role="alert">{error}</div>}
            {sent && <div className="jl-auth-recovery" role="status">If an active account exists for that email, a password reset link will arrive shortly. Check your inbox and spam folder.</div>}
            <label htmlFor="recovery-email">Email address
              <input id="recovery-email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="operator@company.com" />
            </label>
            <button className="jl-btn jl-auth-submit" type="submit" disabled={busy}>{busy ? 'Sending link…' : 'Send reset link'}</button>
            <div className="jl-auth-signup"><button className="jl-textbtn" type="button" onClick={() => router.push('/login')}>Back to sign in</button></div>
          </form>
        </div>
      </section>
    </SiteShell>
  );
}
