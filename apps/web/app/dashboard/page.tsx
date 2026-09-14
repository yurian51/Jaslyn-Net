'use client';

import { useEffect, useState } from 'react';
import { getAccessToken } from '../../lib/auth';
import { apiFetch } from '../../lib/api';

type Overview = {
  tenant?: { currency?: string };
  revenueSeries?: number[];
  kpis?: { monthlyRevenue?: number; activeCustomers?: number; onlineSessions?: number; networkAvailability?: number; paymentFailures?: number };
  network?: { totalRouters?: number; online?: number; degraded?: number; offline?: number };
  sessions?: Array<{ customer?: string; location?: string; router?: string; plan?: string; ip_address?: string; duration?: string; status?: string }>;
  locations?: Array<{ name?: string; routers?: number; activeUsers?: number; onlineRouters?: number; revenue?: number }>;
};

const nav = [
  ['Overview', '⌂', '/dashboard'], ['Customers', '◉', '/customers'], ['Plans & Products', '▣', '/packages'],
  ['Sessions', '◌', '/sessions'], ['Purchases', '₮', '/purchases'], ['Network', '⌁', '/network'],
  ['Security & Audit', '◈', '/audit'],
];
const bars = Array(15).fill(0);
function formatNumber(value: number) { return new Intl.NumberFormat('en-US').format(value); }

export default function DashboardPage() {
  const [active, setActive] = useState('Overview');
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
  const revenueBars = revenueValues.length ? revenueValues.map(value => maxRevenue ? Math.max(4, (value / maxRevenue) * 100) : 0) : bars;
  const monthlyRevenue = overview?.kpis?.monthlyRevenue ?? 0;
  const activeCustomers = overview?.kpis?.activeCustomers ?? 0;
  const onlineSessions = overview?.kpis?.onlineSessions ?? 0;
  const availability = overview?.kpis?.networkAvailability ?? 0;
  const network = { totalRouters: 0, online: 0, degraded: 0, offline: 0, ...overview?.network };
  const liveSessions = overview?.sessions ?? [];

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">J</div><div><span>JASLYN NET</span><small>Network operations platform</small></div></div>
        <div className="workspace-switch"><span className="workspace-dot"/> Global Workspace <span>⌄</span></div>
        <nav className="nav"><p className="nav-section">OPERATIONS</p>{nav.map(([item, icon, href]) => <a key={item} href={href} className={active === item ? 'nav-item active' : 'nav-item'} aria-current={active === item ? 'page' : undefined} onClick={() => setActive(item)}><span className="nav-icon">{icon}</span><span>{item}</span></a>)}</nav>
        <div className="sidebar-status"><span className="pulse"/><div><strong>{overview ? 'Live data connected' : loadError ? 'Data unavailable' : 'Loading live data'}</strong><small>{overview ? 'Tenant metrics loaded' : loadError ?? 'Connecting to tenant API'}</small></div></div>
        <div className="profile"><div className="avatar">J</div><div><strong>JASLYN NET</strong><small>Tenant workspace</small></div><span className="profile-more">•••</span></div>
      </aside>
      <section className="content">
        <header className="topbar"><div><div className="eyebrow">JASLYN NET / {active.toUpperCase()}</div><h1>Operations overview</h1><p className="context">A real-time view of revenue, subscribers, network health and activity.</p></div><div className="top-actions"><button className="date-button" type="button" disabled aria-label="Current reporting period">◷ <span>Current month</span></button><button className="selector" type="button" disabled aria-label="All regions filter">All regions <span>⌄</span></button><button className="icon-button" type="button" aria-label="Search">⌕</button><button className="icon-button notification" type="button" aria-label="Notifications">♧<i/></button><div className="avatar small-avatar">J</div></div></header>
        {loadError && <div className="error-banner" role="alert">{loadError}</div>}
        <section className="kpi-grid">{[['Monthly recurring revenue', `${currency} ${formatNumber(monthlyRevenue)}`, overview ? 'LIVE' : '—', overview ? 'current month' : 'awaiting tenant data'], ['Active subscribers', formatNumber(activeCustomers), overview ? 'LIVE' : '—', 'active customers'], ['Online sessions', formatNumber(onlineSessions), overview ? 'LIVE' : '—', 'currently connected'], ['Network availability', `${availability}%`, overview ? 'LIVE' : '—', 'current fleet']].map(([label, value, delta, note]) => <article className="kpi" key={label}><div className="kpi-label"><span>{label}</span><button type="button" aria-label={`${label} options`}>•••</button></div><strong>{value}</strong><div className="kpi-foot"><span>{delta}</span><small>{note}</small></div></article>)}</section>
        <section className="hero-grid"><article className="panel revenue-panel"><div className="panel-head"><div><div className="panel-kicker">FINANCIAL PERFORMANCE</div><h2>Revenue performance</h2><p>Consolidated across all operating regions for the current month</p></div></div><div className="revenue-total"><strong>{currency} {formatNumber(monthlyRevenue)}</strong><span>{overview ? 'Live' : '—'}</span><small>{overview ? 'current month' : 'Sign in to load live revenue'}</small></div><div className="chart"><div className="chart-scale"><span>50M</span><span>35M</span><span>20M</span><span>5M</span><span>0</span></div><div className="chart-body"><div className="grid-line g1"/><div className="grid-line g2"/><div className="grid-line g3"/><div className="grid-line g4"/><div className="bars">{revenueBars.map((h, i) => <span style={{ height: `${h}%` }} key={i}/>)}</div><div className="x-labels"><span>01</span><span>05</span><span>10</span><span>15</span><span>20</span><span>25</span><span>30</span></div></div></div></div></article><article className="panel health-panel"><div className="panel-kicker">NETWORK HEALTH</div><h2>Infrastructure status</h2><p>Across {network.totalRouters} registered routers</p><div className="health-ring"><div><strong>{availability}%</strong><span>availability</span></div></div><div className="health-stats"><div><span className="health-dot online"/> <strong>{network.online}</strong><small>Operational</small></div><div><span className="health-dot warn"/><strong>{network.degraded}</strong><small>Attention</small></div><div><span className="health-dot down"/><strong>{network.offline}</strong><small>Offline</small></div></div><a className="full-button" href="/network">Open network operations <span>→</span></a></article></section>
        <section className="content-grid"><article className="panel locations-panel"><div className="panel-head"><div><div className="panel-kicker">GLOBAL FOOTPRINT</div><h2>Regional performance</h2><p>Subscriber and revenue distribution</p></div></div><div className="location-table"><div className="location-header"><span>REGION</span><span>SITES</span><span>SUBSCRIBERS</span><span>REVENUE</span><span>UPTIME</span></div>{(overview?.locations ?? []).map((row, i) => { const name = row.name ?? 'Unknown'; const routers = row.routers ?? 0; const uptime = routers ? Math.round(((row.onlineRouters ?? 0) / routers) * 10000) / 100 : 0; return <div className="location-row" key={`${name}-${i}`}><div className="region"><span className="region-code">{name.slice(0,2).toUpperCase()}</span><strong>{name}</strong></div><span>{routers}</span><span>{formatNumber(row.activeUsers ?? 0)}</span><strong>{typeof row.revenue === 'number' ? `${currency} ${formatNumber(row.revenue)}` : '—'}</strong><span className="uptime">● {uptime}%</span></div>; })}</div></article><article className="panel attention-panel"><div className="panel-head"><div><div className="panel-kicker">OPERATIONS</div><h2>Attention required</h2><p>Prioritized events from your network</p></div><span className="alert-count">{overview?.kpis?.paymentFailures ?? 0}</span></div><div className="attention-item"><span className="severity critical"/><div><strong>Payment failures detected</strong><small>{overview?.kpis?.paymentFailures ?? 0} failed attempts · current period</small></div><span>›</span></div>{network.degraded > 0 && <div className="attention-item"><span className="severity warning"/><div><strong>Router requires review</strong><small>{network.degraded} routers · degraded state</small></div><span>›</span></div>}{overview && <div className="attention-item"><span className="severity info"/><div><strong>Voucher inventory</strong><small>Review active voucher batches and expiry status</small></div><span>›</span></div>}<a className="full-button" href="/audit">Review audit events <span>→</span></a></article></section>
        <section className="panel sessions-panel"><div className="panel-head"><div><div className="panel-kicker">LIVE NETWORK</div><h2>Active sessions</h2><p>{formatNumber(onlineSessions)} users currently connected</p></div><div className="session-actions"><span className="live-pill"><i/> LIVE</span><a className="outline-button" href="/sessions">View sessions →</a></div></div><div className="table-wrap"><table><thead><tr>{['Customer','Location','Gateway','Plan','IP address','Duration','Status'].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{liveSessions.map((row, index) => <tr key={`${row.customer ?? 'unknown'}-${row.ip_address ?? 'unknown'}-${index}`}><td>{row.customer ?? '—'}</td><td>{row.location ?? '—'}</td><td>{row.router ?? '—'}</td><td>{row.plan ?? '—'}</td><td>{row.ip_address ?? '—'}</td><td>{row.duration ?? '—'}</td><td><span className={`status ${(row.status ?? 'UNKNOWN').toLowerCase()}`}><i/> {row.status ?? 'UNKNOWN'}</span></td></tr>)}</tbody></table>{!liveSessions.length && <div className="empty-state">{overview ? 'No active sessions were returned for this tenant.' : loadError ? 'Live session data is unavailable.' : 'Sign in to load live sessions.'}</div>}</div></section>
        <footer className="footer"><span>JASLYN NET · Network Operations Platform</span><span>{overview ? 'Live tenant data · loaded from API' : loadError ? 'API request failed' : 'Authentication required for live tenant data'}</span></footer>
      </section>
    </main>
  );
}
