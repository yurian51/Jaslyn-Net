'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { getAccessToken } from '../../lib/auth';
import { apiFetch } from '../../lib/api';

type Overview = {
  tenant?: { currency?: string; timezone?: string; name?: string; status?: string };
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
    ip_address?: string;
    started_at?: string;
    bytesIn?: number;
    bytesOut?: number;
    status?: string;
  }>;
  locations?: Array<{
    name?: string;
    routers?: number;
    activeUsers?: number;
    onlineRouters?: number;
  }>;
};

const nav = [
  ['Overview', '⌂', '/dashboard'],
  ['Customers', '◉', '/customers'],
  ['Sessions', '◌', '/sessions'],
  ['Network', '⌁', '/network'],
  ['Purchases', '₮', '/purchases'],
  ['Plans & Products', '▣', '/packages'],
  ['Security & Audit', '◈', '/audit'],
] as const;

const operationalAreas = [
  { title: 'Customers', description: 'Subscriber accounts and identity', href: '/customers', icon: '◉' },
  { title: 'Plans & Products', description: 'WiFi packages and service policy', href: '/packages', icon: '▣' },
  { title: 'Sessions', description: 'Active connections and traffic', href: '/sessions', icon: '◌' },
  { title: 'Purchases', description: 'Customer purchases and access', href: '/purchases', icon: '₮' },
  { title: 'Network', description: 'Routers and connectivity health', href: '/network', icon: '⌁' },
  { title: 'Security & Audit', description: 'Tenant operational event trail', href: '/audit', icon: '◈' },
] as const;

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatMoney(currency: string, value: number) {
  return `${currency} ${formatNumber(value)}`;
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size >= 10 || index === 0 ? Math.round(size) : size.toFixed(1)} ${units[index]}`;
}

function formatDuration(startedAt?: string) {
  if (!startedAt) return '—';
  const started = new Date(startedAt).getTime();
  if (!Number.isFinite(started)) return '—';
  const minutes = Math.max(0, Math.floor((Date.now() - started) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return `${hours}h ${remaining}m`;
}

export default function DashboardPage() {
  const pathname = usePathname();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;

    apiFetch<Overview>('/overview', { headers: { Authorization: `Bearer ${token}` } })
      .then(setOverview)
      .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : 'Unable to load dashboard data.'));
  }, []);

  const currency = overview?.tenant?.currency ?? 'TZS';
  const revenueValues = overview?.revenueSeries ?? [];
  const maxRevenue = Math.max(...revenueValues, 0);
  const revenueBars = revenueValues.length ? revenueValues.map((value) => (maxRevenue ? Math.max(5, (value / maxRevenue) * 100) : 0)) : [];
  const monthlyRevenue = overview?.kpis?.monthlyRevenue ?? 0;
  const activeCustomers = overview?.kpis?.activeCustomers ?? 0;
  const onlineSessions = overview?.kpis?.onlineSessions ?? 0;
  const availability = overview?.kpis?.networkAvailability;
  const network = { totalRouters: 0, online: 0, degraded: 0, offline: 0, ...overview?.network };
  const liveSessions = overview?.sessions ?? [];
  const availabilityLabel = availability == null ? 'N/A' : `${availability}%`;
  const attentionCount = (overview?.kpis?.paymentFailures ?? 0) + network.degraded + network.offline;
  const liveDataLabel = overview ? 'LIVE DATA' : loadError ? 'API UNAVAILABLE' : 'CONSOLE READY';

  const revenueSummary = useMemo(() => {
    if (!revenueValues.length) return 'No revenue series returned by the tenant API.';
    const total = revenueValues.reduce((sum, value) => sum + value, 0);
    return `${formatMoney(currency, total)} across ${revenueValues.length} daily periods`;
  }, [currency, revenueValues]);

  return (
    <main className="app-shell dashboard-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">J</div><div><span>JASLYN NET</span><small>Network operations platform</small></div></div>
        <div className="workspace-switch"><span className="workspace-dot" /> Global Workspace <span>⌄</span></div>
        <nav className="nav" aria-label="Jaslyn Net operations">
          <p className="nav-section">OPERATIONS</p>
          {nav.map(([item, icon, href]) => { const active = pathname === href; return <a key={item} href={href} className={active ? 'nav-item active' : 'nav-item'} aria-current={active ? 'page' : undefined}><span className="nav-icon">{icon}</span><span>{item}</span></a>; })}
        </nav>
        <div className="sidebar-status"><span className="pulse" /><div><strong>{liveDataLabel}</strong><small>{overview ? 'Tenant overview loaded' : loadError ?? 'Live values require an authenticated session'}</small></div></div>
        <div className="profile"><div className="avatar">J</div><div><strong>JASLYN NET</strong><small>Tenant workspace</small></div><span className="profile-more">•••</span></div>
      </aside>

      <section className="content">
        <header className="topbar dashboard-topbar">
          <div className="topbar-copy">
            <div className="eyebrow">JASLYN NET / CONTROL CENTER</div>
            <h1>Operations overview</h1>
            <p className="context">Commercial performance, subscriber access and network health in one operational view.</p>
          </div>
          <div className="top-actions"><span className="data-state"><i /> {liveDataLabel}</span><div className="avatar small-avatar">J</div></div>
        </header>

        {loadError && <div className="error-banner" role="alert">{loadError}</div>}
        {!overview && !loadError && <div className="inspection-banner"><strong>Inspection mode</strong><span>The console is rendered without invented tenant metrics. Live values appear after an authenticated API session is available.</span></div>}

        <section className="kpi-grid dashboard-kpis" aria-label="Business and network metrics">
          <article className="kpi"><div className="kpi-label"><span>Monthly revenue</span><b>COMMERCIAL</b></div><strong>{overview ? formatMoney(currency, monthlyRevenue) : '—'}</strong><div className="kpi-foot"><span>{overview ? 'LIVE' : 'WAITING'}</span><small>successful payments this month</small></div></article>
          <article className="kpi"><div className="kpi-label"><span>Active customers</span><b>USERS</b></div><strong>{overview ? formatNumber(activeCustomers) : '—'}</strong><div className="kpi-foot"><span>{overview ? 'LIVE' : 'WAITING'}</span><small>active subscriber accounts</small></div></article>
          <article className="kpi"><div className="kpi-label"><span>Online sessions</span><b>ACCESS</b></div><strong>{overview ? formatNumber(onlineSessions) : '—'}</strong><div className="kpi-foot"><span>{overview ? 'LIVE' : 'WAITING'}</span><small>connections right now</small></div></article>
          <article className="kpi"><div className="kpi-label"><span>Router availability</span><b>NETWORK</b></div><strong>{overview ? availabilityLabel : '—'}</strong><div className="kpi-foot"><span>{overview ? `${network.online}/${network.totalRouters}` : 'WAITING'}</span><small>{network.degraded + network.offline} need attention</small></div></article>
        </section>

        <section className="hero-grid">
          <article className="panel revenue-panel">
            <div className="panel-head"><div><div className="panel-kicker">REVENUE + COLLECTIONS</div><h2>Monthly revenue flow</h2><p>Successful payment value returned by the tenant overview API.</p></div><span className="panel-badge">{overview ? 'LIVE' : 'NO LIVE DATA'}</span></div>
            <div className="revenue-total"><strong>{overview ? formatMoney(currency, monthlyRevenue) : '—'}</strong><small>{revenueSummary}</small></div>
            <div className="chart" aria-label="Revenue performance chart">
              <div className="chart-scale"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div>
              <div className="chart-body"><div className="grid-line g1" /><div className="grid-line g2" /><div className="grid-line g3" /><div className="grid-line g4" />{revenueBars.length ? <div className="bars">{revenueBars.map((height, index) => <span style={{ height: `${height}%` }} key={index} aria-label={`Revenue day ${index + 1}`} />)}</div> : <div className="chart-empty"><strong>Revenue series unavailable</strong><span>The API has not supplied daily payment values for this tenant.</span></div>}</div>
            </div>
          </article>

          <article className="panel health-panel">
            <div className="panel-kicker">NETWORK CONTROL</div><h2>Router health</h2><p>{network.totalRouters} registered router{network.totalRouters === 1 ? '' : 's'} across the tenant.</p>
            <div className="health-ring" style={{ background: availability == null ? '#eef1f5' : `conic-gradient(#5578e9 0 ${Math.max(0, Math.min(100, availability))}%,#e8edf4 ${Math.max(0, Math.min(100, availability))}% 100%)` }}><div><strong>{availabilityLabel}</strong><span>availability</span></div></div>
            <div className="health-stats"><div><span className="health-dot online" /><strong>{network.online}</strong><small>Online</small></div><div><span className="health-dot warn" /><strong>{network.degraded}</strong><small>Degraded</small></div><div><span className="health-dot down" /><strong>{network.offline}</strong><small>Offline</small></div></div>
            <a className="full-button" href="/network">Open network operations <span>→</span></a>
          </article>
        </section>

        <section className="content-grid dashboard-lower-grid">
          <article className="panel locations-panel">
            <div className="panel-head"><div><div className="panel-kicker">MULTI-SITE NETWORK</div><h2>Locations</h2><p>Actual location and router activity returned by the overview API.</p></div><a className="text-link" href="/network">Network →</a></div>
            {overview?.locations?.length ? <div className="location-table"><div className="location-header"><span>LOCATION</span><span>ROUTERS</span><span>USERS</span><span>ONLINE</span><span>UPTIME</span></div>{overview.locations.map((row, index) => { const name = row.name ?? 'Unknown'; const routers = row.routers ?? 0; const onlineRouters = row.onlineRouters ?? 0; const uptime = routers ? Math.round((onlineRouters / routers) * 1000) / 10 : null; return <div className="location-row" key={`${name}-${index}`}><div className="region"><span className="region-code">{name.slice(0, 2).toUpperCase()}</span><strong>{name}</strong></div><span>{routers}</span><span>{formatNumber(row.activeUsers ?? 0)}</span><span>{onlineRouters}/{routers}</span><span className="uptime">● {uptime == null ? 'N/A' : `${uptime}%`}</span></div>; })}</div> : <div className="module-empty"><strong>No location data returned</strong><span>{overview ? 'The tenant has no location records in the overview response.' : 'Live location data is intentionally not fabricated.'}</span><a href="/network">Inspect network inventory →</a></div>}
          </article>

          <article className="panel attention-panel">
            <div className="panel-head"><div><div className="panel-kicker">EXCEPTIONS</div><h2>Attention required</h2><p>Only conditions backed by current API data are surfaced.</p></div><span className="alert-count">{attentionCount}</span></div>
            {overview?.kpis?.paymentFailures ? <a className="attention-item" href="/purchases"><span className="severity critical" /><div><strong>Payment failures detected</strong><small>{overview.kpis.paymentFailures} failed attempts this month</small></div><span>›</span></a> : null}
            {network.degraded > 0 ? <a className="attention-item" href="/network"><span className="severity warning" /><div><strong>Degraded routers</strong><small>{network.degraded} network device{network.degraded === 1 ? '' : 's'} need review</small></div><span>›</span></a> : null}
            {network.offline > 0 ? <a className="attention-item" href="/network"><span className="severity critical" /><div><strong>Offline routers</strong><small>{network.offline} network device{network.offline === 1 ? '' : 's'} are offline</small></div><span>›</span></a> : null}
            {!overview || attentionCount === 0 ? <div className="module-empty compact"><strong>{overview ? 'No active exceptions' : 'No live signals yet'}</strong><span>{overview ? 'The current overview has no payment failures or router health exceptions.' : 'Connect live tenant data to surface operational exceptions.'}</span></div> : null}
            <a className="full-button" href="/audit">Review security &amp; audit <span>→</span></a>
          </article>
        </section>

        <section className="panel operations-panel"><div className="panel-head"><div><div className="panel-kicker">CONTROL SURFACES</div><h2>Operate the network business</h2><p>Every destination below maps to an implemented Jaslyn Net route.</p></div></div><div className="operations-grid">{operationalAreas.map((area) => <a className="operation-card" href={area.href} key={area.href}><span className="operation-icon">{area.icon}</span><div><strong>{area.title}</strong><small>{area.description}</small></div><span className="operation-arrow">→</span></a>)}</div></section>

        <section className="panel sessions-panel dashboard-sessions"><div className="panel-head"><div><div className="panel-kicker">LIVE ACCESS</div><h2>Active sessions</h2><p>{overview ? `${formatNumber(onlineSessions)} users currently connected.` : 'Authenticated tenant data required for live session details.'}</p></div><div className="session-actions"><span className="live-pill"><i /> LIVE</span><a className="outline-button" href="/sessions">View sessions →</a></div></div><div className="table-wrap desktop-session-table"><table><thead><tr>{['Customer', 'Location', 'Router', 'IP address', 'Traffic', 'Duration', 'Status'].map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{liveSessions.map((row, index) => { const traffic = (row.bytesIn ?? 0) + (row.bytesOut ?? 0); return <tr key={`${row.customer ?? 'unknown'}-${row.ip_address ?? 'unknown'}-${index}`}><td>{row.customer ?? 'Unknown customer'}</td><td>{row.location ?? 'Unassigned'}</td><td>{row.router ?? 'Unknown router'}</td><td>{row.ip_address ?? '—'}</td><td>{formatBytes(traffic)}</td><td>{formatDuration(row.started_at)}</td><td><span className={`status ${(row.status ?? 'UNKNOWN').toLowerCase()}`}><i /> {row.status ?? 'UNKNOWN'}</span></td></tr>; })}</tbody></table>{!liveSessions.length && <div className="empty-state">{overview ? 'No active sessions were returned for this tenant.' : 'Live session rows are withheld until authenticated tenant data is available.'}</div>}</div><div className="mobile-session-list">{liveSessions.map((row, index) => { const traffic = (row.bytesIn ?? 0) + (row.bytesOut ?? 0); return <a className="mobile-session-card" href="/sessions" key={`${row.customer ?? 'unknown'}-mobile-${row.ip_address ?? 'unknown'}-${index}`}><div className="mobile-session-head"><strong>{row.customer ?? 'Unknown customer'}</strong><span className={`status ${(row.status ?? 'UNKNOWN').toLowerCase()}`}><i /> {row.status ?? 'UNKNOWN'}</span></div><div className="mobile-session-meta"><span>{row.location ?? 'Unassigned'}</span><span>{row.router ?? 'Unknown router'}</span><span>{row.ip_address ?? '—'}</span></div><div className="mobile-session-foot"><span>{formatBytes(traffic)}</span><span>{formatDuration(row.started_at)}</span></div></a> })}{!liveSessions.length && <div className="empty-state">{overview ? 'No active sessions were returned for this tenant.' : 'Live session details require authentication.'}</div>}</div></section>

        <footer className="footer"><span>JASLYN NET · Connectivity &amp; ISP Operations</span><span>{overview ? 'Live tenant data · API connected' : 'Development inspection · no fabricated metrics'}</span></footer>
      </section>
    </main>
  );
}