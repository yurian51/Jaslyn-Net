'use client';

import { useEffect, useState } from 'react';
import { getAccessToken } from '../../lib/auth';
import { apiFetch } from '../../lib/api';

type Purchase = { id: string; customerId: string; customerName: string; packageId: string; packageName: string; routerId?: string | null; price: string | number; currency: string; status: string; provider?: string | null; accessStatus?: string | null; startsAt?: string | null; endsAt?: string | null; createdAt: string };
type PaymentProvider = { code: string; name: string; subtitle: string; logoUrl?: string; fallback: string; tone: string; category: string; countries: string[]; currencies: string[]; directIntegration: boolean; webhookSupported: boolean; reconciliationSupported: boolean; configured: boolean; enabled: boolean };

const FALLBACK_PAYMENT_PROVIDERS: PaymentProvider[] = [
  { code: 'manual', name: 'Manual', subtitle: 'JASLYN NET operations', fallback: '', tone: 'jaslyn', category: 'MANUAL', countries: ['TZ'], currencies: ['TZS'], directIntegration: true, webhookSupported: false, reconciliationSupported: true, configured: true, enabled: true },
];

function date(value?: string | null) { if (!value) return '—'; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? '—' : new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed); }
function ProviderLogo({ provider }: { provider: PaymentProvider }) { return <span className={`provider-logo ${provider.tone}`} aria-hidden="true">{provider.logoUrl ? <img src={provider.logoUrl} alt="" loading="lazy" /> : provider.code === 'manual' ? <img src="/brand/jaslyn-net-icon.svg" alt="" /> : <b>{provider.fallback}</b>}</span>; }

export default function PurchasesPage() {
  const [rows, setRows] = useState<Purchase[]>([]);
  const [providers, setProviders] = useState<PaymentProvider[]>(FALLBACK_PAYMENT_PROVIDERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('');
  const [provider, setProvider] = useState('manual');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [showProviderSubtitles, setShowProviderSubtitles] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [detailId, setDetailId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('ALL');

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
      const available = (methods.data ?? FALLBACK_PAYMENT_PROVIDERS).filter(item => item.enabled);
      const operational = available.length ? available : FALLBACK_PAYMENT_PROVIDERS;
      setProviders(operational);
      if (!available.some(item => item.code === provider && item.enabled)) setProvider('manual');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load purchase operations.');
    } finally { setLoading(false); }
  }

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('jaslyn-net.preferences');
      if (raw) setShowProviderSubtitles((JSON.parse(raw) as { paymentSubtitles?: boolean }).paymentSubtitles !== false);
    } catch { /* keep the safe default */ }
  }, []);

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
  const filteredRows = rows.filter(row => {
    const needle = query.trim().toLowerCase();
    const matchesQuery = !needle || [row.customerName, row.customerId, row.packageName, row.id, row.currency].some(value => String(value).toLowerCase().includes(needle));
    const matchesStatus = statusFilter === 'ALL' || row.status.toUpperCase() === statusFilter;
    const matchesPayment = paymentMethod === 'ALL' || String(row.provider ?? '').toLowerCase() === paymentMethod.toLowerCase();
    return matchesQuery && matchesStatus && matchesPayment;
  });
  const paidCount = rows.filter(row => ['PAID', 'SUCCESS', 'ACTIVE'].includes(row.status.toUpperCase())).length;
  const pendingCount = rows.filter(row => row.status.toUpperCase().includes('PENDING')).length;
  const failedCount = rows.filter(row => ['FAILED', 'CANCELED', 'CANCELLED'].includes(row.status.toUpperCase())).length;
  const activeCount = rows.filter(row => row.status.toUpperCase() === 'ACTIVE').length;
  const paidRows = rows.filter(row => ['PAID', 'SUCCESS', 'ACTIVE'].includes(row.status.toUpperCase()));
  const paidCurrencies = Array.from(new Set(paidRows.map(row => row.currency))).filter(Boolean);
  const totalValue = paidRows.reduce((sum, row) => sum + Number(row.price || 0), 0);
  const detail = rows.find(row => row.id === detailId);
  return <main className="purchase-page"><header><div className="eyebrow">JASLYN NET / COMMERCIAL OPERATIONS</div><h1>Purchases & Access</h1><p>Track plan purchases, payment confirmation and customer access lifecycle.</p></header><section className="purchase-summary">
  <div className="purchase-summary-icon">▱</div>
  <div><strong>Purchase & access control</strong><span>Review purchases, confirm settlement and keep customer access synchronized.</span></div>
  <a href="#payment-control">Payment control <span>›</span></a>
</section>
<section className="workspace">
  <article className="panel ledger-panel">
    <div className="panel-head">
      <div><div className="panel-kicker">PURCHASE LEDGER</div><h2>{rows.length.toLocaleString()} purchases</h2></div>
      <button onClick={() => void load()} className="refresh" disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
    </div>
    {error && <div className="notice" role="alert">{error}</div>}
    <div className="purchase-metrics">
      <div><span>Paid</span><strong>{paidCount}</strong></div>
      <div><span>Pending</span><strong>{pendingCount}</strong></div>
      <div><span>Failed</span><strong>{failedCount}</strong></div>
      <div><span>Active access</span><strong>{activeCount}</strong></div>
      <div><span>Paid value</span><strong>{paidCurrencies.length === 1 ? `${paidCurrencies[0]} ${totalValue.toLocaleString()}` : paidCurrencies.length > 1 ? `${paidCurrencies.length} currencies` : '—'}</strong></div>
    </div>
    <div className="ledger-toolbar">
      <label className="purchase-search"><span aria-hidden="true">⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search customer, phone, package or transaction…" aria-label="Search purchases" /></label>
      <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Filter purchase status">
        <option value="ALL">All statuses</option><option value="PENDING_PAYMENT">Pending</option><option value="PAID">Paid</option><option value="ACTIVE">Active</option><option value="FAILED">Failed</option><option value="CANCELED">Canceled</option>
      </select>
      <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} aria-label="Filter payment method">
        <option value="ALL">All payment methods</option>
        {providers.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}
      </select>
      <button type="button" className="filter-reset" onClick={() => { setQuery(''); setStatusFilter('ALL'); setPaymentMethod('ALL'); }}>Clear</button>
    </div>
    {loading ? <div className="empty">Loading purchase ledger…</div> : rows.length === 0 ? (
      <div className="empty-state-enhanced"><span className="empty-icon">▱</span><strong>No purchases yet</strong><p>Completed and pending customer purchases will appear here.</p><a href="/packages">Browse packages →</a></div>
    ) : filteredRows.length === 0 ? (
      <div className="empty-state-enhanced"><span className="empty-icon">⌕</span><strong>No matching purchases</strong><p>Try another search or clear the active filters.</p><button type="button" onClick={() => { setQuery(''); setStatusFilter('ALL'); setPaymentMethod('ALL'); }}>Clear filters</button></div>
    ) : <>
      <div className="table-wrap"><table><thead><tr><th>Customer</th><th>Plan</th><th>Amount</th><th>Status</th><th>Access</th><th>Created</th><th></th></tr></thead>
        <tbody>{filteredRows.map(row => {
          const access = row.status.toUpperCase() === 'ACTIVE' ? 'ACTIVE' : row.endsAt && new Date(row.endsAt).getTime() > Date.now() ? 'GRANTED' : '—';
          return <tr key={row.id} onClick={() => setDetailId(row.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setDetailId(row.id); } }} tabIndex={0} aria-selected={detailId === row.id} className={detailId === row.id ? 'selected' : ''}>
            <td><strong>{row.customerName}</strong><small>{row.customerId.slice(0, 10)}…</small></td>
            <td>{row.packageName}<small>{row.provider ? row.provider.replaceAll('_', ' ') : 'Payment provider not recorded'}</small></td><td><strong>{row.currency} {Number(row.price).toLocaleString()}</strong></td>
            <td><span className={`status ${row.status.toLowerCase()}`}>{row.status.replaceAll('_', ' ')}</span></td>
            <td><span className={`access-state ${String(row.accessStatus ?? access).toLowerCase()}`}><i />{row.accessStatus ?? access}</span></td><td>{date(row.createdAt)}</td>
            <td><button type="button" className="row-view" onClick={e => { e.stopPropagation(); setDetailId(row.id); }}>View</button></td>
          </tr>;
        })}</tbody>
      </table></div>
      <div className="mobile-purchase-list">{filteredRows.map(row => <button key={row.id} type="button" className="mobile-purchase-item" onClick={() => setDetailId(row.id)}>
        <span className="mobile-purchase-icon">▱</span><span><strong>{row.packageName}</strong><small>{row.customerName} · {row.currency} {Number(row.price).toLocaleString()}</small></span><b className={`status ${row.status.toLowerCase()}`}>{row.status.replaceAll('_', ' ')}</b>
      </button>)}</div>
    </>}
  </article>
  <aside className="panel action" id="payment-control">
    <div className="panel-kicker">PAYMENT CONTROL</div>
    <div className="action-title-row"><div><h2>Confirm payment</h2><p>Select an operational provider, enter its reference and settle the purchase.</p></div><span className="secure-badge">⌑ Secure</span></div>
    <p className="provider-note">Only payment methods configured for this organization are shown. A provider catalog is never treated as a live integration.</p>
    <fieldset className="provider-fieldset"><legend>Payment method</legend><div className="provider-grid" role="radiogroup" aria-label="Payment method">
      {providers.map(item => <button key={item.code} type="button" role="radio" aria-checked={provider === item.code} className={`provider-option ${provider === item.code ? 'active' : ''}`} onClick={() => setProvider(item.code)} disabled={saving}>
        <ProviderLogo provider={item}/><span className="provider-copy"><strong>{item.name}</strong><small>{showProviderSubtitles ? item.subtitle : 'Configured'}</small></span>{provider === item.code && <span className="provider-check" aria-hidden="true">✓</span>}
      </button>)}
    </div></fieldset>
    <div className="selected-provider"><ProviderLogo provider={selectedProvider}/><div><span>Selected payment method</span><strong>{selectedProvider.name}</strong></div></div>
    <label>Provider reference<input required minLength={2} maxLength={160} value={reference} onChange={e => setReference(e.target.value)} placeholder="Transaction reference"/></label>
    <div className="selected">{selected ? <>Selected purchase: <strong>{selected.slice(0, 12)}…</strong></> : 'Select a purchase from the ledger.'}</div>
    <div className="actions"><button disabled={saving || !selected} onClick={() => void confirm('FAILED')} className="secondary">Mark failed</button><button disabled={saving || !selected} onClick={() => void confirm('SUCCESS')} className="primary">{saving ? 'Processing…' : 'Confirm paid'}</button></div>
  </aside>
</section><section className="quick-actions-panel">
  <div className="quick-actions-head"><div><div className="panel-kicker">QUICK ACTIONS</div><h2>Common operations</h2><p>Move from purchase to the network state without hunting through menus.</p></div><a href="/packages">See all <span>›</span></a></div>
  <div className="quick-actions-grid">
    <a href="/packages"><span className="quick-action-icon">＋</span><strong>Sell access</strong><small>Choose package & start purchase</small></a>
    <a href="/purchases"><span className="quick-action-icon">▱</span><strong>Purchase history</strong><small>Receipts & access lifecycle</small></a>
    <a href="/sessions"><span className="quick-action-icon">◉</span><strong>Active sessions</strong><small>See who is online now</small></a>
    <a href="/payments"><span className="quick-action-icon">¤</span><strong>Payment center</strong><small>Providers & settlement</small></a>
  </div>
</section>
{detail && <div className="purchase-drawer-backdrop" role="presentation" onClick={() => setDetailId('')}>
  <aside className="purchase-drawer" role="dialog" aria-modal="true" aria-label="Purchase details" onClick={e => e.stopPropagation()}>
    <div className="drawer-head"><div><div className="panel-kicker">PURCHASE DETAILS</div><h2>{detail.packageName}</h2><span>{detail.id}</span></div><button type="button" onClick={() => setDetailId('')} aria-label="Close purchase details">×</button></div>
    <div className="drawer-status"><span className={`status ${detail.status.toLowerCase()}`}>{detail.status.replaceAll('_', ' ')}</span><strong>{detail.currency} {Number(detail.price).toLocaleString()}</strong></div>
    <div className="drawer-grid">
      <div><span>Customer</span><strong>{detail.customerName}</strong></div><div><span>Customer ID</span><strong>{detail.customerId}</strong></div>
      <div><span>Package</span><strong>{detail.packageName}</strong></div><div><span>Router</span><strong>{detail.routerId || 'Not assigned'}</strong></div>
      <div><span>Starts</span><strong>{date(detail.startsAt)}</strong></div><div><span>Expires</span><strong>{date(detail.endsAt)}</strong></div>
      <div><span>Created</span><strong>{date(detail.createdAt)}</strong></div><div><span>Access</span><strong>{detail.status.toUpperCase() === 'ACTIVE' ? 'Active' : 'Pending / not active'}</strong></div>
    </div>
    <div className="drawer-actions"><button type="button" onClick={() => { setSelected(detail.id); document.getElementById('payment-control')?.scrollIntoView({behavior:'smooth',block:'center'}); setDetailId(''); }}>Manage payment</button><a href="/sessions">View sessions</a><button type="button" onClick={() => window.print()}>Print</button></div>
  </aside>
</div>}<style jsx>{`.purchase-page{min-height:100vh;background:#f6f8fb;color:#172033;padding:34px 42px 42px}.purchase-page header{max-width:1580px;margin:0 auto 18px}.eyebrow,.panel-kicker{font-size:8px;font-weight:800;letter-spacing:.13em;color:#8a96a8}.purchase-page h1{font-size:28px;letter-spacing:-.04em;margin:6px 0 4px}.purchase-page header p{font-size:11px;color:#7d899a;margin:0}.purchase-summary{max-width:1580px;margin:0 auto 14px;padding:13px 15px;display:flex;align-items:center;gap:11px;background:#fff;border:1px solid #e2e7ee;border-radius:11px;box-shadow:0 1px 2px rgba(15,23,42,.025)}.purchase-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px;margin-top:14px}.purchase-metrics>div{padding:9px 10px;border:1px solid #edf1f5;border-radius:8px;background:#fafbfd}.purchase-metrics span{display:block;color:#8995a5;font-size:7px}.purchase-metrics strong{display:block;color:#172033;font-size:15px;margin-top:4px}.purchase-metrics>div:last-child strong{font-size:12px}.ledger-toolbar{display:grid;grid-template-columns:minmax(220px,1fr) 130px 150px auto;gap:7px;margin-top:13px}.purchase-search{display:flex!important;align-items:center;gap:6px;height:35px!important;margin:0!important;padding:0 9px;background:#fff;border:1px solid #dfe4eb;border-radius:7px}.purchase-search>span{font-size:14px;color:#8490a0}.purchase-search input{height:31px!important;margin:0!important;border:0!important;padding:0!important}.ledger-toolbar select,.filter-reset{height:35px;border:1px solid #dfe4eb;border-radius:7px;background:#fff;color:#5e6b7e;font-size:8px;padding:0 8px}.filter-reset{padding:0 10px}.access-state{display:inline-flex;align-items:center;gap:5px;color:#7c8999;font-size:7px;font-weight:750}.access-state i{width:5px;height:5px;border-radius:50%;background:#9ba5b2}.access-state.active{color:#19845c}.access-state.active i{background:#19845c}.row-view{border:0;background:transparent;color:#2862cf;font-size:8px;font-weight:750}.empty-state-enhanced{text-align:center;padding:46px 18px}.empty-icon{width:46px;height:46px;margin:0 auto 10px;display:grid;place-items:center;border-radius:13px;background:#eef3ff;color:#315ed0;font-size:22px}.empty-state-enhanced strong{display:block;color:#253247;font-size:12px}.empty-state-enhanced p{margin:5px 0 11px;color:#8a95a4;font-size:8px}.empty-state-enhanced a,.empty-state-enhanced button{border:0;background:transparent;color:#2862cf;font-size:8px;font-weight:750}.purchase-drawer-backdrop{position:fixed;inset:0;z-index:200;background:rgba(9,18,32,.42);backdrop-filter:blur(3px);display:flex;justify-content:flex-end}.purchase-drawer{width:min(460px,100%);height:100%;overflow:auto;background:#fff;padding:22px;box-shadow:-18px 0 50px rgba(15,23,42,.18)}.drawer-head{display:flex;justify-content:space-between;gap:12px}.drawer-head h2{margin:6px 0 3px;font-size:19px}.drawer-head>div>span{font-size:8px;color:#8b96a5}.drawer-head>button{width:32px;height:32px;border:1px solid #dfe5ec;border-radius:8px;background:#fff;font-size:20px;color:#69768a}.drawer-status{display:flex;justify-content:space-between;align-items:center;margin-top:18px;padding:12px;border:1px solid #e8edf3;border-radius:9px;background:#fafbfd}.drawer-status strong{font-size:16px;color:#172033}.drawer-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.drawer-grid>div{padding:10px;border:1px solid #edf1f5;border-radius:8px}.drawer-grid span{display:block;color:#8a95a4;font-size:7px}.drawer-grid strong{display:block;margin-top:4px;color:#253247;font-size:9px;overflow-wrap:anywhere}.drawer-actions{display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px;margin-top:14px}.drawer-actions>*{height:35px;display:grid;place-items:center;border:1px solid #dfe4eb;border-radius:7px;background:#fff;color:#536175;font-size:8px;font-weight:750}.drawer-actions button:first-child{background:#2563eb;color:#fff;border-color:#2563eb}.purchase-summary-icon{width:35px;height:35px;display:grid;place-items:center;flex:0 0 35px;border-radius:9px;background:#edf3ff;color:#2f63d1;font-size:18px}.purchase-summary div:nth-child(2){min-width:0;display:flex;flex-direction:column;gap:3px}.purchase-summary strong{color:#1c2a3e;font-size:11px}.purchase-summary span{color:#7f8b9b;font-size:8px}.purchase-summary>a{margin-left:auto;display:flex;gap:5px;align-items:center;color:#2862cf;font-size:9px;font-weight:750}.workspace{display:grid;grid-template-columns:minmax(0,1fr) 410px;gap:14px;max-width:1580px;margin:0 auto}.panel{background:#fff;border:1px solid #e2e7ee;border-radius:12px;padding:19px;box-shadow:0 1px 2px rgba(15,23,42,.025),0 7px 22px rgba(15,23,42,.035)}.panel-head{display:flex;justify-content:space-between;align-items:center}.panel h2{font-size:15px;margin:6px 0 0}.refresh{border:1px solid #dfe4eb;background:#fff;border-radius:7px;padding:8px 11px;font-size:8px}.notice{margin-top:12px;padding:10px;border-radius:8px;background:#fff5f5;color:#b64b57;font-size:9px}.empty{text-align:center;padding:64px 18px;color:#8a95a4;font-size:10px}.table-wrap{overflow:auto;margin-top:15px}table{width:100%;border-collapse:collapse;min-width:760px}th{font-size:7px;letter-spacing:.08em;text-transform:uppercase;color:#96a0ae;text-align:left;padding:9px;border-bottom:1px solid #edf0f4}td{font-size:9px;padding:11px 9px;border-bottom:1px solid #f0f2f5;color:#536074}td strong{display:block;color:#263247}td small{display:block;color:#a0a8b4;font-size:7px;margin-top:3px}tbody tr{cursor:pointer}tbody tr:hover,tbody tr.selected{background:#f7f9ff}tbody tr:focus-visible{outline:2px solid #4f70dc;outline-offset:-2px}.status{display:inline-block;padding:4px 6px;border-radius:4px;font-size:7px;font-weight:800;background:#eef2f6}.status.paid,.status.active{background:#eaf7f0;color:#2f8c62}.status.pending_payment{background:#fff7e8;color:#a56a12}.status.canceled,.status.failed{background:#fff0f1;color:#b64b57}.action-title-row{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.action-title-row h2{font-size:17px}.action-title-row p{margin:5px 0 0}.secure-badge{flex:0 0 auto;padding:6px 8px;border:1px solid #dbe5f1;border-radius:7px;background:#f6f9fd;color:#64758d;font-size:8px;font-weight:700}.action p,.provider-note{font-size:9px;line-height:1.55;color:#8792a1}.provider-fieldset{border:0;padding:0;margin:15px 0 0;min-width:0}.provider-fieldset legend{font-size:8px;font-weight:750;color:#69768a;margin-bottom:8px}.provider-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.provider-option{position:relative;min-width:0;width:100%;min-height:84px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;text-align:center;border:1px solid #dfe4eb;background:#fff;border-radius:9px;padding:9px 6px;cursor:pointer;transition:border-color .15s,box-shadow .15s,background .15s}.provider-option:hover:not(:disabled){background:#fbfcfe;border-color:#c9d2df}.provider-option.active{border-color:#4f70dc;background:#f7f9ff;box-shadow:0 0 0 2px rgba(79,112,220,.08)}.provider-option.unavailable{opacity:.48;cursor:not-allowed;background:#f7f8fa}.provider-option:disabled{opacity:.62}.provider-copy{display:flex;flex-direction:column;gap:2px;min-width:0;max-width:100%}.provider-copy strong{font-size:8px;color:#263247;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}.provider-copy small{font-size:6px;color:#8a95a4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}.provider-check{position:absolute;right:6px;top:6px;width:16px;height:16px;border-radius:50%;display:grid;place-items:center;background:#4f70dc;color:#fff;font-size:9px;font-weight:900}.provider-logo{width:35px!important;height:35px!important;max-width:35px!important;max-height:35px!important;flex:0 0 35px!important;border-radius:8px;display:grid;place-items:center;overflow:hidden;border:1px solid #e2e7ee;background:#fff}.provider-logo img{display:block!important;width:24px!important;height:24px!important;max-width:24px!important;max-height:24px!important;object-fit:contain!important}.provider-logo b{font-size:9px;letter-spacing:-.04em}.provider-logo.jaslyn{background:#081828;border-color:#234e76;color:#6cbcff}.provider-logo.mpesa{background:#fff5f5;border-color:#f0cfd2;color:#c31f2f}.provider-logo.airtel_money{background:#fff0f1;border-color:#f0cbd0}.provider-logo.tigopesa{background:#f4f8ff;border-color:#d5e3f5;color:#1476d4}.provider-logo.halopesa{background:#fff9ed;border-color:#f1dfb6;color:#e09a13}.provider-logo.azampesa{background:#fff5f0;border-color:#f0d3c4;color:#d35a21}.provider-logo.card{background:#f5f7fa;color:#1d4ed8}.provider-logo.paypal{background:#eef7ff}.provider-logo.apple_pay{background:#111;color:#fff}.provider-logo.google_pay{background:#fff}.provider-logo.binance_pay{background:#fff9e6;border-color:#f0dfad}.provider-logo.bank{background:#f2f4f7;color:#566274}.selected-provider{display:flex;align-items:center;gap:9px;margin-top:12px;padding:9px;border-radius:8px;background:#f7f9fc;border:1px solid #edf0f4}.selected-provider div{display:flex;flex-direction:column;gap:2px}.selected-provider span{font-size:7px;color:#8a95a4}.selected-provider strong{font-size:9px;color:#263247}.action label{display:block;font-size:8px;font-weight:750;color:#69768a;margin-top:14px}.action input{display:block;width:100%;height:36px;margin-top:5px;border:1px solid #dfe4eb;border-radius:7px;padding:0 9px;background:#fff;font-size:9px;outline:0}.selected{margin-top:15px;padding:10px;background:#f7f9fc;border-radius:7px;color:#7e8998;font-size:8px}.actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.primary,.secondary{height:36px;border-radius:7px;font-size:8px;font-weight:750}.primary{border:0;background:#2563eb;color:#fff}.secondary{border:1px solid #dfe4eb;background:#fff;color:#6d7889}.actions button:disabled{opacity:.5}.quick-actions-panel{max-width:1580px;margin:14px auto 0;padding:18px 19px;background:#fff;border:1px solid #e2e7ee;border-radius:12px;box-shadow:0 1px 2px rgba(15,23,42,.025),0 7px 22px rgba(15,23,42,.035)}.quick-actions-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.quick-actions-head h2{margin:5px 0 0;font-size:15px;color:#1b2535}.quick-actions-head>a{color:#2862cf;font-size:9px;font-weight:750}.quick-actions-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-top:12px}.quick-actions-grid a{min-height:88px;padding:12px;border:1px solid #e1e7ee;border-radius:10px;background:#fff;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;transition:border-color .15s,box-shadow .15s}.quick-actions-grid a:hover{border-color:#cbd7e6;box-shadow:0 5px 18px rgba(15,23,42,.05)}.quick-action-icon{width:31px;height:31px;display:grid;place-items:center;border-radius:9px;background:#eef3ff;color:#2563eb;font-size:16px}.quick-actions-grid strong{margin-top:8px;color:#1e2b3f;font-size:9px}.quick-actions-grid small{margin-top:3px;color:#8995a4;font-size:7px}@media(max-width:1000px){.workspace{grid-template-columns:1fr}.purchase-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:700px){.purchase-page{padding:14px 10px 96px;background:#f5f8fc}.purchase-page header{padding:12px 9px 8px;margin-bottom:8px}.purchase-page .eyebrow{font-size:7px}.purchase-page h1{font-size:25px;line-height:1.08;margin:5px 0}.purchase-page header p{font-size:10px;line-height:1.45}.purchase-summary{margin:0 1px 10px;padding:13px;border-radius:14px;gap:10px}.purchase-summary-icon{width:39px;height:39px;flex-basis:39px}.purchase-summary strong{font-size:10px}.purchase-summary span{font-size:7px;line-height:1.35}.purchase-summary>a{display:none}.workspace{display:block;margin:0}.workspace>.panel{margin-bottom:10px;border-radius:15px;padding:15px;box-shadow:0 2px 14px rgba(20,44,82,.045)}.workspace>.panel:first-child{padding:14px}.panel-head{align-items:center}.panel-head h2{font-size:16px}.panel-head .panel-kicker{font-size:7px}.refresh{padding:7px 9px}.table-wrap{display:none}.mobile-purchase-empty{display:flex;align-items:center;gap:11px;padding:14px;margin-top:11px;border:1px solid #edf1f6;border-radius:11px;background:#fbfcfe}.mobile-purchase-empty>span{width:42px;height:42px;display:grid;place-items:center;flex:0 0 42px;border-radius:10px;background:linear-gradient(135deg,#5645ee,#245be9);color:#fff;font-size:21px}.mobile-purchase-empty strong{display:block;font-size:11px;color:#172b4d}.mobile-purchase-empty small{display:block;margin-top:3px;font-size:8px;color:#7d8da7}.mobile-purchase-list{display:flex;flex-direction:column;gap:7px;margin-top:8px}.mobile-purchase-item{display:flex;align-items:center;gap:9px;width:100%;padding:10px;border:1px solid #e7ecf3;border-radius:10px;background:#fff;text-align:left}.mobile-purchase-item .mobile-purchase-icon{width:32px;height:32px;display:grid;place-items:center;flex:0 0 32px;border-radius:9px;background:#eef3ff;color:#2e62d5}.mobile-purchase-item>span:nth-child(2){min-width:0;flex:1}.mobile-purchase-item strong{display:block;color:#233654;font-size:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mobile-purchase-item small{display:block;margin-top:3px;color:#8491a4;font-size:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mobile-purchase-item .status{font-size:6px}.action{padding:16px!important}.action-title-row h2{font-size:20px}.action-title-row p{font-size:8px}.provider-note{font-size:8px!important}.provider-fieldset{margin-top:16px}.provider-fieldset legend{font-size:9px}.provider-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.provider-option{min-height:112px;border-radius:11px;padding:10px 6px;gap:7px}.provider-logo{width:42px!important;height:42px!important;max-width:42px!important;max-height:42px!important;flex-basis:42px!important;border-radius:10px}.provider-logo img{width:29px!important;height:29px!important;max-width:29px!important;max-height:29px!important}.provider-copy strong{font-size:9px}.provider-copy small{font-size:7px}.provider-check{right:7px;top:7px;width:18px;height:18px}.selected-provider{padding:10px;margin-top:12px}.action label{font-size:8px}.action input{height:42px;font-size:9px}.actions{grid-template-columns:1fr;gap:7px}.primary,.secondary{height:42px;font-size:9px}.quick-actions-panel{margin:10px 1px 0;padding:15px 13px;border-radius:15px}.quick-actions-head h2{font-size:18px}.quick-actions-grid{grid-template-columns:repeat(2,1fr);gap:8px}.quick-actions-grid a{min-height:91px;border-radius:11px;padding:11px}.quick-action-icon{width:35px;height:35px}.quick-actions-grid strong{font-size:9px}.quick-actions-grid small{font-size:7px}.purchase-page:after{content:'';display:block;height:4px;width:40%;margin:16px auto 0;border-radius:99px;background:#1c2634;opacity:.72}}@media(max-width:380px){.purchase-page{padding-left:8px;padding-right:8px}.provider-option{min-height:102px}.provider-logo{width:38px!important;height:38px!important;max-width:38px!important;max-height:38px!important;flex-basis:38px!important}.provider-logo img{width:26px!important;height:26px!important;max-width:26px!important;max-height:26px!important}}`}</style></main>;
}
