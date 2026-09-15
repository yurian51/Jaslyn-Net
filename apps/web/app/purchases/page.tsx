'use client';

import { useEffect, useState } from 'react';
import { getAccessToken } from '../../lib/auth';
import { apiFetch } from '../../lib/api';

type Purchase = { id: string; customerId: string; customerName: string; packageId: string; packageName: string; routerId?: string | null; price: string | number; currency: string; status: string; startsAt?: string | null; endsAt?: string | null; createdAt: string };
type PaymentProvider = { code: string; name: string; subtitle: string; logoUrl?: string; fallback: string; tone: string; category: string; countries: string[]; currencies: string[]; directIntegration: boolean; webhookSupported: boolean; reconciliationSupported: boolean; configured: boolean; enabled: boolean };

const FALLBACK_PAYMENT_PROVIDERS: PaymentProvider[] = [
  { code: 'manual', name: 'Manual', subtitle: 'JASLYN NET operations', fallback: 'J', tone: 'jaslyn', category: 'MANUAL', countries: ['TZ'], currencies: ['TZS'], directIntegration: true, webhookSupported: false, reconciliationSupported: true, configured: true, enabled: true },
];

function date(value?: string | null) { if (!value) return '—'; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? '—' : new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed); }
function ProviderLogo({ provider }: { provider: PaymentProvider }) { return <span className={`provider-logo ${provider.tone}`} aria-hidden="true">{provider.logoUrl ? <img src={provider.logoUrl} alt="" loading="lazy" /> : <b>{provider.fallback}</b>}</span>; }

export default function PurchasesPage() {
  const [rows, setRows] = useState<Purchase[]>([]);
  const [providers, setProviders] = useState<PaymentProvider[]>(FALLBACK_PAYMENT_PROVIDERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('');
  const [provider, setProvider] = useState('manual');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    const token = getAccessToken();
    if (!token) { setLoading(false); setError('Sign in to manage purchase operations.'); return; }
    setLoading(true); setError('');
    try {
      const [purchases, methods] = await Promise.all([
        apiFetch<{ data?: Purchase[] }>('/purchases', { headers: { Authorization: `Bearer ${token}` } }),
        apiFetch<{ data?: PaymentProvider[] }>('/payments/methods', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      setRows(purchases.data ?? []);
      const available = methods.data ?? FALLBACK_PAYMENT_PROVIDERS;
      setProviders(available);
      if (!available.some(item => item.code === provider && item.enabled)) setProvider('manual');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load purchase operations.');
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function confirm(status: 'SUCCESS' | 'FAILED') {
    if (!selected || !reference.trim()) return setError('Select a purchase and provide a provider reference.');
    const selectedMethod = providers.find(item => item.code === provider);
    if (!selectedMethod?.enabled) return setError('The selected payment method is not configured for this organization.');
    const token = getAccessToken();
    if (!token) return setError('Sign in before confirming a payment.');
    setSaving(true); setError('');
    try {
      await apiFetch(`/purchases/${selected}/confirm-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ provider, providerReference: reference.trim(), status, idempotencyKey: `ops:${selected}:${reference.trim()}` }),
      });
      setSelected(''); setReference(''); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to confirm payment.'); }
    finally { setSaving(false); }
  }

  const selectedProvider = providers.find(item => item.code === provider) ?? providers[0] ?? FALLBACK_PAYMENT_PROVIDERS[0];
  return <main className="purchase-page"><header><div className="eyebrow">JASLYN NET / COMMERCIAL OPERATIONS</div><h1>Purchases & Access</h1><p>Track plan purchases, payment confirmation and customer access lifecycle.</p></header><section className="workspace"><article className="panel"><div className="panel-head"><div><div className="panel-kicker">PURCHASE LEDGER</div><h2>{rows.length.toLocaleString()} recent purchases</h2></div><button onClick={() => void load()} className="refresh" disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button></div>{error && <div className="notice" role="alert">{error}</div>}{loading ? <div className="empty">Loading purchase ledger…</div> : rows.length === 0 ? <div className="empty">No purchases exist in this organization.</div> : <div className="table-wrap"><table><thead><tr><th>Customer</th><th>Plan</th><th>Amount</th><th>Status</th><th>Starts</th><th>Ends</th><th>Created</th></tr></thead><tbody>{rows.map(row => <tr key={row.id} onClick={() => setSelected(row.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(row.id); } }} tabIndex={0} aria-selected={selected === row.id} className={selected === row.id ? 'selected' : ''}><td><strong>{row.customerName}</strong><small>{row.customerId.slice(0, 8)}…</small></td><td>{row.packageName}</td><td>{row.currency} {Number(row.price).toLocaleString()}</td><td><span className={`status ${row.status.toLowerCase()}`}>{row.status.replaceAll('_', ' ')}</span></td><td>{date(row.startsAt)}</td><td>{date(row.endsAt)}</td><td>{date(row.createdAt)}</td></tr>)}</tbody></table></div>}</article><aside className="panel action"><div className="panel-kicker">PAYMENT CONTROL</div><h2>Confirm payment</h2><p>Only payment methods configured for this organization can be selected. A catalog entry is not an integration.</p><fieldset className="provider-fieldset"><legend>Payment method</legend><div className="provider-grid" role="radiogroup" aria-label="Payment method">{providers.map(item => <button key={item.code} type="button" role="radio" aria-checked={provider === item.code} className={`provider-option ${provider === item.code ? 'active' : ''} ${!item.enabled ? 'unavailable' : ''}`} onClick={() => item.enabled && setProvider(item.code)} disabled={saving || !item.enabled}><ProviderLogo provider={item} /><span className="provider-copy"><strong>{item.name}</strong><small>{item.enabled ? item.subtitle : 'Not configured for this organization'}</small></span>{item.enabled && provider === item.code && <span className="provider-check" aria-hidden="true">✓</span>}</button>)}</div></fieldset><div className="selected-provider"><ProviderLogo provider={selectedProvider} /><div><span>Selected payment method</span><strong>{selectedProvider.name}</strong></div></div><label>Provider reference<input required minLength={2} maxLength={160} value={reference} onChange={e => setReference(e.target.value)} placeholder="Transaction reference"/></label><div className="selected">{selected ? <>Selected: <strong>{selected.slice(0, 12)}…</strong></> : 'Select a purchase from the ledger.'}</div><div className="actions"><button disabled={saving} onClick={() => void confirm('FAILED')} className="secondary">Mark failed</button><button disabled={saving} onClick={() => void confirm('SUCCESS')} className="primary">{saving ? 'Processing…' : 'Confirm paid'}</button></div></aside></section><style jsx>{`.purchase-page{min-height:100vh;background:#f6f8fb;color:#172033;padding:36px 42px}.purchase-page header{max-width:1500px;margin-bottom:22px}.eyebrow,.panel-kicker{font-size:8px;font-weight:800;letter-spacing:.13em;color:#8a96a8}.purchase-page h1{font-size:28px;letter-spacing:-.04em;margin:6px 0 4px}.purchase-page header p{font-size:11px;color:#7d899a;margin:0}.workspace{display:grid;grid-template-columns:minmax(0,1fr) 370px;gap:12px;max-width:1500px}.panel{background:#fff;border:1px solid #e2e7ee;border-radius:10px;padding:18px}.panel-head{display:flex;justify-content:space-between;align-items:center}.panel h2{font-size:14px;margin:6px 0 0}.refresh{border:1px solid #dfe4eb;background:#fff;border-radius:6px;padding:7px 11px;font-size:8px}.notice{margin-top:12px;padding:9px;border-radius:6px;background:#fff5f5;color:#b64b57;font-size:9px}.empty{text-align:center;padding:60px;color:#8a95a4;font-size:10px}.table-wrap{overflow:auto;margin-top:15px}table{width:100%;border-collapse:collapse;min-width:760px}th{font-size:7px;letter-spacing:.08em;text-transform:uppercase;color:#96a0ae;text-align:left;padding:9px;border-bottom:1px solid #edf0f4}td{font-size:9px;padding:11px 9px;border-bottom:1px solid #f0f2f5;color:#536074}td strong{display:block;color:#263247}td small{display:block;color:#a0a8b4;font-size:7px;margin-top:3px}tbody tr{cursor:pointer}tbody tr:hover,tbody tr.selected{background:#f7f9ff}tbody tr:focus-visible{outline:2px solid #4f70dc;outline-offset:-2px}.status{display:inline-block;padding:4px 6px;border-radius:4px;font-size:7px;font-weight:800;background:#eef2f6}.status.paid,.status.active{background:#eaf7f0;color:#2f8c62}.status.pending_payment{background:#fff7e8;color:#a56a12}.status.canceled,.status.failed{background:#fff0f1;color:#b64b57}.action h2{font-size:16px}.action p{font-size:9px;line-height:1.6;color:#8792a1}.provider-fieldset{border:0;padding:0;margin:15px 0 0;min-width:0}.provider-fieldset legend{font-size:8px;font-weight:750;color:#69768a;margin-bottom:7px}.provider-grid{display:grid;gap:7px}.provider-option{position:relative;width:100%;display:flex;align-items:center;gap:10px;text-align:left;border:1px solid #dfe4eb;background:#fff;border-radius:8px;padding:9px;cursor:pointer;transition:border-color .15s,box-shadow .15s,background .15s}.provider-option:hover:not(:disabled){background:#fbfcfe;border-color:#c9d2df}.provider-option.active{border-color:#4f70dc;background:#f7f9ff;box-shadow:0 0 0 2px rgba(79,112,220,.08)}.provider-option.unavailable{opacity:.48;cursor:not-allowed;background:#f7f8fa}.provider-option:disabled{opacity:.62}.provider-copy{display:flex;flex-direction:column;gap:2px;min-width:0}.provider-copy strong{font-size:9px;color:#263247}.provider-copy small{font-size:7px;color:#8a95a4}.provider-check{margin-left:auto;width:18px;height:18px;border-radius:50%;display:grid;place-items:center;background:#4f70dc;color:#fff;font-size:10px;font-weight:900}.provider-logo{width:34px;height:34px;flex:0 0 34px;border-radius:8px;display:grid;place-items:center;overflow:hidden;border:1px solid #e2e7ee;background:#fff}.provider-logo img{display:block;width:23px;height:23px;object-fit:contain}.provider-logo b{font-size:10px;letter-spacing:-.04em}.provider-logo.jaslyn{background:#081828;border-color:#234e76;color:#6cbcff}.provider-logo.mpesa{background:#fff5f5;border-color:#f0cfd2;color:#c31f2f}.provider-logo.airtel_money{background:#fff0f1;border-color:#f0cbd0}.provider-logo.tigopesa{background:#f4f8ff;border-color:#d5e3f5;color:#1476d4}.provider-logo.halopesa{background:#fff9ed;border-color:#f1dfb6;color:#e09a13}.provider-logo.azampesa{background:#fff5f0;border-color:#f0d3c4;color:#d35a21}.provider-logo.card{background:#f5f7fa;color:#1d4ed8}.provider-logo.paypal{background:#eef7ff}.provider-logo.apple_pay{background:#111;color:#fff}.provider-logo.google_pay{background:#fff}.provider-logo.binance_pay{background:#fff9e6;border-color:#f0dfad}.provider-logo.bank{background:#f2f4f7;color:#566274}.selected-provider{display:flex;align-items:center;gap:9px;margin-top:12px;padding:9px;border-radius:8px;background:#f7f9fc;border:1px solid #edf0f4}.selected-provider div{display:flex;flex-direction:column;gap:2px}.selected-provider span{font-size:7px;color:#8a95a4}.selected-provider strong{font-size:9px;color:#263247}.action label{display:block;font-size:8px;font-weight:750;color:#69768a;margin-top:14px}.action input{display:block;width:100%;height:36px;margin-top:5px;border:1px solid #dfe4eb;border-radius:6px;padding:0 9px;background:#fff;font-size:9px;outline:0}.selected{margin-top:15px;padding:10px;background:#f7f9fc;border-radius:6px;color:#7e8998;font-size:8px}.actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.primary,.secondary{height:36px;border-radius:6px;font-size:8px;font-weight:750}.primary{border:0;background:#4f70dc;color:#fff}.secondary{border:1px solid #dfe4eb;background:#fff;color:#6d7889}.actions button:disabled{opacity:.5}@media(max-width:1000px){.workspace{grid-template-columns:1fr}}@media(max-width:700px){.purchase-page{padding:20px 13px}.provider-grid{grid-template-columns:1fr 1fr}.provider-option{padding:8px}.provider-logo{width:30px;height:30px;flex-basis:30px}.provider-logo img{width:20px;height:20px}}`}</style></main>;
}
