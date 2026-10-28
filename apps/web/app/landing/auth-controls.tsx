import type { ReactNode } from 'react';

const svgProps = { viewBox: '0 0 24 24', width: 20, height: 20, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false } as const;

export function EyeIcon() {
  return <svg {...svgProps}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.8" /></svg>;
}

export function EyeOffIcon() {
  return <svg {...svgProps}><path d="M9.9 5.7A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.6 3.4M6.3 7.3A16 16 0 0 0 2.5 12S6 18.5 12 18.5c1.5 0 2.8-.4 4-.9" /><path d="M9.9 9.9a2.8 2.8 0 0 0 4 4" /><path d="M3 3l18 18" /></svg>;
}

/** Icon-only show/hide control. The icon shows the action you will get, and the state is exposed to assistive tech. */
export function PasswordToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  const label = shown ? 'Hide password' : 'Show password';
  return (
    <button type="button" className="jl-eye" onClick={onToggle} aria-label={label} aria-pressed={shown} title={label}>
      {shown ? <EyeOffIcon /> : <EyeIcon />}
    </button>
  );
}

/** Mobile number field with a country-code hint. The server normalises and validates; this only guards obvious typos. */
export function PhoneField({ id, value, onChange, invalid, describedBy, placeholder = '712 345 678', autoComplete = 'tel-national' }: {
  id: string; value: string; onChange: (value: string) => void; invalid?: boolean; describedBy?: string; placeholder?: string; autoComplete?: string;
}) {
  const international = value.trim().startsWith('+');
  return (
    <div className="jl-tel">
      {!international && <span className="jl-tel-prefix" aria-hidden="true">+255</span>}
      <input id={id} type="tel" inputMode="tel" autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} placeholder={international ? '+254 712 345 678' : placeholder} aria-invalid={invalid} aria-describedby={describedBy} />
    </div>
  );
}

export function phoneLooksValid(value: string): boolean {
  const trimmed = value.trim();
  if (!/^\+?[\d\s().-]+$/.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, '');
  return digits.length >= 9 && digits.length <= 15;
}

export function FieldHint({ id, children }: { id: string; children: ReactNode }) {
  return <p className="jl-hint" id={id}>{children}</p>;
}
