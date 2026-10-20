'use client';

import { useEffect, useRef, useState } from 'react';
import type { Copy } from './copy';

type Step = 'pick' | 'method' | 'wait' | 'online';
interface LedgerRow { id: string; text: string; label: string; state: 'pending' | 'done' }

const tzs = (n: number) => `TZS ${n.toLocaleString('en-US')}`;
const WAIT_MS = 2200;
const fmt = (tpl: string, vars: Record<string, string | number>) => tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));

/** Sample-data walkthrough of the customer portal and the operator's view of the same purchase. Nothing is sent anywhere. */
export default function PortalDemo({ t, logos = {} }: { t: Copy['demo']; logos?: Record<string, string | null> }) {
  const [step, setStep] = useState<Step>('pick');
  const [pkgIndex, setPkgIndex] = useState(1);
  const [methodIndex, setMethodIndex] = useState(0);
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const live = useRef<HTMLParagraphElement>(null);

  const pkg = t.packages[pkgIndex];
  const method = t.methods[methodIndex];
  const stepNo = step === 'pick' ? 1 : step === 'method' ? 2 : step === 'wait' ? 3 : 4;

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function startPayment() {
    setRows([{ id: 'p', text: fmt(t.requested, { amount: tzs(pkg.price), via: method }), label: t.pending, state: 'pending' }]);
    setStep('wait');
    timer.current = setTimeout(() => {
      setRows([
        { id: 'p', text: fmt(t.receivedLine, { amount: tzs(pkg.price), via: method }), label: t.received, state: 'done' },
        { id: 'a', text: fmt(t.granted, { pkg: pkg.name }), label: t.done, state: 'done' },
      ]);
      setStep('online');
    }, WAIT_MS);
  }

  function reset() {
    if (timer.current) clearTimeout(timer.current);
    setRows([]); setStep('pick');
  }

  return (
    <figure className="jl-demo" aria-label={t.caption}>
      <div className="jl-demo-stage">
        <div className="jl-phone" role="group" aria-label={`${t.business} — ${t.badge}`}>
          <div className="jl-phone-notch" aria-hidden="true" />
          <header className="jl-phone-head">
            <strong>{t.business}</strong>
            <span>{fmt(t.stepLabel, { n: stepNo, of: 4 })}</span>
          </header>

          {step === 'pick' && (
            <div className="jl-phone-body">
              <h3>{t.pickTitle}</h3>
              <div role="radiogroup" aria-label={t.pickTitle} className="jl-choices">
                {t.packages.map((p, i) => (
                  <button key={p.name} type="button" role="radio" aria-checked={pkgIndex === i} className="jl-choice" onClick={() => setPkgIndex(i)}>
                    <span><b>{p.name}</b><small>{p.time}</small></span>
                    <em>{tzs(p.price)}</em>
                  </button>
                ))}
              </div>
              <button type="button" className="jl-phone-cta" onClick={() => setStep('method')}>{t.continue}</button>
            </div>
          )}

          {step === 'method' && (
            <div className="jl-phone-body">
              <h3>{t.methodTitle}</h3>
              <div role="radiogroup" aria-label={t.methodTitle} className="jl-choices jl-choices-tight">
                {t.methods.map((m, i) => (
                  <button key={m} type="button" role="radio" aria-checked={methodIndex === i} className="jl-choice" onClick={() => setMethodIndex(i)}>
                    <span>{logos[m] ? <><img className="jl-choice-logo" src={logos[m] as string} alt="" /><b className="jl-sr">{m}</b></> : <b>{m}</b>}</span>
                  </button>
                ))}
              </div>
              <label className="jl-field">
                <span>{t.phoneLabel}</span>
                <input readOnly value="07XX XXX XXX" aria-describedby="jl-phone-hint" />
                <small id="jl-phone-hint">{t.phoneHint}</small>
              </label>
              <button type="button" className="jl-phone-cta jl-pay" onClick={startPayment}>{fmt(t.pay, { amount: tzs(pkg.price) })}</button>
              <button type="button" className="jl-phone-link" onClick={() => setStep('pick')}>{t.back}</button>
            </div>
          )}

          {step === 'wait' && (
            <div className="jl-phone-body jl-center">
              <div className="jl-pulse" aria-hidden="true"><i /></div>
              <h3>{t.waitTitle}</h3>
              <p>{t.waitBody}</p>
              <div className="jl-bar" aria-hidden="true"><i /></div>
            </div>
          )}

          {step === 'online' && (
            <div className="jl-phone-body jl-center">
              <div className="jl-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
              <h3>{t.onlineTitle}</h3>
              <p>{fmt(t.onlineBody, { pkg: pkg.name })}</p>
              <button type="button" className="jl-phone-link" onClick={reset}>{t.again}</button>
            </div>
          )}
          <p ref={live} className="jl-sr" aria-live="polite">{step === 'wait' ? t.waitTitle : step === 'online' ? t.onlineTitle : ''}</p>
        </div>

        <aside className="jl-ledger" aria-label={t.operator}>
          <header><strong>{t.operator}</strong><span>{t.operatorHint}</span></header>
          {rows.length === 0 ? <p className="jl-ledger-empty">{t.empty}</p> : (
            <ol>
              {rows.map((r) => (
                <li key={r.id} data-state={r.state}>
                  <span className="jl-ledger-dot" aria-hidden="true" />
                  <span>{r.text}</span>
                  <em>{r.label}</em>
                </li>
              ))}
            </ol>
          )}
          {step === 'online' && <p className="jl-ledger-total"><span>{t.session}</span><b>{tzs(pkg.price)}</b></p>}
        </aside>
      </div>
      <figcaption><span className="jl-badge">{t.badge}</span>{t.caption}</figcaption>
    </figure>
  );
}
