'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '../../lib/api';
import { getAccessToken, storeAccessToken } from '../../lib/auth';
import SiteShell from '../landing/site-chrome';
import { FieldHint, PasswordToggle, PhoneField, phoneLooksValid } from '../landing/auth-controls';

type RegisterResponse = { accessToken: string; user: { fullName: string; email: string; role: string }; tenant: { name: string } };

type FieldErrors = Partial<Record<'businessName' | 'fullName' | 'email' | 'phone' | 'password' | 'confirmPassword', string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function passwordStrength(password: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!password) return { score: 0, label: '' };
  let score = 0;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password)) score += 1;
  const labels = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'] as const;
  const clamped = Math.min(score, 4) as 0 | 1 | 2 | 3 | 4;
  return { score: clamped, label: password.length < 12 ? 'Too short' : labels[clamped] };
}

export default function RegisterPage() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false); const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  useEffect(() => { if (getAccessToken()) router.replace('/dashboard'); }, [router]);

  const strength = useMemo(() => passwordStrength(password), [password]);

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (businessName.trim().length < 2) errors.businessName = 'Enter your business or network name.';
    if (fullName.trim().length < 2) errors.fullName = 'Enter your full name.';
    if (!EMAIL_PATTERN.test(email.trim())) errors.email = 'Enter a valid email address.';
    if (phone.trim() && !phoneLooksValid(phone)) errors.phone = 'Enter a valid mobile number, for example 0712 345 678.';
    if (password.length < 12) errors.password = 'Password must be at least 12 characters.';
    if (confirmPassword !== password) errors.confirmPassword = 'Passwords do not match.';
    return errors;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setBusy(true); setError('');
    try {
      const result = await apiFetch<RegisterResponse>('/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ businessName: businessName.trim(), fullName: fullName.trim(), email: email.trim(), ...(phone.trim() ? { phone: phone.trim() } : {}), password, acceptTerms, acceptPrivacy }) });
      storeAccessToken(result.accessToken);
      router.replace('/dashboard');
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) setError(/mobile number/i.test(cause.message) ? 'That mobile number is already registered.' : 'An account with this business or email already exists.');
      else setError(cause instanceof Error ? cause.message : 'Unable to create the workspace. Please try again.');
    } finally { setBusy(false); }
  }

  return (
    <SiteShell mainClass="jl-auth-main"><section className="jl-auth" aria-label="Create Jaslyn Net workspace">
        <div className="jl-auth-grid">
          <div className="jl-auth-intro"><h1>Create your workspace.</h1><p>Your first account becomes the workspace owner. Your data is kept separate from every other operator.</p><ul><li>A workspace of your own</li><li>Start with vouchers, add online payments later</li><li>Staff roles and an audit trail</li></ul><p className="jl-auth-alt">Already have an account? <a href="/login">Sign in</a></p></div>
          <form className="jl-auth-card" onSubmit={submit} noValidate>
            <div className="jl-auth-head"><h2>Create workspace</h2><p>Tell us about your business and set the owner login.</p></div>
            {error && <div className="jl-auth-error" role="alert">{error}</div>}
            <label htmlFor="reg-business">Business / network name
              <input id="reg-business" required minLength={2} maxLength={160} value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="Example ISP" aria-invalid={!!fieldErrors.businessName} aria-describedby={fieldErrors.businessName ? 'reg-business-error' : undefined} />
            </label>
            {fieldErrors.businessName && <p className="jl-field-error" id="reg-business-error" role="alert">{fieldErrors.businessName}</p>}

            <label htmlFor="reg-fullname">Your full name
              <input id="reg-fullname" required minLength={2} maxLength={160} value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Network administrator" aria-invalid={!!fieldErrors.fullName} aria-describedby={fieldErrors.fullName ? 'reg-fullname-error' : undefined} />
            </label>
            {fieldErrors.fullName && <p className="jl-field-error" id="reg-fullname-error" role="alert">{fieldErrors.fullName}</p>}

            <label htmlFor="reg-email">Email address
              <input id="reg-email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@example.com" aria-invalid={!!fieldErrors.email} aria-describedby={fieldErrors.email ? 'reg-email-error' : undefined} />
            </label>
            {fieldErrors.email && <p className="jl-field-error" id="reg-email-error" role="alert">{fieldErrors.email}</p>}
            <label htmlFor="reg-phone">Mobile number <span className="jl-optional">(optional)</span>
              <PhoneField id="reg-phone" value={phone} onChange={setPhone} invalid={!!fieldErrors.phone} describedBy={fieldErrors.phone ? 'reg-phone-error' : 'reg-phone-hint'} />
              <FieldHint id="reg-phone-hint">Lets you sign in with your number as well as your email.</FieldHint>
            </label>
            {fieldErrors.phone && <p className="jl-field-error" id="reg-phone-error" role="alert">{fieldErrors.phone}</p>}

            <label htmlFor="reg-password">Password
              <div className="jl-auth-password">
                <input id="reg-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required minLength={12} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 12 characters" aria-invalid={!!fieldErrors.password} aria-describedby="reg-jl-strength" />
                <PasswordToggle shown={showPassword} onToggle={() => setShowPassword(v => !v)} />
              </div>
            </label>
            {password.length > 0 && (
              <div className="jl-strength" id="reg-jl-strength" aria-live="polite">
                <div className="jl-strength-bar"><i className={`jl-strength-${strength.score}`} style={{ width: `${strength.score * 25}%` }} /></div>
                <span>{strength.label}</span>
              </div>
            )}
            {fieldErrors.password && <p className="jl-field-error" role="alert">{fieldErrors.password}</p>}

            <label htmlFor="reg-confirm-password">Confirm password
              <div className="jl-auth-password">
                <input id="reg-confirm-password" type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Re-enter your password" aria-invalid={!!fieldErrors.confirmPassword} aria-describedby={fieldErrors.confirmPassword ? 'reg-confirm-error' : undefined} />
                <PasswordToggle shown={showConfirmPassword} onToggle={() => setShowConfirmPassword(v => !v)} />
              </div>
            </label>
            {fieldErrors.confirmPassword && <p className="jl-field-error" id="reg-confirm-error" role="alert">{fieldErrors.confirmPassword}</p>}

            <label className="jl-consent"><input type="checkbox" required checked={acceptTerms} onChange={e => setAcceptTerms(e.target.checked)} /><span>I agree to the <a href="/legal/terms" target="_blank" rel="noreferrer">Terms of Use</a>.</span></label>
            <label className="jl-consent"><input type="checkbox" required checked={acceptPrivacy} onChange={e => setAcceptPrivacy(e.target.checked)} /><span>I acknowledge the <a href="/legal/privacy" target="_blank" rel="noreferrer">Privacy Notice</a>.</span></label>
            <button className="jl-btn jl-auth-submit" disabled={busy || !acceptTerms || !acceptPrivacy}>{busy ? 'Creating workspace…' : 'Create Jaslyn Net workspace'}</button>
            <p className="jl-auth-security"><span>●</span> Your owner account is isolated to the workspace you create.</p>
          </form>
        </div></section></SiteShell>
  );
}
