'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import BrandLogo from '../brand-logo';
import { apiFetch } from '../../lib/api';
import { getAccessToken } from '../../lib/auth';

type NetworkPolicy = {
  version?: number;
  validity?: { durationSeconds?: number };
  quota?: { dataLimitBytes?: number | null };
  bandwidth?: { downloadBps?: number | null; uploadBps?: number | null };
  session?: { sessionTimeoutSeconds?: number; interimUpdateSeconds?: number };
  capabilities?: {
    quotaEnforcement?: boolean;
    bandwidthEnforcement?: boolean;
    sessionTimeout?: boolean;
    interimAccounting?: boolean;
    coaCompatible?: boolean;
  };
};

type Purchase = {
  id: string;
  customerId: string;
  customerName: string;
  packageId: string;
  packageName: string;
  routerId?: string | null;
  price: string | number;
  currency: string;
  status: string;
  provider?: string | null;
  accessStatus?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  networkPolicy?: NetworkPolicy | null;
  discountAmount?: number | string | null;
};

type PurchasePackage = { id:string; name:string; price:string|number; currency:string; durationSeconds:number; isActive:boolean; isFreeTrial?:boolean; devicesPerCode?:number };
type PurchaseCustomer = { id:string; fullName:string; phone?:string|null; username?:string|null; isActive:boolean };
type PurchaseRouter = { id:string; name:string; vendor?:string|null; status?:string|null; activeUsers?:number|null };
type PaymentProvider = {
  code: string;
  name: string;
  subtitle: string;
  logoUrl?: string;
  fallback: string;
  tone: string;
  configured: boolean;
  enabled: boolean;
};

type AccessBinding = {
  id: string;
  customerId: string;
  routerId?: string | null;
  packageId?: string | null;
  username: string;
  accessType: string;
  state: string;
  externalReference?: string | null;
  activatedAt?: string | null;
  suspendedAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt?: string | null;
};

type AccessEvent = {
  id: string;
  previousState?: string | null;
  newState: string;
  reason?: string | null;
  source?: string | null;
  paymentId?: string | null;
  createdAt: string;
};

const FALLBACK_PAYMENT_PROVIDERS: PaymentProvider[] = [
  {
    code: 'manual',
    name: 'Manual',
    subtitle: 'JASLYN NET operations',
    fallback: '',
    tone: 'jaslyn',
    configured: true,
    enabled: true,
  },
];

const upper = (value: string | null | undefined) => String(value ?? '').toUpperCase();
const label = (value: string) =>
  value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, char => char.toUpperCase());

const date = (value?: string | null) => {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? '—'
    : new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
};

const money = (value: number | string, currency = 'TZS') =>
  `${currency} ${Number(value || 0).toLocaleString()}`;

const bandwidth = (bps?: number | null) => {
  if (!bps) return 'Unlimited';
  const mbps = Number(bps) / 1_000_000;
  return mbps >= 1 ? `${mbps % 1 === 0 ? mbps.toFixed(0) : mbps.toFixed(1)} Mbps` : `${Math.round(Number(bps) / 1000)} Kbps`;
};

const quota = (bytes?: number | null) => {
  if (!bytes) return 'Unlimited';
  const gb = Number(bytes) / 1_000_000_000;
  return `${gb >= 1 ? gb.toFixed(gb % 1 === 0 ? 0 : 1) + ' GB' : Math.round(Number(bytes) / 1_000_000) + ' MB'}`;
};

const duration = (seconds?: number | null) => {
  if (!seconds) return '—';
  if (seconds % 86400 === 0) return `${seconds / 86400}d`;
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  return `${Math.max(1, Math.round(seconds / 60))}m`;
};

function ProviderLogo({ provider }: { provider: PaymentProvider }) {
  return provider.code === 'manual' && !provider.logoUrl ? (
    <BrandLogo alt="" loading="lazy" />
  ) : provider.logoUrl ? (
    <img src={provider.logoUrl} alt="" loading="lazy" />
  ) : (
    <span aria-hidden="true">{provider.fallback || provider.name.slice(0, 1)}</span>
  );
}

export default function PurchasesPage() {
  const [rows, setRows] = useState<Purchase[]>([]);
  const [providers, setProviders] = useState<PaymentProvider[]>(FALLBACK_PAYMENT_PROVIDERS);
  const [selectedId, setSelectedId] = useState('');
  const [accessBindings, setAccessBindings] = useState<AccessBinding[]>([]);
  const [accessEvents, setAccessEvents] = useState<AccessEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accessSaving, setAccessSaving] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [provider, setProvider] = useState('manual');
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');
  const [showProviderSubtitles, setShowProviderSubtitles] = useState(true);
  const [packages, setPackages] = useState<PurchasePackage[]>([]);
  const [customers, setCustomers] = useState<PurchaseCustomer[]>([]);
  const [routers, setRouters] = useState<PurchaseRouter[]>([]);
  const [flow, setFlow] = useState<'SELL' | 'REDEEM' | null>(null);
  const [flowCustomer, setFlowCustomer] = useState('');
  const [flowPackage, setFlowPackage] = useState('');
  const [flowRouter, setFlowRouter] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [voucherCode, setVoucherCode] = useState('');
  const [flowSaving, setFlowSaving] = useState(false);
  const [flowMessage, setFlowMessage] = useState('');

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      setError('Sign in to manage purchase operations.');
      return;
    }

    setLoading(true);
    setError('');

    const requests = await Promise.all([
      apiFetch<{ data?: Purchase[] }>('/purchases', { headers: { Authorization: `Bearer ${token}` } }).then(value => ({ value })).catch(cause => ({ cause })),
      apiFetch<{ data?: PaymentProvider[] }>('/payments/methods', { headers: { Authorization: `Bearer ${token}` } }).then(value => ({ value })).catch(cause => ({ cause })),
      apiFetch<{ data?: PurchasePackage[] }>('/packages?limit=100&activeOnly=true', { headers: { Authorization: `Bearer ${token}` } }).then(value => ({ value })).catch(cause => ({ cause })),
      apiFetch<{ data?: PurchaseCustomer[] }>('/customers?limit=100&activeOnly=true', { headers: { Authorization: `Bearer ${token}` } }).then(value => ({ value })).catch(cause => ({ cause })),
      apiFetch<{ data?: PurchaseRouter[] }>('/routers?limit=100', { headers: { Authorization: `Bearer ${token}` } }).then(value => ({ value })).catch(cause => ({ cause })),
    ]);

    const failures: string[] = [];
    const [purchaseResult, methodsResult, packageResult, customerResult, routerResult] = requests;
    if ('value' in purchaseResult) {
      const purchaseRows = purchaseResult.value.data ?? [];
      setRows(purchaseRows);
      setSelectedId(current => current && purchaseRows.some(row => row.id === current) ? current : purchaseRows[0]?.id ?? '');
    } else failures.push('Purchases: ' + (purchaseResult.cause instanceof Error ? purchaseResult.cause.message : 'request failed'));

    if ('value' in methodsResult) {
      const enabled = (methodsResult.value.data ?? []).filter(item => item.enabled);
      const operational = enabled.length ? enabled : FALLBACK_PAYMENT_PROVIDERS;
      setProviders(operational);
      setProvider(current => operational.some(item => item.code === current) ? current : operational[0]?.code ?? 'manual');
    } else failures.push('Payment methods: ' + (methodsResult.cause instanceof Error ? methodsResult.cause.message : 'request failed'));

    if ('value' in packageResult) {
      const activePackages = (packageResult.value.data ?? []).filter(item => item.isActive);
      setPackages(activePackages);
      setFlowPackage(current => current || activePackages[0]?.id || '');
    } else failures.push('Packages: ' + (packageResult.cause instanceof Error ? packageResult.cause.message : 'request failed'));

    if ('value' in customerResult) {
      const activeCustomers = (customerResult.value.data ?? []).filter(item => item.isActive);
      setCustomers(activeCustomers);
      setFlowCustomer(current => current || activeCustomers[0]?.id || '');
    } else failures.push('Customers: ' + (customerResult.cause instanceof Error ? customerResult.cause.message : 'request failed'));

    if ('value' in routerResult) {
      const availableRouters = routerResult.value.data ?? [];
      setRouters(availableRouters);
      setFlowRouter(current => current || availableRouters.find(item => ['ONLINE', 'CONNECTED'].includes(upper(item.status)))?.id || '');
    } else failures.push('Routers: ' + (routerResult.cause instanceof Error ? routerResult.cause.message : 'request failed'));

    setError(failures.length ? failures.join(' · ') : '');
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('jaslyn-net.preferences');
      if (raw) {
        const prefs = JSON.parse(raw) as { paymentSubtitles?: boolean };
        setShowProviderSubtitles(prefs.paymentSubtitles !== false);
      }
    } catch {
      // Keep the safe default.
    }
  }, []);

  const selected = useMemo(() => rows.find(row => row.id === selectedId) ?? null, [rows, selectedId]);

  useEffect(() => {
    if (!selected) {
      setAccessBindings([]);
      setAccessEvents([]);
      return;
    }

    const token = getAccessToken();
    if (!token) return;

    let cancelled = false;
    setDetailLoading(true);

    void (async () => {
      try {
        const response = await apiFetch<{ data?: AccessBinding[] }>(
          `/isp/access-bindings?search=${encodeURIComponent(selected.customerName)}&limit=100`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const matches = (response.data ?? []).filter(binding =>
          binding.customerId === selected.customerId &&
          (!binding.packageId || !selected.packageId || binding.packageId === selected.packageId),
        );

        if (cancelled) return;
        setAccessBindings(matches);

        const target = matches[0];
        if (target) {
          const events = await apiFetch<AccessEvent[]>(
            `/isp/access-bindings/${target.id}/events`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (!cancelled) setAccessEvents(events ?? []);
        } else {
          setAccessEvents([]);
        }
      } catch (cause) {
        if (!cancelled) {
          setAccessBindings([]);
          setAccessEvents([]);
          setError(cause instanceof Error ? cause.message : 'Unable to load access context.');
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selected]);

  async function createPurchase() {
    if (!flowCustomer || !flowPackage) {
      setError('Select an active customer and package before creating a purchase.');
      return;
    }
    const token = getAccessToken();
    if (!token) { setError('Sign in before creating a purchase.'); return; }
    setFlowSaving(true); setError(''); setFlowMessage('');
    try {
      const result = await apiFetch<Purchase>('/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          customerId: flowCustomer,
          packageId: flowPackage,
          routerId: flowRouter || undefined,
          promoCode: promoCode.trim() || undefined,
        }),
      });
      setSelectedId(result.id);
      setFlowMessage('Purchase created. Settlement remains pending until a payment is verified.');
      setPromoCode('');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create the purchase.');
    } finally { setFlowSaving(false); }
  }

  async function redeemVoucher() {
    const code = voucherCode.trim().toUpperCase();
    if (!flowCustomer || code.length < 2) {
      setError('Select an active customer and enter a voucher code.');
      return;
    }
    const token = getAccessToken();
    if (!token) { setError('Sign in before redeeming a voucher.'); return; }
    setFlowSaving(true); setError(''); setFlowMessage('');
    try {
      const result = await apiFetch<{ purchaseId:string; deviceLimit?:number }>(
        `/vouchers/${encodeURIComponent(code)}/redeem`,
        {
          method:'POST',
          headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
          body:JSON.stringify({customerId:flowCustomer,routerId:flowRouter||undefined}),
        },
      );
      setSelectedId(result.purchaseId);
      setFlowMessage(`Voucher redeemed and access activated for ${result.deviceLimit ?? 1} device(s).`);
      setVoucherCode('');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to redeem the voucher.');
    } finally { setFlowSaving(false); }
  }

  async function settle(status: 'SUCCESS' | 'FAILED') {
    if (!selected) {
      setError('Select a purchase from the ledger first.');
      return;
    }
    if (!reference.trim()) {
      setError('Enter the provider reference before settling this purchase.');
      return;
    }
    const method = providers.find(item => item.code === provider);
    if (!method?.enabled) {
      setError('The selected payment method is not enabled for this organization.');
      return;
    }

    const token = getAccessToken();
    if (!token) {
      setError('Sign in before confirming a payment.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await apiFetch(`/purchases/${selected.id}/confirm-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          provider,
          providerReference: reference.trim(),
          status,
          idempotencyKey: `ops:${selected.id}:${reference.trim()}`,
        }),
      });
      setReference('');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to settle the purchase.');
    } finally {
      setSaving(false);
    }
  }

  async function changeAccessState(nextState: 'ACTIVE' | 'SUSPENDED') {
    const binding = accessBindings[0];
    if (!binding) {
      setError('No customer access binding is linked to this purchase.');
      return;
    }

    const trimmedReason = reason.trim();
    if (trimmedReason.length < 2) {
      setError('Enter a reason before changing access state.');
      return;
    }

    const token = getAccessToken();
    if (!token) {
      setError('Sign in before changing access state.');
      return;
    }

    setAccessSaving(true);
    setError('');

    try {
      await apiFetch(`/isp/access-bindings/${binding.id}/state`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          state: nextState,
          reason: trimmedReason,
        }),
      });
      setReason('');
      await load();
      const refreshed = await apiFetch<{ data?: AccessBinding[] }>(
        `/isp/access-bindings?search=${encodeURIComponent(selected?.customerName ?? '')}&limit=100`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setAccessBindings((refreshed.data ?? []).filter(item => item.customerId === selected?.customerId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to change access state.');
    } finally {
      setAccessSaving(false);
    }
  }

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter(row => {
      const matchesQuery =
        !needle ||
        [row.customerName, row.customerId, row.packageName, row.id, row.currency, row.provider ?? '']
          .some(value => String(value).toLowerCase().includes(needle));
      return matchesQuery && (statusFilter === 'ALL' || upper(row.status) === statusFilter);
    });
  }, [query, rows, statusFilter]);

  const metrics = useMemo(() => {
    const successful = rows.filter(row => ['PAID', 'SUCCESS', 'ACTIVE'].includes(upper(row.status)));
    const pending = rows.filter(row => upper(row.status).includes('PENDING'));
    const failed = rows.filter(row => ['FAILED', 'CANCELED', 'CANCELLED'].includes(upper(row.status)));
    const activeAccess = rows.filter(row => upper(row.accessStatus) === 'ACTIVE' || upper(row.status) === 'ACTIVE');
    const value = successful.reduce((sum, row) => sum + Number(row.price || 0), 0);
    const currencies = Array.from(new Set(successful.map(row => row.currency).filter(Boolean)));
    return {
      total: rows.length,
      successful: successful.length,
      pending: pending.length,
      failed: failed.length,
      activeAccess: activeAccess.length,
      value,
      currency: currencies.length === 1 ? currencies[0] : '',
      currencies: currencies.length,
    };
  }, [rows]);

  const activeBinding = accessBindings[0] ?? null;
  const policy = selected?.networkPolicy ?? null;
  const paymentState = selected ? label(selected.status) : '—';
  const accessState = selected
    ? selected.accessStatus
      ? label(selected.accessStatus)
      : activeBinding
        ? label(activeBinding.state)
        : 'Not linked'
    : '—';

  return (
    <main className="purchase-page">
      <header className="purchase-header">
        <div className="purchase-title-group">
          <BrandLogo alt="JASLYN NET" />
          <div>
            <div className="eyebrow">HYBRID COMMERCIAL CONTROL PLANE</div>
            <h1>Purchases & Access</h1>
            <p>Commercial entitlement, payment settlement and network access in one operational surface.</p>
          </div>
        </div>
        <button className="refresh-button" type="button" onClick={() => void load()} disabled={loading || saving || accessSaving}>
          <span aria-hidden="true">↻</span>
          {loading ? 'Refreshing' : 'Refresh'}
        </button>
      </header>

      <section className="hybrid-hero">
        <div className="hybrid-hero-copy">
          <span className="section-label">HYBRID ENTITLEMENT FABRIC</span>
          <h2>Money becomes access only through a verified state transition.</h2>
          <p>Trace the exact chain from customer purchase to payment, entitlement policy and network binding. One screen, one operational truth.</p>
        </div>
        <div className="hybrid-chain" aria-label="Purchase to network lifecycle">
          <div className="chain-node done"><span>01</span><strong>Purchase</strong><small>Commercial record</small></div>
          <i aria-hidden="true" />
          <div className={`chain-node ${selected && ['PAID','SUCCESS','ACTIVE'].includes(upper(selected.status)) ? 'done' : 'current'}`}><span>02</span><strong>Payment</strong><small>{paymentState}</small></div>
          <i aria-hidden="true" />
          <div className={`chain-node ${activeBinding && upper(activeBinding.state) === 'ACTIVE' ? 'done' : ''}`}><span>03</span><strong>Access</strong><small>{accessState}</small></div>
        </div>
      </section>


      {flowMessage && (
        <div className="flow-success" role="status">
          <span aria-hidden="true">✓</span>
          <div><strong>Commerce flow completed</strong><p>{flowMessage}</p></div>
        </div>
      )}

      <section className="channel-hub">
        <div className="channel-hub-head">
          <div>
            <span className="section-label">OMNI-CHANNEL ACCESS SALES</span>
            <h2>Sell connectivity through one entitlement engine.</h2>
            <p>Online payment, operator-assisted checkout and prepaid vouchers converge on the same package, policy and network-access model.</p>
          </div>
          <div className="channel-stat"><span>Live sales channels</span><strong>03</strong></div>
        </div>
        <div className="channel-tabs" role="tablist" aria-label="Sales channel">
          <button type="button" className={flow === 'SELL' ? 'active' : ''} onClick={() => setFlow('SELL')}>Sell access</button>
          <button type="button" className={flow === 'REDEEM' ? 'active' : ''} onClick={() => setFlow('REDEEM')}>Redeem voucher</button>
          <a href="/packages">Plans & products</a>
          <a href="/vouchers">Voucher desk</a>
        </div>
        {flow && (
          <div className="channel-workspace">
            <div className="channel-form">
              <div className="channel-form-head">
                <div><span className="section-label">{flow === 'SELL' ? 'ASSISTED CHECKOUT' : 'PREPAID REDEMPTION'}</span><h3>{flow === 'SELL' ? 'Create a customer purchase' : 'Redeem a prepaid code'}</h3></div>
                <button type="button" onClick={() => setFlow(null)} aria-label="Close sales flow">×</button>
              </div>
              <label>Customer<select value={flowCustomer} onChange={e => setFlowCustomer(e.target.value)}>
                <option value="">Select active customer</option>
                {customers.map(customer => <option key={customer.id} value={customer.id}>{customer.fullName}{customer.phone ? ` · ${customer.phone}` : ''}</option>)}
              </select></label>
              {flow === 'SELL' ? (
                <>
                  <label>Internet package<select value={flowPackage} onChange={e => setFlowPackage(e.target.value)}>
                    <option value="">Select package</option>
                    {packages.map(pkg => <option key={pkg.id} value={pkg.id}>{pkg.name} · {pkg.currency} {Number(pkg.price).toLocaleString()}{pkg.isFreeTrial ? ' · Free trial' : ''}</option>)}
                  </select></label>
                  <label>Router / site context<select value={flowRouter} onChange={e => setFlowRouter(e.target.value)}>
                    <option value="">Automatic / unassigned</option>
                    {routers.map(router => <option key={router.id} value={router.id}>{router.name}{router.vendor ? ` · ${router.vendor}` : ''}{router.status ? ` · ${router.status}` : ''}</option>)}
                  </select></label>
                  <label>Promotion code <span className="optional">optional</span><input value={promoCode} onChange={e => setPromoCode(e.target.value)} placeholder="Existing promotion code" /></label>
                  <button type="button" className="flow-primary" disabled={flowSaving} onClick={() => void createPurchase()}>{flowSaving ? 'Creating…' : 'Create purchase'}</button>
                  <small className="flow-note">Creates the canonical purchase. Payment settlement and access activation remain governed by the verified lifecycle.</small>
                </>
              ) : (
                <>
                  <label>Voucher code<input value={voucherCode} onChange={e => setVoucherCode(e.target.value)} onKeyDown={e => { if(e.key === 'Enter'){e.preventDefault();void redeemVoucher();} }} placeholder="Enter voucher code" autoCapitalize="characters" /></label>
                  <label>Router / site context<select value={flowRouter} onChange={e => setFlowRouter(e.target.value)}>
                    <option value="">Automatic / unassigned</option>
                    {routers.map(router => <option key={router.id} value={router.id}>{router.name}{router.vendor ? ` · ${router.vendor}` : ''}</option>)}
                  </select></label>
                  <button type="button" className="flow-primary" disabled={flowSaving} onClick={() => void redeemVoucher()}>{flowSaving ? 'Redeeming…' : 'Redeem & activate'}</button>
                  <small className="flow-note">Uses the existing voucher redemption path, including package policy, expiry and device allowance.</small>
                </>
              )}
            </div>
            <div className="channel-assurance">
              <div className="assurance-primary"><span className="assurance-mark" aria-hidden="true">◎</span><div><strong>One access contract</strong><p>Every channel resolves into the same network entitlement: duration, quota, bandwidth, session controls and access binding.</p></div></div>
              <div><span>Active packages</span><strong>{packages.length.toLocaleString()}</strong></div>
              <div><span>Active customers</span><strong>{customers.length.toLocaleString()}</strong></div>
              <div><span>Routers in fleet</span><strong>{routers.length.toLocaleString()}</strong></div>
              <div><span>Enabled payment methods</span><strong>{providers.length.toLocaleString()}</strong></div>
            </div>
          </div>
        )}
      </section>

      {error && (
        <div className="operation-error" role="alert">
          <span aria-hidden="true">!</span>
          <div><strong>Operation not completed</strong><p>{error}</p></div>
        </div>
      )}

      <section className="purchase-stats" aria-label="Purchase metrics">
        <article><span>Total</span><strong>{metrics.total.toLocaleString()}</strong><small>purchase records</small></article>
        <article><span>Successful</span><strong>{metrics.successful.toLocaleString()}</strong><small>paid or active</small></article>
        <article><span>Pending</span><strong>{metrics.pending.toLocaleString()}</strong><small>awaiting settlement</small></article>
        <article><span>Active access</span><strong>{metrics.activeAccess.toLocaleString()}</strong><small>entitlements currently active</small></article>
        <article className="stat-value"><span>Settled value</span><strong>{metrics.currency ? money(metrics.value, metrics.currency) : metrics.currencies > 1 ? `${metrics.currencies} currencies` : '—'}</strong><small>successful records</small></article>
      </section>

      <section className="purchase-workspace">
        <article className="ledger-surface">
          <div className="surface-header">
            <div>
              <span className="section-label">PURCHASE LEDGER</span>
              <h2>Commercial transactions</h2>
              <p>Click a purchase to open its settlement and access context.</p>
            </div>
            <span className="surface-count">{filteredRows.length} shown</span>
          </div>

          <div className="ledger-controls">
            <label className="search-field">
              <span aria-hidden="true">⌕</span>
              <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Customer, package, transaction or provider" aria-label="Search purchases" />
            </label>
            <div className="status-tabs" role="tablist" aria-label="Purchase status">
              {[['ALL','All'],['PENDING_PAYMENT','Pending'],['PAID','Paid'],['ACTIVE','Active'],['FAILED','Failed']].map(([value,text]) => (
                <button key={value} type="button" role="tab" aria-selected={statusFilter === value} className={statusFilter === value ? 'active' : ''} onClick={() => setStatusFilter(value)}>{text}</button>
              ))}
            </div>
            <button className="clear-button" type="button" onClick={() => { setQuery(''); setStatusFilter('ALL'); }} disabled={!query && statusFilter === 'ALL'}>Clear</button>
          </div>

          {loading ? (
            <div className="ledger-state">Loading purchase ledger…</div>
          ) : rows.length === 0 ? (
            <div className="ledger-state empty"><strong>No purchases yet</strong><p>New customer purchases will appear here.</p><a href="/packages">Open Plans & Products</a></div>
          ) : filteredRows.length === 0 ? (
            <div className="ledger-state empty"><strong>No matching purchases</strong><p>Clear the search or status filter.</p><button type="button" onClick={() => { setQuery(''); setStatusFilter('ALL'); }}>Clear filters</button></div>
          ) : (
            <>
              <div className="purchase-table-wrap">
                <table className="purchase-table">
                  <thead><tr><th>Customer</th><th>Service</th><th>Amount</th><th>Payment</th><th>Access</th><th>Created</th></tr></thead>
                  <tbody>
                    {filteredRows.map(row => {
                      const access = row.accessStatus ? label(row.accessStatus) : row.endsAt && new Date(row.endsAt).getTime() > Date.now() ? 'Granted' : 'Not active';
                      return (
                        <tr key={row.id} className={selectedId === row.id ? 'selected' : ''} onClick={() => setSelectedId(row.id)} tabIndex={0} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(row.id); } }}>
                          <td><strong>{row.customerName}</strong><small>{row.customerId.slice(0, 12)}…</small></td>
                          <td><strong>{row.packageName}</strong><small>{row.provider ? label(row.provider) : 'Provider not recorded'}</small></td>
                          <td><strong>{money(Number(row.price), row.currency)}</strong></td>
                          <td><span className={`status status-${upper(row.status).toLowerCase()}`}>{label(row.status)}</span></td>
                          <td><span className={`access access-${upper(row.accessStatus ?? '').toLowerCase()}`}><i />{access}</span></td>
                          <td>{date(row.createdAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mobile-list">
                {filteredRows.map(row => (
                  <button key={row.id} type="button" className="mobile-purchase" onClick={() => setSelectedId(row.id)}>
                    <span className="mobile-purchase-mark" aria-hidden="true">▱</span>
                    <span className="mobile-purchase-copy"><strong>{row.packageName}</strong><small>{row.customerName} · {money(Number(row.price), row.currency)}</small></span>
                    <span className={`status status-${upper(row.status).toLowerCase()}`}>{label(row.status)}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </article>

        <aside className="settlement-surface">
          <div className="surface-header compact">
            <span className="section-label">HYBRID ACCESS WORKSPACE</span>
            <h2>{selected ? selected.customerName : 'Select a purchase'}</h2>
            <p>{selected ? `${selected.packageName} · ${selected.id}` : 'Select a transaction to inspect settlement and access.'}</p>
          </div>

          {!selected ? (
            <div className="selection-empty"><div className="selection-line" /><strong>Nothing selected</strong><p>The right workspace stays contextual. Select a purchase from the ledger.</p></div>
          ) : (
            <>
              <div className="record-header">
                <div><span>Purchase state</span><strong>{paymentState}</strong></div>
                <div><span>Access state</span><strong>{accessState}</strong></div>
                <div><span>Amount</span><strong>{money(Number(selected.price), selected.currency)}</strong></div>
              </div>

              <section className="entitlement-card">
                <div className="card-head"><div><span className="section-label">NETWORK ENTITLEMENT</span><h3>Compiled policy</h3></div><span className="policy-version">v{policy?.version ?? '—'}</span></div>
                <div className="policy-grid">
                  <div><span>Download</span><strong>{bandwidth(policy?.bandwidth?.downloadBps)}</strong></div>
                  <div><span>Upload</span><strong>{bandwidth(policy?.bandwidth?.uploadBps)}</strong></div>
                  <div><span>Quota</span><strong>{quota(policy?.quota?.dataLimitBytes)}</strong></div>
                  <div><span>Session</span><strong>{duration(policy?.session?.sessionTimeoutSeconds)}</strong></div>
                </div>
                <div className="capability-row">
                  {([
                    ['Quota', Boolean(policy?.capabilities?.quotaEnforcement)],
                    ['Bandwidth', Boolean(policy?.capabilities?.bandwidthEnforcement)],
                    ['Timeout', Boolean(policy?.capabilities?.sessionTimeout)],
                    ['Interim acct.', Boolean(policy?.capabilities?.interimAccounting)],
                    ['CoA', Boolean(policy?.capabilities?.coaCompatible)],
                  ] as Array<[string, boolean]>).map(([name, enabled]) => (
                    <span key={name} className={enabled ? 'enabled' : ''}><i />{name}</span>
                  ))}
                </div>
              </section>

              <section className="access-card">
                <div className="card-head"><div><span className="section-label">NETWORK BINDING</span><h3>{detailLoading ? 'Resolving access…' : activeBinding ? activeBinding.username : 'No binding linked'}</h3></div><span className={`binding-state binding-${upper(activeBinding?.state).toLowerCase()}`}>{activeBinding ? label(activeBinding.state) : 'Unlinked'}</span></div>
                {activeBinding ? (
                  <>
                    <div className="binding-grid">
                      <div><span>Access type</span><strong>{label(activeBinding.accessType)}</strong></div>
                      <div><span>Router</span><strong>{activeBinding.routerId || selected.routerId || 'Not assigned'}</strong></div>
                      <div><span>Activated</span><strong>{date(activeBinding.activatedAt)}</strong></div>
                      <div><span>Expires</span><strong>{date(activeBinding.expiresAt || selected.endsAt)}</strong></div>
                    </div>
                    <div className="state-control">
                      <label>Reason for state change<input value={reason} onChange={event => setReason(event.target.value)} placeholder="e.g. payment confirmed, customer requested suspension" disabled={accessSaving} /></label>
                      <div className="state-actions">
                        <button type="button" className="suspend-action" disabled={accessSaving || upper(activeBinding.state) === 'SUSPENDED'} onClick={() => void changeAccessState('SUSPENDED')}>{accessSaving ? 'Saving…' : 'Suspend access'}</button>
                        <button type="button" className="resume-action" disabled={accessSaving || upper(activeBinding.state) === 'ACTIVE'} onClick={() => void changeAccessState('ACTIVE')}>Resume access</button>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="card-empty">This purchase does not currently resolve to a customer access binding through the access service.</p>
                )}
              </section>

              <section className="settlement-card">
                <div className="card-head"><div><span className="section-label">PAYMENT SETTLEMENT</span><h3>Verified operator action</h3></div><span className="control-state">{providers.length} methods</span></div>
                <div className="provider-list" role="radiogroup" aria-label="Payment method">
                  {providers.map(item => (
                    <button key={item.code} type="button" role="radio" aria-checked={provider === item.code} className={`provider-row ${provider === item.code ? 'active' : ''}`} onClick={() => setProvider(item.code)} disabled={saving}>
                      <span className={`provider-mark ${item.tone}`}><ProviderLogo provider={item} /></span>
                      <span className="provider-copy"><strong>{item.name}</strong><small>{showProviderSubtitles ? item.subtitle : 'Configured'}</small></span>
                      {provider === item.code && <span className="provider-selected">Selected</span>}
                    </button>
                  ))}
                </div>
                <label className="reference-field"><span>Provider reference</span><input value={reference} onChange={event => setReference(event.target.value)} placeholder="Transaction reference" disabled={saving} /></label>
                <div className="settlement-actions"><button type="button" className="secondary-action" disabled={saving} onClick={() => void settle('FAILED')}>Mark failed</button><button type="button" className="primary-action" disabled={saving} onClick={() => void settle('SUCCESS')}>{saving ? 'Saving…' : 'Confirm paid'}</button></div>
                <div className="settlement-note"><strong>Verification boundary</strong><span>External payment providers must complete authenticated webhook verification. Manual settlement is the operator path.</span></div>
              </section>

              <section className="event-card">
                <div className="card-head"><div><span className="section-label">ACCESS AUDIT</span><h3>State history</h3></div><span className="control-state">{accessEvents.length} events</span></div>
                {accessEvents.length ? (
                  <div className="event-list">
                    {accessEvents.slice(0,6).map(event => <div className="event-row" key={event.id}><span className="event-dot" /><div><strong>{label(event.newState)}</strong><small>{event.reason || 'No reason recorded'} · {date(event.createdAt)}</small></div></div>)}
                  </div>
                ) : <p className="card-empty">No access state events were returned for the linked binding.</p>}
              </section>

              <div className="selection-meta">
                <span>Created {date(selected.createdAt)}</span>
                <span>Updated {date(selected.updatedAt)}</span>
                <a href={`/customers?customerId=${selected.customerId}`}>Open customer</a>
                <a href="/packages">Plans & Products</a>
              </div>
            </>
          )}
        </aside>
      </section>
    </main>
  );
}
