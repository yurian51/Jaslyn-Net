'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiFetch } from '../../lib/api';
import { getAccessToken } from '../../lib/auth';
import './upesilipa.css';

type Metric = { label: string; value: string; detail: string; href: string; tone: string };
type Overview = { kpis?: { activeCustomers?: number; monthlyRevenue?: number; onlineSessions?: number }; network?: { totalRouters?: number; online?: number }; tenant?: { currency?: string } };
type CountResponse = { pagination?: { total?: number }; data?: unknown[] };

const modules = [
  { title: 'Sites & routers', detail: 'Connect access points, monitor reachability and manage locations.', href: '/network', icon: '⌁' },
  { title: 'Packages', detail: 'Create time and data plans customers can buy from your portal.', href: '/packages', icon: '◒' },
  { title: 'Customers', detail: 'Manage subscribers, access profiles and account history.', href: '/customers', icon: '◎' },
  { title: 'Vouchers', detail: 'Issue, search and track prepaid WiFi access codes.', href: '/vouchers', icon: '▤' },
  { title: 'Sales & payments', detail: 'Follow payment status, provider readiness and revenue.', href: '/payments', icon: '◌' },
  { title: 'Reports', detail: 'Move from raw activity to operational and finance decisions.', href: '/reports', icon: '▥' },
  { title: 'Portal branding', detail: 'Shape the captive portal customers see before they connect.', href: '/portal-branding', icon: '✦' },
  { title: 'Team & settings', detail: 'Control access, billing, integrations and workspace policy.', href: '/settings', icon: '◫' },
];

function number(value: number | undefined) { return new Intl.NumberFormat('en-US').format(value ?? 0); }

export default function UpesiLipaHub() {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) { setError('Authentication required.'); setLoading(false); return; }
    setLoading(true); setError(null);
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const [overview, customers, vouchers, payments] = await Promise.all([
        apiFetch<Overview>('/overview', { headers }),
        apiFetch<CountResponse>('/customers?page=1&limit=1', { headers }),
        apiFetch<CountResponse>('/vouchers?page=1&limit=1', { headers }),
        apiFetch<CountResponse>('/payments?page=1&limit=1', { headers }),
      ]);
      const currency = overview.tenant?.currency ?? 'TZS';
      setMetrics([
        { label: 'Active customers', value: number(overview.kpis?.activeCustomers), detail: 'subscriber accounts', href: '/customers', tone: 'mint' },
        { label: 'Online now', value: number(overview.kpis?.onlineSessions), detail: 'live sessions', href: '/sessions', tone: 'blue' },
        { label: 'Network', value: `${number(overview.network?.online)} / ${number(overview.network?.totalRouters)}`, detail: 'routers online', href: '/network', tone: 'violet' },
        { label: 'Monthly revenue', value: `${currency} ${number(overview.kpis?.monthlyRevenue)}`, detail: 'verified overview total', href: '/payments', tone: 'amber' },
        { label: 'Customer records', value: number(customers.pagination?.total ?? customers.data?.length), detail: 'from customer API', href: '/customers', tone: 'slate' },
        { label: 'Voucher records', value: number(vouchers.pagination?.total ?? vouchers.data?.length), detail: 'from voucher API', href: '/vouchers', tone: 'slate' },
        { label: 'Payment records', value: number(payments.pagination?.total ?? payments.data?.length), detail: 'from payment API', href: '/payments', tone: 'slate' },
      ]);
    } catch (cause) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Unable to load UpesiLipa workspace data.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return <main className="upesilipa-page">
    <header className="upesilipa-hero">
      <div><span className="upesilipa-kicker">JASLYN NET · UPESILIPA WORKSPACE</span><h1>Run your WiFi business from one calm workspace.</h1><p>Everything operators need to connect routers, sell access, support customers and understand revenue — built on Jaslyn Net&apos;s tenant-scoped APIs.</p></div>
      <div className="upesilipa-hero-actions"><button type="button" onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh data'}</button><a href="/captive-portal/manage">Open captive portal</a></div>
    </header>
    {error ? <div className="upesilipa-error" role="alert">{error}</div> : null}
    <section className="upesilipa-metrics" aria-label="Workspace metrics">{metrics.slice(0, 4).map((metric) => <a className={`upesilipa-metric ${metric.tone}`} href={metric.href} key={metric.label}><span>{metric.label}</span><strong>{loading ? '—' : metric.value}</strong><small>{metric.detail}</small></a>)}</section>
    <section className="upesilipa-section"><div className="upesilipa-section-head"><div><span className="upesilipa-kicker">FEATURE SURFACE</span><h2>Build the business around the connection</h2><p>These modules map the core UpesiLipa workflows into Jaslyn Net without introducing demo data.</p></div><a href="/dashboard">Back to overview ↗</a></div><div className="upesilipa-module-grid">{modules.map((module) => <a className="upesilipa-module" href={module.href} key={module.title}><span className="upesilipa-module-icon" aria-hidden="true">{module.icon}</span><span><strong>{module.title}</strong><small>{module.detail}</small></span><span className="upesilipa-arrow" aria-hidden="true">↗</span></a>)}</div></section>
    <section className="upesilipa-section upesilipa-secondary"><div className="upesilipa-section-head"><div><span className="upesilipa-kicker">LIVE API COUNTS</span><h2>Operational inventory</h2></div></div><div className="upesilipa-inventory">{metrics.slice(4).map((metric) => <a href={metric.href} key={metric.label}><span>{metric.label}</span><strong>{loading ? '—' : metric.value}</strong><small>{metric.detail}</small></a>)}</div></section>
    <footer className="upesilipa-footer"><span>JASLYN NET · UpesiLipa workspace</span><span>Live tenant data only</span></footer>
  </main>;
}
