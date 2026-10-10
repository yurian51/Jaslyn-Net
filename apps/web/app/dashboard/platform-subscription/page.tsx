'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../../../lib/api';
import { getAccessToken } from '../../../lib/auth';
import './platform-subscription.css';

type Plan = {
  id: string; code: string; name: string; description: string | null; price: string;
  currency: string; billingInterval: 'MONTH' | 'YEAR'; maxRouters: number | null;
  maxSites: number | null; maxCustomers: number | null;
};
type Current = {
  id: string; status: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED';
  startsAt: string; currentPeriodStart: string; currentPeriodEnd: string; cancelAtPeriodEnd: boolean;
  planId: string; planCode: string; planName: string; planDescription: string | null;
  planPrice: string; planCurrency: string; billingInterval: 'MONTH' | 'YEAR';
  maxRouters: number | null; maxSites: number | null; maxCustomers: number | null;
};
const fmtMoney = (amount: string, currency: string) => new Intl.NumberFormat('en-TZ', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(amount));
const fmtDate = (value?: string) => value ? new Intl.DateTimeFormat('en-TZ', { dateStyle: 'medium' }).format(new Date(value)) : '—';
const limit = (value: number | null) => value == null ? 'No limit stated' : value.toLocaleString('en-TZ');

export default function PlatformSubscriptionPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [current, setCurrent] = useState<Current | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshed, setRefreshed] = useState('');

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) { setError('Please sign in to view this workspace subscription.'); setLoading(false); return; }
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [catalogue, subscription] = await Promise.all([
        apiFetch<{ data: Plan[] }>('/platform-subscriptions/plans', { headers }),
        apiFetch<{ data: Current | null }>('/platform-subscriptions/current', { headers }),
      ]);
      setPlans(catalogue.data ?? []);
      setCurrent(subscription.data);
      setError('');
      setRefreshed(new Date().toISOString());
    } catch (cause) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Unable to load subscription information.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <main className="platform-subscription">
      <header className="platform-subscription-header">
        <div><span className="platform-eyebrow">JASLYN NET / WORKSPACE BILLING</span><h1>Platform subscription</h1>
          <p>This subscription is what your WiFi business pays for using JASLYN NET. It is different from internet bundles your customers buy.</p></div>
        <button type="button" onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh status'}</button>
      </header>

      {error && <div className="platform-alert" role="alert"><strong>Could not refresh subscription</strong><span>{error}</span></div>}

      {loading && !current && <section className="platform-empty" aria-live="polite"><div className="platform-spinner" /><strong>Loading verified subscription data</strong><span>Plans and billing status are read from the platform API.</span></section>}

      {!loading && current && <section className="platform-current" aria-label="Current platform subscription">
        <div className="platform-current-top"><div><span className="platform-eyebrow">CURRENT WORKSPACE PLAN</span><h2>{current.planName}</h2><p>{current.planDescription || 'Platform subscription assigned to this workspace.'}</p></div><span className={`platform-status status-${current.status.toLowerCase()}`}>{current.status.replace('_', ' ')}</span></div>
        <div className="platform-current-price"><strong>{fmtMoney(current.planPrice, current.planCurrency)}</strong><span>per {current.billingInterval === 'YEAR' ? 'year' : 'month'}</span></div>
        <div className="platform-limits">
          <div><strong>{limit(current.maxRouters)}</strong><span>Routers</span></div>
          <div><strong>{limit(current.maxSites)}</strong><span>Sites / locations</span></div>
          <div><strong>{limit(current.maxCustomers)}</strong><span>Customers</span></div>
        </div>
        <div className="platform-period"><span>Period starts <b>{fmtDate(current.currentPeriodStart)}</b></span><span>Period ends <b>{fmtDate(current.currentPeriodEnd)}</b></span></div>
        {current.cancelAtPeriodEnd && <p className="platform-cancel-note">Cancellation is scheduled for the end of this billing period.</p>}
      </section>}

      {!loading && !current && !error && <section className="platform-empty">
        <div className="platform-empty-mark">↗</div><h2>No platform subscription assigned</h2>
        <p>This workspace does not currently have a subscription record. Your WiFi customer packages remain a separate catalogue.</p>
      </section>}

      <section className="platform-catalogue-section">
        <div className="platform-section-heading"><div><span className="platform-eyebrow">AVAILABLE TO WORKSPACES</span><h2>Platform plans</h2></div><span>{plans.length} active {plans.length === 1 ? 'plan' : 'plans'}</span></div>
        {loading && plans.length === 0 ? <div className="platform-plans-grid"><div className="platform-plan-skeleton" /><div className="platform-plan-skeleton" /></div> :
          plans.length === 0 && error ? <div className="platform-catalogue-empty" role="status"><strong>Platform plans are temporarily unavailable.</strong><p>We could not confirm the catalogue from the API. Refresh to retry; no plan or price has been assumed.</p></div> :
          plans.length === 0 ? <div className="platform-catalogue-empty"><strong>Platform pricing has not been published yet.</strong><p>We do not display guessed prices. Once active SaaS plans are configured by the platform operator, their real prices and limits will appear here.</p></div> :
          <div className="platform-plans-grid">{plans.map(plan => <article className="platform-plan-card" key={plan.id}>
            <div className="platform-plan-code">{plan.code}</div><h3>{plan.name}</h3><p>{plan.description || 'JASLYN NET platform access plan.'}</p>
            <div className="platform-plan-price"><strong>{fmtMoney(plan.price, plan.currency)}</strong><span>/ {plan.billingInterval === 'YEAR' ? 'year' : 'month'}</span></div>
            <ul><li><span>Routers</span><b>{limit(plan.maxRouters)}</b></li><li><span>Sites / locations</span><b>{limit(plan.maxSites)}</b></li><li><span>Customers</span><b>{limit(plan.maxCustomers)}</b></li></ul>
            <small className="platform-plan-note">Contact your JASLYN NET platform administrator to change plans. Self-service checkout is not enabled on this screen.</small>
          </article>)}</div>}
      </section>
      {refreshed && <p className="platform-refresh-time">Last successful refresh: {fmtDate(refreshed)} · Prices and limits are API-backed.</p>}
    </main>
  );
}
