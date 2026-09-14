'use client';

import { useEffect, useMemo, useState } from 'react';
import { getAccessToken } from '../../lib/auth';
import { apiFetch } from '../../lib/api';

type Overview = {
  tenant?: { currency?: string };
  revenueSeries?: number[];
  kpis?: {
    monthlyRevenue?: number;
    activeCustomers?: number;
    onlineSessions?: number;
    networkAvailability?: number | null;
    paymentFailures?: number;
  };
  network?: { totalRouters?: number; online?: number; degraded?: number; offline?: number };
  sessions?: Array<{
    customer?: string;
    location?: string;
    router?: string;
    plan?: string;
    ip_address?: string;
    duration?: string;
    status?: string;
  }>;
  locations?: Array<{
    name?: string;
    routers?: number;
    activeUsers?: number;
    onlineRouters?: number;
    revenue?: number;
  }>;
};

const nav = [
  ['Overview', '⌂', '/dashboard'],
  ['Customers', '◉', '/customers'],
  ['Plans & Products', '▣', '/packages'],
  ['Sessions', '◌', '/sessions'],
  ['Purchases', '₮', '/purchases'],
  ['Network', '⌁', '/network'],
  ['Security & Audit', '◈', '/audit'],
] as const;

const operationalAreas = [
  { title: 'Customers', description: 'Subscriber accounts and identity', href: '/customers', icon: '◉' },
  { title: 'Plans & Products', description: 'WiFi packages and service policy', href: '/packages', icon: '▣' },
  { title: 'Sessions', description: 'Active connections and traffic', href: '/sessions', icon: '◌' },
  { title: 'Purchases', description: 'Customer purchase records', href: '/purchases', icon: '₮' },
  { title: 'Network', description: 'Routers and connectivity health', href: '/network', icon: '⌁' },
  { title: 'Security & Audit', description: 'Tenant operational event trail', href: '/audit', icon: '◈' },
] as const;

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatMoney(currency: string, value: number) {
  return `${currency} ${formatNumber(value)}`;
}

export default function DashboardPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;

    apiFetch<Overview>('/overview', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(setOverview)
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : 'Unable to load dashboard data.');
      });
  }, []);

  const currency = overview?.tenant?.currency ?? 'TZS';
  const revenueValues = overview?.revenueSeries ?? [];
  const maxRevenue = Math.max(...revenueValues, 0);
  const revenueBars = revenueValues.length
    ? revenueValues.map((value) => (maxRevenue ? Math.max(5, (value / maxRevenue) * 100) : 0))
    : [];
  const monthlyRevenue = overview?.kpis?.monthlyRevenue ?? 0;
  const activeCustomers = overview?.kpis?.activeCustomers ?? 0;
  const onlineSessions = overview?.kpis?.onlineSessions ?? 0;
  const availability = overview?.kpis?.networkAvailability;
  const network = {
    totalRouters: 0,
    online: 0,
    degraded: 0,
    offline: 0,
    ...overview?.network,
  };
  const liveSessions = overview?.sessions ?? [];
  const availabilityLabel = availability == null ? 'N/A' : `${availability}%`;
  const attentionCount = (overview?.kpis?.paymentFailures ?? 0) + network.degraded;
  const liveDataLabel = overview ? 'LIVE DATA' : loadError ? 'API UNAVAILABLE' : 'CONSOLE READY';

  const revenueSummary = useMemo(() => {
    if (!revenueValues.length) return 'No revenue series returned by the tenant API.';
    const total = revenueValues.reduce((sum, value) => sum + value, 0);
    return `${formatMoney(currency, total)} across ${revenueValues.length} reported periods`;
  }, [currency, revenueValues]);

  return (
    <main className="app-shell dashboard-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">J</div>
          <div><span>JASLYN NET</span><small>Network operations platform</small></div>
        </div>
        <div className="workspace-switch"><span className="workspace-dot" /> Global Workspace <span>⌄</span></div>
        <nav className="nav" aria-label="Jaslyn Net operations">
          <p className="nav-section">OPERATIONS</p>
          {nav.map(([item, icon, href]) => (
            <a key={item} href={href} className={item === 'Overview' ? 'nav-item active' : 'nav-item'} aria-current={item === 'Overview' ? 'page' : undefined}>
              <span className="nav-icon">{icon}</span><span>{item}</span>
            </a>
          ))}
        </nav>
        <div className="sidebar-status">
          <span className="pulse" />
          <div><strong>{liveDataLabel}</strong><small>{overview ? 'Tenant overview loaded' : loadError ?? 'Dashboard available for inspection'}</small></div>
        </div>
        <div className="profile"><div className="avatar">J</div><div><strong>JASLYN NET</strong><small>Tenant workspace</small></div><span className="profile-more">•••</span></div>
      </aside>

      <section className="content">
        <header className="topbar dashboard-topbar">
          <div className="topbar-copy">
            <div className="eyebrow">JASLYN NET / OPERATIONS</div>
            <h1>Business overview</h1>
            <p className="context">Customers, plans, purchases, sessions and network operations in one console.</p>
          </div>
          <div className="top-actions">
            <span className="data-state"><i /> {liveDataLabel}</span>
            <div className="avatar small-avatar">J</div>
          </div>
        </header>

        {loadError && <div className="error-banner" role="alert">{loadError}</div>}
        {!overview && !loadError && <div className="inspection-banner"><strong>Development inspection mode</strong><span>Dashboard structure is available without fabricated tenant metrics. Live values appear when an authenticated API session is present.</span></div>}

        <section className="kpi-grid dashboard-kpis" aria-label="Business metrics">
          <article className="kpi"><div className="kpi-label"><span>Monthly revenue</span><b>01</b></div><strong>{formatMoney(currency, monthlyRevenue)}</strong><div className="kpi-foot"><span>{overview ? 'LIVE' : '—'}</span><small>{overview ? 'current tenant period' : 'awaiting live tenant data'}</small></div></article>
          <article className="kpi"><div className="kpi-label"><span>Active customers</span><b>02</b></div><strong>{formatNumber(activeCustomers)}</strong><div className="kpi-foot"><span>{overview ? 'LIVE' : '—'}</span><small>customer accounts</small></div></article>
          <article className="kpi"><div className="kpi-label"><span>Online sessions</span><b>03</b></div><strong>{formatNumber(onlineSessions)}</strong><div className="kpi-foot"><span>{overview ? 'LIVE' : '—'}</span><small>currently connected</small></div></article>
          <article className="kpi"><div className="kpi-label"><span>Network availability</span><b>04</b></div><strong>{availabilityLabel}</strong><div className="kpi-foot"><span>{overview ? 'LIVE' : '—'}</span><small>{network.totalRouters} registered routers</small></div></article>
        </section>

        <section className="hero-grid">
          <article className="panel revenue-panel">
            <div className="panel-head">
              <div><div className="panel-kicker">COMMERCIAL PERFORMANCE</div><h2>Revenue performance</h2><p>Successful payment value returned by the tenant overview.</p></div>
              <span className="panel-badge">{overview ? 'LIVE' : 'NO LIVE DATA'}</span>
            </div>
            <div className="revenue-total"><strong>{formatMoney(currency, monthlyRevenue)}</strong><small>{revenueSummary}</small></div>
            <div className="chart" aria-label="Revenue performance chart">
              <div className="chart-scale"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div>
              <div className="chart-body">
                <div className="grid-line g1" /><div className="grid-line g2" /><div className="grid-line g3" /><div className="grid-line g4" />
                {revenueBars.length ? <div className="bars">{revenueBars.map((height, index) => <span style={{ height: `${height}%` }} key={index} aria-label={`Revenue period ${index + 1}`} />)}</div> : <div className="chart-empty"><strong>No series available</strong><span>Connect an authenticated tenant session to render real revenue history.</span></div>}
              </div>
            </div>
          </article>

          <article className="panel health-panel">
            <div className="panel-kicker">NETWORK HEALTH</div>
            <h2>Infrastructure status</h2>
            <p>{network.totalRouters} registered router{network.totalRouters === 1 ? '' : 's'} in this tenant.</p>
            <div className="health-ring" style={{ '--availability': `${Math.min(Math.max(Number(availability ?? 0), 0), 100)}%` } as React.CSSProperties}>
              <div><strong>{availabilityLabel}</strong><span>availability</span></div>
            </div>
            <div className="health-stats">
              <div><span className="health-dot online" /><strong>{network.online}</strong><small>Operational</small></div>
              <div><span className="health-dot warn" /><strong>{network.degraded}</strong><small>Attention</small></div>
              <div><span className="health-dot down" /><strong>{network.offline}</strong><small>Offline</small></div>
            </div>
            <a className="full-button" href="/network">Open network operations <span>→</span></a>
          </article>
        </section>

        <section className="content-grid dashboard-lower-grid">
          <article className="panel locations-panel">
            <div className="panel-head"><div><div className="panel-kicker">MULTI-SITE OPERATIONS</div><h2>Regional performance</h2><p>Location-level subscriber and revenue data returned by the API.</p></div><a className="text-link" href="/network">Network →</a></div>
            {overview?.locations?.length ? <div className="location-table">
              <div className="location-header"><span>LOCATION</span><span>ROUTERS</span><span>SUBSCRIBERS</span><span>REVENUE</span><span>UPTIME</span></div>
              {overview.locations.map((row, index) => {
                const name = row.name ?? 'Unknown';
                const routers = row.routers ?? 0;
                const uptime = routers ? Math.round(((row.onlineRouters ?? 0) / routers) * 10000) / 100 : null;
                return <div className="location-row" key={`${name}-${index}`}><div className="region"><span className="region-code">{name.slice(0, 2).toUpperCase()}</span><strong>{name}</strong></div><span>{routers}</span><span>{formatNumber(row.activeUsers ?? 0)}</span><strong>{typeof row.revenue === 'number' ? formatMoney(currency, row.revenue) : '—'}</strong><span className="uptime">● {uptime == null ? 'N/A' : `${uptime}%`}</span></div>;
              })}
            </div> : <div className="module-empty"><strong>No location data returned</strong><span>{overview ? 'The tenant has no location records in the overview response.' : 'Live regional data is intentionally not fabricated.'}</span><a href="/network">Inspect network inventory →</a></div>}
          </article>

          <article className="panel attention-panel">
            <div className="panel-head"><div><div className="panel-kicker">OPERATIONS SIGNALS</div><h2>Attention required</h2><p>Only API-backed operational conditions are shown.</p></div><span className="alert-count">{attentionCount}</span></div>
            {overview?.kpis?.paymentFailures ? <a className="attention-item" href="/purchases"><span className="severity critical" /><div><strong>Payment failures detected</strong><small>{overview.kpis.paymentFailures} failed attempts · current period</small></div><span>›</span></a> : null}
            {network.degraded > 0 ? <a className="attention-item" href="/network"><span className="severity warning" /><div><strong>Network devices need review</strong><small>{network.degraded} router{network.degraded === 1 ? '' : 's'} in degraded state</small></div><span>›</span></a> : null}
            {!overview || attentionCount === 0 ? <div className="module-empty compact"><strong>{overview ? 'No critical signals returned' : 'No live signals yet'}</strong><span>{overview ? 'The current tenant overview has no payment failures or degraded routers.' : 'Connect live tenant data to surface operational exceptions.'}</span></div> : null}
            <a className="full-button" href="/audit">Review security &amp; audit <span>→</span></a>
          </article>
        </section>

        <section className="panel operations-panel">
          <div className="panel-head"><div><div className="panel-kicker">ACTUAL CONSOLE MODULES</div><h2>Operate the business</h2><p>These links map directly to the implemented Jaslyn Net routes, not a wish list disguised as a dashboard.</p></div></div>
          <div className="operations-grid">
            {operationalAreas.map((area) => <a className="operation-card" href={area.href} key={area.href}><span className="operation-icon">{area.icon}</span><div><strong>{area.title}</strong><small>{area.description}</small></div><span className="operation-arrow">→</span></a>)}
          </div>
        </section>

        <section className="panel sessions-panel dashboard-sessions">
          <div className="panel-head"><div><div className="panel-kicker">LIVE NETWORK</div><h2>Active sessions</h2><p>{formatNumber(onlineSessions)} users currently connected.</p></div><div className="session-actions"><span className="live-pill"><i /> LIVE</span><a className="outline-button" href="/sessions">View sessions →</a></div></div>
          <div className="table-wrap">
            <table><thead><tr>{['Customer', 'Location', 'Gateway', 'Plan', 'IP address', 'Duration', 'Status'].map((heading) => <th key={heading}>{heading}</th>)}</tr></thead>
              <tbody>{liveSessions.map((row, index) => <tr key={`${row.customer ?? 'unknown'}-${row.ip_address ?? 'unknown'}-${index}`}><td>{row.customer ?? '—'}</td><td>{row.location ?? '—'}</td><td>{row.router ?? '—'}</td><td>{row.plan ?? '—'}</td><td>{row.ip_address ?? '—'}</td><td>{row.duration ?? '—'}</td><td><span className={`status ${(row.status ?? 'UNKNOWN').toLowerCase()}`}><i /> {row.status ?? 'UNKNOWN'}</span></td></tr>)}</tbody>
            </table>
            {!liveSessions.length && <div className="empty-state">{overview ? 'No active sessions were returned for this tenant.' : 'Live session rows are withheld until authenticated tenant data is available.'}</div>}
          </div>
        </section>

        <footer className="footer"><span>JASLYN NET · Connectivity &amp; ISP Operations</span><span>{overview ? 'Live tenant data · API connected' : 'Development inspection · no fabricated metrics'}</span></footer>
      </section>
    </main>
  );
}
