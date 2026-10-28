'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiFetch } from '../../lib/api';
import { getAccessToken } from '../../lib/auth';
import './upesilipa.css';

type Metric = { label: string; value: string; detail: string; href: string; tone: string };
type Overview = { kpis?: { activeCustomers?: number; monthlyRevenue?: number; onlineSessions?: number }; network?: { totalRouters?: number; online?: number }; tenant?: { currency?: string } };
type CountResponse = { pagination?: { total?: number }; data?: unknown[] };

const modules = [
  { title: 'Sites & routers', detail: 'Connect access points, monitor reachability and manage locations.', href: '/network', icon: '⌁', group: 'Network operations' },
  { title: 'Router setup', detail: 'Use guided MikroTik, RADIUS and device onboarding workflows.', href: '/access-network', icon: '⌘', group: 'Network operations' },
  { title: 'Live sessions', detail: 'See connected customers, usage, expiry and active access.', href: '/sessions', icon: '◉', group: 'Network operations' },
  { title: 'Packages', detail: 'Create time and data plans customers can buy from your portal.', href: '/packages', icon: '◒', group: 'Revenue engine' },
  { title: 'Customers', detail: 'Manage subscribers, access profiles and account history.', href: '/customers', icon: '◎', group: 'Revenue engine' },
  { title: 'Vouchers', detail: 'Issue, search and track prepaid WiFi access codes.', href: '/vouchers', icon: '▤', group: 'Revenue engine' },
  { title: 'Sales & payments', detail: 'Follow payment status, provider readiness and revenue.', href: '/payments', icon: '◌', group: 'Revenue engine' },
  { title: 'Purchases', detail: 'Review package orders and customer payment activity.', href: '/purchases', icon: '▥', group: 'Revenue engine' },
  { title: 'Captive portal', detail: 'Publish the branded payment and login experience customers use.', href: '/captive-portal/manage', icon: '✦', group: 'Customer experience' },
  { title: 'Customer portal', detail: 'Give customers a clear place to access services and support.', href: '/customer-portal', icon: '◈', group: 'Customer experience' },
  { title: 'Promotions', detail: 'Create offers and campaigns that help fill your network.', href: '/promotions', icon: '＋', group: 'Customer experience' },
  { title: 'Finance & audit', detail: 'Move from raw activity to operational and finance decisions.', href: '/finance', icon: '▦', group: 'Control centre' },
  { title: 'Automation', detail: 'Build repeatable actions for routine network operations.', href: '/automation', icon: '↻', group: 'Control centre' },
  { title: 'Integrations', detail: 'Connect payment, communication and network services.', href: '/integrations', icon: '⊕', group: 'Control centre' },
  { title: 'Payment gateways', detail: 'Prepare mobile-money and payment provider connections for direct collections.', href: '/platform-integrations', icon: '₿', group: 'Control centre' },
  { title: 'Branding & portal themes', detail: 'Shape your logo, colors, support details and customer-facing portal style.', href: '/captive-portal/manage', icon: '✧', group: 'Customer experience' },
  { title: 'Plans & subscription', detail: 'Review workspace plan limits, billing status and upgrade options.', href: '/dashboard/platform-subscription', icon: '▣', group: 'Control centre' },
  { title: 'Hardware & RADIUS', detail: 'Use MikroTik, Omada, UniFi, Cambium and standards-based RADIUS hardware.', href: '/architecture', icon: '⌂', group: 'Network operations' },
  { title: 'Support & help', detail: 'Find setup guidance, frequently asked questions and operator support paths.', href: '/faq', icon: '?', group: 'Customer experience' },
  { title: 'Latest releases', detail: 'Follow new Jaslyn Net and UpesiLipa capabilities as they ship.', href: '/releases', icon: '↗', group: 'Control centre' },
  { title: 'Team & settings', detail: 'Control access, billing, integrations and workspace policy.', href: '/settings', icon: '◫', group: 'Control centre' },
];

function number(value: number | undefined) { return new Intl.NumberFormat('en-US').format(value ?? 0); }

const moduleGroups = Array.from(new Set(modules.map((module) => module.group)));

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
    <section className="upesilipa-section"><div className="upesilipa-section-head"><div><span className="upesilipa-kicker">FEATURE SURFACE</span><h2>Everything UpesiLipa operators need</h2><p>Core selling, network, customer experience and control workflows are available in Jaslyn Net with live tenant-scoped data.</p></div><a href="/dashboard">Back to overview ↗</a></div><div className="upesilipa-groups">{moduleGroups.map((group) => <div className="upesilipa-group" key={group}><div className="upesilipa-group-heading"><span>{group}</span><small>{modules.filter((module) => module.group === group).length} capabilities</small></div><div className="upesilipa-module-grid">{modules.filter((module) => module.group === group).map((module) => <a className="upesilipa-module" href={module.href} key={module.title}><span className="upesilipa-module-icon" aria-hidden="true">{module.icon}</span><span><strong>{module.title}</strong><small>{module.detail}</small></span><span className="upesilipa-arrow" aria-hidden="true">↗</span></a>)}</div></div>)}</div></section>
    <section className="upesilipa-section upesilipa-secondary"><div className="upesilipa-section-head"><div><span className="upesilipa-kicker">LIVE API COUNTS</span><h2>Operational inventory</h2></div></div><div className="upesilipa-inventory">{metrics.slice(4).map((metric) => <a href={metric.href} key={metric.label}><span>{metric.label}</span><strong>{loading ? '—' : metric.value}</strong><small>{metric.detail}</small></a>)}</div></section>
    <footer className="upesilipa-footer"><span>JASLYN NET · UpesiLipa workspace</span><span>Live tenant data only</span></footer>
  </main>;
}
