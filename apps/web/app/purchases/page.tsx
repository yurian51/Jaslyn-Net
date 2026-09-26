'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import BrandLogo from '../brand-logo';
import { apiFetch } from '../../lib/api';
import { getAccessToken } from '../../lib/auth';

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
};

type PaymentProvider = {
  code: string;
  name: string;
  subtitle: string;
  logoUrl?: string;
  fallback: string;
  tone: string;
  category: string;
  countries: string[];
  currencies: string[];
  directIntegration: boolean;
  webhookSupported: boolean;
  reconciliationSupported: boolean;
  configured: boolean;
  enabled: boolean;
};

const FALLBACK_PAYMENT_PROVIDERS: PaymentProvider[] = [
  {
    code: 'manual',
    name: 'Manual',
    subtitle: 'JASLYN NET operations',
    fallback: '',
    tone: 'jaslyn',
    category: 'MANUAL',
    countries: ['TZ'],
    currencies: ['TZS'],
    directIntegration: true,
    webhookSupported: false,
    reconciliationSupported: true,
    configured: true,
    enabled: true,
  },
];

const upper = (value: string | null | undefined) => String(value ?? '').toUpperCase();
const statusLabel = (value: string) =>
  value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, char => char.toUpperCase());

const date = (value?: string | null) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
};

const money = (value: number | string, currency = 'TZS') => `${currency} ${Number(value || 0).toLocaleString()}`;

function ProviderLogo({ provider }: { provider: PaymentProvider }) {
  if (provider.code === 'manual' && !provider.logoUrl) return <BrandLogo alt="" loading="lazy" />;
  return provider.logoUrl ? (
    <img src={provider.logoUrl} alt="" loading="lazy" />
  ) : (
    <span className="provider-letter" aria-hidden="true">{provider.fallback || provider.name.slice(0, 1)}</span>
  );
}

export default function PurchasesPage() {
  const [rows, setRows] = useState<Purchase[]>([]);
  const [providers, setProviders] = useState<PaymentProvider[]>(FALLBACK_PAYMENT_PROVIDERS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedId, setSelectedId] = useState('');
  const [provider, setProvider] = useState('manual');
  const [reference, setReference] = useState('');
  const [showProviderSubtitles, setShowProviderSubtitles] = useState(true);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      setError('Sign in to manage purchase operations.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const [purchaseResponse, methodsResponse] = await Promise.all([
        apiFetch<{ data?: Purchase[] }>('/purchases', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        apiFetch<{ data?: PaymentProvider[] }>('/payments/methods', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      setRows(purchaseResponse.data ?? []);
      const enabled = (methodsResponse.data ?? FALLBACK_PAYMENT_PROVIDERS).filter(item => item.enabled);
      const operational = enabled.length ? enabled : FALLBACK_PAYMENT_PROVIDERS;
      setProviders(operational);
      if (!operational.some(item => item.code === provider)) setProvider(operational[0].code);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load purchase operations.');
    } finally {
      setLoading(false);
    }
  }, [provider]);

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

  async function settle(status: 'SUCCESS' | 'FAILED') {
    if (!selectedId) {
      setError('Select a purchase from the ledger first.');
      return;
    }
    if (!reference.trim()) {
      setError('Enter the provider reference before settling this purchase.');
      return;
    }

    const selectedMethod = providers.find(item => item.code === provider);
    if (!selectedMethod?.enabled) {
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
      await apiFetch(`/purchases/${selectedId}/confirm-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          provider,
          providerReference: reference.trim(),
          status,
          idempotencyKey: `ops:${selectedId}:${reference.trim()}`,
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

  const selected = rows.find(row => row.id === selectedId) ?? null;
  const selectedProvider =
    providers.find(item => item.code === provider) ?? providers[0] ?? FALLBACK_PAYMENT_PROVIDERS[0];

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter(row => {
      const matchesQuery =
        !needle ||
        [row.customerName, row.customerId, row.packageName, row.id, row.currency, row.provider ?? '']
          .some(value => String(value).toLowerCase().includes(needle));
      const matchesStatus = statusFilter === 'ALL' || upper(row.status) === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [query, rows, statusFilter]);

  const metrics = useMemo(() => {
    const paid = rows.filter(row => ['PAID', 'SUCCESS'].includes(upper(row.status)));
    const pending = rows.filter(row => upper(row.status).includes('PENDING'));
    const failed = rows.filter(row => ['FAILED', 'CANCELED', 'CANCELLED'].includes(upper(row.status)));
    const active = rows.filter(row => upper(row.accessStatus) === 'ACTIVE' || upper(row.status) === 'ACTIVE');
    const currencies = Array.from(new Set(paid.map(row => row.currency).filter(Boolean)));
    const value = paid.reduce((sum, row) => sum + Number(row.price || 0), 0);
    return {
      total: rows.length,
      paid: paid.length,
      pending: pending.length,
      failed: failed.length,
      active: active.length,
      value,
      currency: currencies.length === 1 ? currencies[0] : '',
      currencies: currencies.length,
    };
  }, [rows]);

  const accessText = (row: Purchase) => {
    if (row.accessStatus) return statusLabel(row.accessStatus);
    if (upper(row.status) === 'ACTIVE') return 'Active';
    if (row.endsAt && new Date(row.endsAt).getTime() > Date.now()) return 'Granted';
    return 'Not active';
  };

  return (
    <main className="purchase-page">
      <header className="purchase-header">
        <div className="purchase-title-group">
          <BrandLogo alt="JASLYN NET" />
          <div>
            <div className="eyebrow">COMMERCIAL OPERATIONS</div>
            <h1>Purchases & Access</h1>
            <p>One place to trace the purchase, confirm settlement and verify the resulting network access.</p>
          </div>
        </div>
        <button className="refresh-button" type="button" onClick={() => void load()} disabled={loading}>
          <span aria-hidden="true">↻</span>
          {loading ? 'Refreshing' : 'Refresh'}
        </button>
      </header>

      <section className="purchase-overview">
        <div className="overview-copy">
          <span className="section-label">OPERATIONS LEDGER</span>
          <strong>{metrics.total.toLocaleString()} purchase records</strong>
          <p>Payment state and access state stay visible together so an operator can see what happened before changing anything.</p>
        </div>
        <div className="overview-facts">
          <div><span>Enabled methods</span><strong>{providers.length}</strong></div>
          <div><span>Open settlement queue</span><strong>{metrics.pending}</strong></div>
          <div><span>Active access</span><strong>{metrics.active}</strong></div>
        </div>
      </section>

      {error && (
        <div className="operation-error" role="alert">
          <span aria-hidden="true">!</span>
          <div>
            <strong>Action not completed</strong>
            <p>{error}</p>
          </div>
        </div>
      )}

      <section className="purchase-stats" aria-label="Purchase metrics">
        <article>
          <span>Total purchases</span>
          <strong>{metrics.total.toLocaleString()}</strong>
          <small>all records returned</small>
        </article>
        <article>
          <span>Paid</span>
          <strong>{metrics.paid.toLocaleString()}</strong>
          <small>settled successfully</small>
        </article>
        <article>
          <span>Pending</span>
          <strong>{metrics.pending.toLocaleString()}</strong>
          <small>awaiting settlement</small>
        </article>
        <article>
          <span>Failed / canceled</span>
          <strong>{metrics.failed.toLocaleString()}</strong>
          <small>not active from payment state</small>
        </article>
        <article className="stat-value">
          <span>Paid value</span>
          <strong>{metrics.currency ? money(metrics.value, metrics.currency) : metrics.currencies > 1 ? `${metrics.currencies} currencies` : '—'}</strong>
          <small>paid and successful records</small>
        </article>
      </section>

      <section className="purchase-workspace">
        <article className="ledger-surface">
          <div className="surface-header">
            <div>
              <span className="section-label">PURCHASE LEDGER</span>
              <h2>Customer transactions</h2>
              <p>Select a row to inspect its lifecycle and settlement context.</p>
            </div>
            <span className="surface-count">{filteredRows.length} shown</span>
          </div>

          <div className="ledger-controls">
            <label className="search-field">
              <span aria-hidden="true">⌕</span>
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search customer, package, transaction or provider"
                aria-label="Search purchases"
              />
            </label>
            <div className="status-tabs" role="tablist" aria-label="Purchase status">
              {[
                ['ALL', 'All'],
                ['PENDING_PAYMENT', 'Pending'],
                ['PAID', 'Paid'],
                ['ACTIVE', 'Active'],
                ['FAILED', 'Failed'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === value}
                  className={statusFilter === value ? 'active' : ''}
                  onClick={() => setStatusFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              className="clear-button"
              type="button"
              onClick={() => {
                setQuery('');
                setStatusFilter('ALL');
              }}
              disabled={!query && statusFilter === 'ALL'}
            >
              Clear
            </button>
          </div>

          {loading ? (
            <div className="ledger-state">Loading purchase records…</div>
          ) : rows.length === 0 ? (
            <div className="ledger-state empty">
              <strong>No purchases yet</strong>
              <p>New customer purchases will appear here.</p>
              <a href="/packages">Open Plans & Products</a>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="ledger-state empty">
              <strong>No matching records</strong>
              <p>Clear the current search or status filter.</p>
              <button type="button" onClick={() => { setQuery(''); setStatusFilter('ALL'); }}>Clear filters</button>
            </div>
          ) : (
            <div className="purchase-table-wrap">
              <table className="purchase-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Service</th>
                    <th>Amount</th>
                    <th>Payment</th>
                    <th>Access</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map(row => (
                    <tr
                      key={row.id}
                      className={selectedId === row.id ? 'selected' : ''}
                      onClick={() => setSelectedId(row.id)}
                      tabIndex={0}
                      onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedId(row.id);
                        }
                      }}
                    >
                      <td>
                        <strong>{row.customerName}</strong>
                        <small>{row.customerId.slice(0, 12)}…</small>
                      </td>
                      <td>
                        <strong>{row.packageName}</strong>
                        <small>{row.provider ? statusLabel(row.provider) : 'Provider not recorded'}</small>
                      </td>
                      <td><strong>{money(Number(row.price), row.currency)}</strong></td>
                      <td><span className={`status status-${upper(row.status).toLowerCase()}`}>{statusLabel(row.status)}</span></td>
                      <td><span className={`access access-${upper(row.accessStatus ?? '').toLowerCase()}`}><i />{accessText(row)}</span></td>
                      <td>{date(row.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
              <div className="mobile-list">
                {filteredRows.map(row => (
                  <button
                    key={row.id}
                    type="button"
                    className="mobile-purchase"
                    onClick={() => setSelectedId(row.id)}
                  >
                    <span aria-hidden="true">▱</span>
                    <span className="mobile-purchase-copy">
                      <strong>{row.packageName}</strong>
                      <small>{row.customerName} · {money(Number(row.price), row.currency)}</small>
                    </span>
                    <span className={`status status-${upper(row.status).toLowerCase()}`}>{statusLabel(row.status)}</span>
                  </button>
                ))}
              </div>
          )}
        </article>

        <aside className="settlement-surface">
          <div className="surface-header compact">
            <div>
              <span className="section-label">SETTLEMENT WORKSPACE</span>
              <h2>{selected ? 'Selected purchase' : 'Select a purchase'}</h2>
              <p>{selected ? `${selected.customerName} · ${selected.packageName}` : 'Choose a ledger row before changing payment state.'}</p>
            </div>
          </div>

          {selected ? (
            <>
              <div className="purchase-identity">
                <div>
                  <span>Purchase ID</span>
                  <strong>{selected.id}</strong>
                </div>
                <span className={`status status-${upper(selected.status).toLowerCase()}`}>{statusLabel(selected.status)}</span>
              </div>

              <div className="amount-band">
                <span>Purchase amount</span>
                <strong>{money(Number(selected.price), selected.currency)}</strong>
              </div>

              <div className="lifecycle">
                <div className="lifecycle-step done"><span>01</span><div><strong>Purchase created</strong><small>{date(selected.createdAt)}</small></div></div>
                <div className={`lifecycle-step ${['PAID','SUCCESS','ACTIVE'].includes(upper(selected.status)) ? 'done' : 'current'}`}><span>02</span><div><strong>Payment settled</strong><small>{selected.provider ? statusLabel(selected.provider) : 'Provider not recorded'}</small></div></div>
                <div className={`lifecycle-step ${upper(selected.accessStatus) === 'ACTIVE' || upper(selected.status) === 'ACTIVE' ? 'done' : ''}`}><span>03</span><div><strong>Network access</strong><small>{accessText(selected)}{selected.endsAt ? ` · until ${date(selected.endsAt)}` : ''}</small></div></div>
              </div>

              <div className="provider-section">
                <div className="field-heading">
                  <span>Payment method</span>
                  <small>Enabled methods only</small>
                </div>
                <div className="provider-list" role="radiogroup" aria-label="Payment method">
                  {providers.map(item => (
                    <button
                      key={item.code}
                      type="button"
                      role="radio"
                      aria-checked={provider === item.code}
                      className={`provider-row ${provider === item.code ? 'active' : ''}`}
                      onClick={() => setProvider(item.code)}
                      disabled={saving}
                    >
                      <span className={`provider-mark ${item.tone}`}><ProviderLogo provider={item} /></span>
                      <span className="provider-copy">
                        <strong>{item.name}</strong>
                        <small>{showProviderSubtitles ? item.subtitle : 'Configured'}</small>
                      </span>
                      {provider === item.code && <span className="provider-selected">Selected</span>}
                    </button>
                  ))}
                </div>
              </div>

              <label className="reference-field">
                <span>Provider reference</span>
                <input
                  value={reference}
                  onChange={event => setReference(event.target.value)}
                  placeholder="e.g. transaction reference"
                  minLength={2}
                  maxLength={160}
                  disabled={saving}
                />
              </label>

              <div className="settlement-actions">
                <button type="button" className="secondary-action" disabled={saving} onClick={() => void settle('FAILED')}>
                  Mark failed
                </button>
                <button type="button" className="primary-action" disabled={saving} onClick={() => void settle('SUCCESS')}>
                  {saving ? 'Saving…' : 'Confirm paid'}
                </button>
              </div>

              <div className="settlement-note">
                <strong>Settlement guard</strong>
                <span>Manual settlement is the operator path. External providers must complete their authenticated webhook verification flow.</span>
              </div>
            </>
          ) : (
            <div className="selection-empty">
              <div className="selection-line" />
              <strong>Nothing selected</strong>
              <p>Click any purchase in the ledger to inspect it here. No payment state is changed until you explicitly confirm it.</p>
            </div>
          )}
        </aside>
      </section>

      {selected && (
        <section className="detail-strip">
          <div>
            <span className="section-label">SELECTED RECORD</span>
            <strong>{selected.customerName}</strong>
            <p>{selected.packageName} · {selected.id}</p>
          </div>
          <div><span>Router</span><strong>{selected.routerId || 'Not assigned'}</strong></div>
          <div><span>Starts</span><strong>{date(selected.startsAt)}</strong></div>
          <div><span>Expires</span><strong>{date(selected.endsAt)}</strong></div>
          <div><span>Access</span><strong>{accessText(selected)}</strong></div>
          <button type="button" onClick={() => setSelectedId('')}>Close selection</button>
        </section>
      )}
    </main>
  );
}
