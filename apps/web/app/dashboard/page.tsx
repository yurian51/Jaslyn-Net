'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch, ApiError } from '../../lib/api';
import { getAccessToken } from '../../lib/auth';

type Overview = {
  tenant?: { currency?: string; timezone?: string; name?: string; status?: string };
  revenueSeries?: number[];
  kpis?: { monthlyRevenue?: number; activeCustomers?: number; onlineSessions?: number; networkAvailability?: number | null; paymentFailures?: number };
  network?: { totalRouters?: number; online?: number; degraded?: number; offline?: number };
  operations?: { networkCommands?: { pending?: number; failed?: number; verified?: number; abandoned?: number }; sessions?: { stale?: number; activeWithoutAccounting?: number; accountingLagging?: number }; access?: { activeValid?: number; expiredButActive?: number; expiring24h?: number } };
  sessions?: Array<{ customer?: string; location?: string; router?: string; ip_address?: string; started_at?: string; bytesIn?: number; bytesOut?: number; status?: string }>;
  locations?: Array<{ name?: string; routers?: number; activeUsers?: number; onlineRouters?: number }>;
};

const n = (value: number) => new Intl.NumberFormat('en-US').format(value);
const money = (currency: string, value: number) => `${currency} ${n(value)}`;
const bytes = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) { size /= 1024; index += 1; }
  return `${size >= 10 || index === 0 ? Math.round(size) : size.toFixed(1)} ${units[index]}`;
};
const duration = (value?: string) => {
  if (!value) return '—';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '—';
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

export default function DashboardPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) { setError('Authentication required.'); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      setData(await apiFetch<Overview>('/overview', { headers: { Authorization: `Bearer ${token}` } }));
    } catch (cause: unknown) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Unable to load dashboard telemetry.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const currency = data?.tenant?.currency ?? 'TZS';
  const revenue = data?.revenueSeries ?? [];
  const revenueTotal = useMemo(() => revenue.reduce((sum, value) => sum + value, 0), [revenue]);
  const maxRevenue = Math.max(...revenue, 0);
  const network = { totalRouters: 0, online: 0, degraded: 0, offline: 0, ...data?.network };
  const operations = {
    networkCommands: { pending: 0, failed: 0, verified: 0, abandoned: 0, ...data?.operations?.networkCommands },
    sessions: { stale: 0, activeWithoutAccounting: 0, accountingLagging: 0, ...data?.operations?.sessions },
    access: { activeValid: 0, expiredButActive: 0, expiring24h: 0, ...data?.operations?.access },
  };
  const integrityIssues = operations.networkCommands.failed + operations.sessions.stale + operations.sessions.activeWithoutAccounting + operations.sessions.accountingLagging + operations.access.expiredButActive;
  const traffic = (data?.sessions ?? []).reduce((sum, session) => sum + (session.bytesIn ?? 0) + (session.bytesOut ?? 0), 0);
  const availability = data?.kpis?.networkAvailability;

  return (
    <main className="overview-page">
      <header className="overview-header">
        <div>
          <div className="eyebrow">JASLYN NET / CONTROL CENTER</div>
          <h1>Network operations overview</h1>
          <p className="context">Technical state, customer state and business state in one operator view.</p>
        </div>
        <div className="top-actions">
          <span className={`data-state ${error ? 'danger' : ''}`}><i /> {error ? 'API UNAVAILABLE' : loading ? 'REFRESHING' : 'LIVE API DATA'}</span>
          <button className="selector" type="button" onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh telemetry'}</button>
        </div>
      </header>

      {error && <div className="error-banner" role="alert"><strong>Dashboard telemetry unavailable.</strong> {error}</div>}

      <section className="kpi-grid overview-kpis" aria-label="Network and business KPIs">
        <article className="kpi"><div className="kpi-label"><span>Monthly revenue</span><b>BILLING</b></div><strong>{data ? money(currency, data.kpis?.monthlyRevenue ?? 0) : '—'}</strong><div className="kpi-foot"><span>API</span><small>successful payment value</small></div></article>
        <article className="kpi"><div className="kpi-label"><span>Active customers</span><b>CUSTOMERS</b></div><strong>{data ? n(data.kpis?.activeCustomers ?? 0) : '—'}</strong><div className="kpi-foot"><span>LIVE</span><small>tenant subscriber accounts</small></div></article>
        <article className="kpi"><div className="kpi-label"><span>Online sessions</span><b>ACCESS</b></div><strong>{data ? n(data.kpis?.onlineSessions ?? 0) : '—'}</strong><div className="kpi-foot"><span>LIVE</span><small>current network connections</small></div></article>
        <article className="kpi"><div className="kpi-label"><span>Network availability</span><b>FABRIC</b></div><strong>{availability == null ? '—' : `${availability}%`}</strong><div className="kpi-foot"><span>{network.offline ? 'ATTENTION' : 'STATUS'}</span><small>{network.online}/{network.totalRouters} routers online</small></div></article>
      </section>

      <section className="overview-grid overview-primary">
        <article className="panel overview-panel">
          <div className="panel-head"><div><div className="panel-kicker">COMMERCIAL TELEMETRY</div><h2>Revenue performance</h2><p>Returned payment series for this tenant.</p></div><span className="panel-badge">{revenue.length ? `${revenue.length} PERIODS` : 'NO SERIES'}</span></div>
          <div className="overview-total">{data ? money(currency, data.kpis?.monthlyRevenue ?? 0) : '—'}<small>{data ? `${money(currency, revenueTotal)} across returned periods` : 'Waiting for authenticated telemetry'}</small></div>
          {revenue.length ? <div className="overview-bars" aria-label="Revenue series">{revenue.map((value, index) => <span key={`${index}-${value}`} style={{ height: `${Math.max(4, maxRevenue ? Math.round((value / maxRevenue) * 100) : 0)}%` }} title={money(currency, value)} />)}</div> : <div className="overview-empty"><strong>No revenue series returned.</strong><span>No invented figures are shown.</span></div>}
        </article>

        <article className="panel overview-panel network-summary">
          <div className="panel-head"><div><div className="panel-kicker">NETWORK FABRIC</div><h2>Router health</h2><p>{n(network.totalRouters)} registered devices</p></div><span className="panel-badge">{network.degraded + network.offline ? `${network.degraded + network.offline} ATTENTION` : 'STABLE'}</span></div>
          <div className="health-meter"><div className="health-meter-value">{availability == null ? 'N/A' : `${availability}%`}<small>availability</small></div></div>
          <div className="health-stats"><div><b>{network.online}</b><span>ONLINE</span></div><div><b>{network.degraded}</b><span>DEGRADED</span></div><div><b>{network.offline}</b><span>OFFLINE</span></div></div>
        </article>
      </section>

      <section className="overview-grid overview-secondary">
        <article className="panel overview-panel">
          <div className="panel-head"><div><div className="panel-kicker">REAL-TIME ACCESS</div><h2>Active sessions</h2><p>Latest sessions returned by the operational overview.</p></div><a className="panel-badge" href="/sessions">OPEN SESSIONS →</a></div>
          <div className="table-wrap"><table><thead><tr><th>CUSTOMER</th><th>LOCATION</th><th>ROUTER</th><th>IP</th><th>TRAFFIC</th><th>DURATION</th><th>STATE</th></tr></thead><tbody>{data?.sessions?.length ? data.sessions.slice(0, 8).map((session, index) => <tr key={`${session.customer ?? 'session'}-${index}`}><td><strong>{session.customer ?? 'Unknown'}</strong></td><td>{session.location ?? '—'}</td><td>{session.router ?? '—'}</td><td>{session.ip_address ?? '—'}</td><td>{bytes((session.bytesIn ?? 0) + (session.bytesOut ?? 0))}</td><td>{duration(session.started_at)}</td><td><span className="status active"><i />{session.status ?? 'ACTIVE'}</span></td></tr>) : <tr><td colSpan={7}><div className="empty-state">{loading ? 'Loading live session telemetry…' : 'No live session records returned by the API.'}</div></td></tr>}</tbody></table></div>
        </article>

        <article className="panel overview-panel">
          <div className="panel-head"><div><div className="panel-kicker">SYSTEM INTEGRITY</div><h2>Operational truth</h2><p>Cross-domain consistency signals.</p></div><span className={`panel-badge ${integrityIssues ? 'badge-danger' : ''}`}>{data ? integrityIssues : '—'} ISSUES</span></div>
          <div className="truth-grid"><div><b>{operations.networkCommands.pending}</b><span>Commands pending</span></div><div><b>{operations.networkCommands.failed}</b><span>Commands failed</span></div><div><b>{operations.sessions.stale}</b><span>Stale sessions</span></div><div><b>{operations.sessions.accountingLagging}</b><span>Accounting lagging</span></div><div><b>{operations.access.expiredButActive}</b><span>Expired access active</span></div><div><b>{operations.access.expiring24h}</b><span>Expiring in 24h</span></div></div>
          {integrityIssues > 0 && <div className="notice"><strong>Operator attention required.</strong> {integrityIssues} consistency signal{integrityIssues === 1 ? '' : 's'} returned by the API.</div>}
        </article>
      </section>

      <section className="panel overview-panel">
        <div className="panel-head"><div><div className="panel-kicker">OPERATOR SHORTCUTS</div><h2>Control surfaces</h2><p>Jump directly into the operational domains that can change network or customer state.</p></div></div>
        <div className="shortcut-grid">
          <a href="/customers"><b>Customers</b><span>Subscriber accounts and customer operations →</span></a>
          <a href="/sessions"><b>Sessions</b><span>Inspect active, stale and ended connections →</span></a>
          <a href="/network"><b>Network</b><span>Routers, gateways and management state →</span></a>
          <a href="/packages"><b>Plans &amp; Products</b><span>Access packages and catalogue operations →</span></a>
          <a href="/purchases"><b>Purchases</b><span>Payment and purchase operations →</span></a>
          <a href="/audit"><b>Security &amp; Audit</b><span>Tenant-scoped operational event trail →</span></a>
        </div>
        <div className="overview-footer-metrics"><span><b>{bytes(traffic)}</b> observed traffic in returned sessions</span><span>Timezone: {data?.tenant?.timezone ?? 'tenant configured'}</span></div>
      </section>
    </main>
  );
}
