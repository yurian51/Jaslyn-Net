'use client';

import { useEffect, useState } from 'react';
import { getAccessToken } from '../../lib/auth';
import BrandLogo from '../brand-logo';
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
      if (!available.some(item => item.code === provider && item.enabled)) setProvider(operational[0]?.code ?? 'manual');
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
  const paymentProvidersInRows = Array.from(new Set(rows.map(row => row.provider).filter(Boolean) as string[]));
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
  return <main className="purchase-page"><header className="purchase-header"><div className="purchase-header-copy"><BrandLogo alt="JASLYN NET" /><div><div className="eyebrow">JASLYN NET / COMMERCIAL OPERATIONS</div><h1>Purchases & Access</h1><p>Track plan purchases, payment confirmation and customer access lifecycle.</p></div></div></header><section className="purchase-summary">
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
      <label className="purchase-search"><span aria-hidden="true">⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search customer, package, transaction or provider…" aria-label="Search purchases" /></label>
      <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Filter purchase status">
        <option value="ALL">All statuses</option><option value="PENDING_PAYMENT">Pending</option><option value="PAID">Paid</option><option value="ACTIVE">Active</option><option value="FAILED">Failed</option><option value="CANCELED">Canceled</option>
      </select>
      <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} aria-label="Filter payment method">
        <option value="ALL">All payment methods</option>
        {paymentProvidersInRows.map(code => <option key={code} value={code}>{providers.find(item => item.code === code)?.name ?? code.replaceAll('_', ' ')}</option>)}
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
          const openPurchase = () => { setSelected(row.id); setDetailId(row.id); };
          return <tr key={row.id} onClick={openPurchase} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openPurchase(); } }} tabIndex={0} aria-selected={detailId === row.id} className={detailId === row.id ? 'selected' : ''}>
            <td><strong>{row.customerName}</strong><small>{row.customerId.slice(0, 10)}…</small></td>
            <td>{row.packageName}<small>{row.provider ? row.provider.replaceAll('_', ' ') : 'Payment provider not recorded'}</small></td><td><strong>{row.currency} {Number(row.price).toLocaleString()}</strong></td>
            <td><span className={`status ${row.status.toLowerCase()}`}>{row.status.replaceAll('_', ' ')}</span></td>
            <td><span className={`access-state ${String(row.accessStatus ?? access).toLowerCase()}`}><i />{row.accessStatus ?? access}</span></td><td>{date(row.createdAt)}</td>
            <td><button type="button" className="row-view" onClick={e => { e.stopPropagation(); setDetailId(row.id); }}>View</button></td>
          </tr>;
        })}</tbody>
      </table></div>
      <div className="mobile-purchase-list">{filteredRows.map(row => <button key={row.id} type="button" className="mobile-purchase-item" onClick={() => { setSelected(row.id); setDetailId(row.id); }}>
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
      <div><span>Created</span><strong>{date(detail.createdAt)}</strong></div><div><span>Payment provider</span><strong>{detail.provider ? detail.provider.replaceAll('_', ' ') : 'Not recorded'}</strong></div>
      <div><span>Access</span><strong>{detail.accessStatus ?? (detail.status.toUpperCase() === 'ACTIVE' ? 'ACTIVE' : 'Pending / not active')}</strong></div>
    </div>
    <div className="drawer-actions"><button type="button" onClick={() => { setSelected(detail.id); document.getElementById('payment-control')?.scrollIntoView({behavior:'smooth',block:'center'}); setDetailId(''); }}>Manage payment</button><a href="/sessions">View sessions</a><button type="button" onClick={() => window.print()}>Print</button></div>
  </aside>
</div>}</main>;
}
