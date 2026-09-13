'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://nexora-api-boiv.onrender.com/api/v1';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !isLoginResponse(payload)) {
        const message = isErrorPayload(payload) ? payload.message : 'Unable to sign in with those credentials.';
        throw new Error(message);
      }
      window.localStorage.setItem('nexora.accessToken', payload.accessToken);
      window.localStorage.setItem('jaslyn.accessToken', payload.accessToken);
      window.localStorage.setItem('jaslyn.user', JSON.stringify(payload.user));
      window.localStorage.setItem('jaslyn.tenant', JSON.stringify(payload.tenant));
      router.replace('/dashboard');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign in. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="brand"><span>J</span><div><strong>JASLYN NET</strong><small>Network operations platform</small></div></div>
        <div className="eyebrow">SECURE ACCESS</div>
        <h1 id="login-title">Welcome back.</h1>
        <p className="intro">Sign in to manage customers, billing, sessions and network operations.</p>
        <form onSubmit={submit} noValidate>
          <label>Email address<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" /></label>
          <label>Password<input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your password" /></label>
          {error && <div className="error" role="alert">{error}</div>}
          <button disabled={pending || !email.trim() || !password} type="submit">{pending ? 'Signing in…' : 'Sign in'} <span>→</span></button>
        </form>
        <p className="security-note">Authentication is verified server-side. Access tokens expire after 15 minutes.</p>
      </section>
      <style jsx>{`
        .login-page{min-height:100vh;display:grid;place-items:center;padding:24px;background:#07101f;color:#eef4ff;font-family:Arial,Helvetica,sans-serif}
        .login-card{width:min(430px,100%);padding:42px;border:1px solid rgba(255,255,255,.1);border-radius:18px;background:rgba(11,23,40,.94);box-shadow:0 30px 90px rgba(0,0,0,.4)}
        .brand{display:flex;align-items:center;gap:12px;margin-bottom:56px}.brand>span{width:36px;height:36px;display:grid;place-items:center;border:1px solid #46a8ff;border-radius:9px;color:#71bcff;font-weight:800}.brand strong{display:block;font-size:12px;letter-spacing:.16em}.brand small{display:block;color:#657a92;font-size:8px;margin-top:4px}.eyebrow{font-size:9px;letter-spacing:.2em;color:#5caeff;font-weight:800}.login-card h1{font-size:42px;letter-spacing:-.05em;margin:12px 0 8px}.intro{color:#8496ad;font-size:12px;line-height:1.7;margin:0 0 30px}form{display:grid;gap:18px}label{display:grid;gap:8px;color:#b7c7da;font-size:10px;font-weight:700}input{width:100%;box-sizing:border-box;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:#091525;color:#fff;padding:13px 14px;outline:none;font:inherit;font-weight:400}input:focus{border-color:#4daaff;box-shadow:0 0 0 3px rgba(77,170,255,.12)}button{border:0;border-radius:8px;background:#f4f8ff;color:#07101f;padding:14px 16px;font-weight:800;font-size:10px;cursor:pointer}button:disabled{opacity:.55;cursor:not-allowed}button span{margin-left:8px}.error{border:1px solid rgba(255,90,90,.3);background:rgba(255,70,70,.08);color:#ffb0b0;border-radius:8px;padding:11px;font-size:10px;line-height:1.5}.security-note{color:#536980;font-size:8px;line-height:1.6;margin:22px 0 0;text-align:center}@media(max-width:520px){.login-card{padding:30px}.brand{margin-bottom:42px}}
      `}</style>
    </main>
  );
}

interface LoginResponse {
  accessToken: string;
  user: Record<string, unknown>;
  tenant: Record<string, unknown>;
}

function isLoginResponse(value: unknown): value is LoginResponse {
  return typeof value === 'object' && value !== null
    && typeof (value as Record<string, unknown>).accessToken === 'string'
    && typeof (value as Record<string, unknown>).user === 'object'
    && (value as Record<string, unknown>).user !== null
    && typeof (value as Record<string, unknown>).tenant === 'object'
    && (value as Record<string, unknown>).tenant !== null;
}

function isErrorPayload(value: unknown): value is { message: string } {
  return typeof value === 'object' && value !== null && typeof (value as Record<string, unknown>).message === 'string';
}
