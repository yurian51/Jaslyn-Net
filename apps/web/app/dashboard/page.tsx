'use client';

import './dashboard.css';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
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

const percent = (value: number, total: number) => {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return null;
  return Math.round((value / total) * 100);
};

export default function DashboardPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<'checking' | 'online' | 'degraded' | 'offline'>('checking');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setError('Authentication required.');
      setConnection('degraded');
      setLoading(false);
      return;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setConnection('offline');
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const next = await apiFetch<Overview>('/overview', { headers: { Authorization: `Bearer ${token}` } });
      setData(next);
      setError(null);
      setConnection('online');
      setLastUpdatedAt(new Date());
    } catch (cause: unknown) {
      const message = cause instanceof ApiError || cause instanceof Error ? cause.message : 'Unable to load dashboard telemetry.';
      setError(message);
      setConnection(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'degraded');
      // Preserve the last verified snapshot instead of replacing real telemetry with zeros.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      if (timer) clearTimeout(timer);
      if (cancelled) return;
      timer = setTimeout(async () => {
        if (!document.hidden) await load();
        schedule();
      }, document.hidden ? 60_000 : 15_000);
    };

    const onOnline = () => {
      setConnection('checking');
      void load().finally(schedule);
    };
    const onOffline = () => setConnection('offline');
    const onVisibility = () => {
      if (!document.hidden) void load().finally(schedule);
      else schedule();
    };

    void load().finally(schedule);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [load]);

  const currency = data?.tenant?.currency ?? 'TZS';
  const revenue = data?.revenueSeries ?? [];
  const revenueTotal = useMemo(() => revenue.reduce((sum, value) => sum + value, 0), [revenue]);
  const revenueChart = useMemo(() => {
    if (!revenue.length) return null;
    const min = Math.min(...revenue, 0);
    const max = Math.max(...revenue, 1);
    const span = max - min || 1;
    const points = revenue.map((value, index) => {
      const x = 18 + (index / Math.max(revenue.length - 1, 1)) * 684;
      const y = 24 + (1 - (value - min) / span) * 150;
      return { x, y, value };
    });
    const line = points.map(({ x, y }) => `${x},${y}`).join(' ');
    const area = `18,174 ${line} 702,174`;
    return { points, line, area };
  }, [revenue]);

  const network = { totalRouters: 0, online: 0, degraded: 0, offline: 0, ...data?.network };
  const operations = {
    networkCommands: { pending: 0, failed: 0, verified: 0, abandoned: 0, ...data?.operations?.networkCommands },
    sessions: { stale: 0, activeWithoutAccounting: 0, accountingLagging: 0, ...data?.operations?.sessions },
    access: { activeValid: 0, expiredButActive: 0, expiring24h: 0, ...data?.operations?.access },
  };
  const integrityIssues = operations.networkCommands.failed + operations.sessions.stale + operations.sessions.activeWithoutAccounting + operations.sessions.accountingLagging + operations.access.expiredButActive;
  const attentionItems = network.offline + network.degraded + operations.networkCommands.failed + operations.access.expiredButActive + operations.access.expiring24h;
  const traffic = (data?.sessions ?? []).reduce((sum, session) => sum + (session.bytesIn ?? 0) + (session.bytesOut ?? 0), 0);
  const availability = data?.kpis?.networkAvailability;
  const healthStyle: CSSProperties = { '--overview-availability': `${Math.max(0, Math.min(100, availability ?? 0))}%` } as CSSProperties;
  const locations = data?.locations ?? [];
  const tenantName = data?.tenant?.name ?? 'Tenant workspace';

  return (
    <main className="overview-page">
      <header className="overview-header">
        <div className="overview-heading">
          <div className="eyebrow">JASLYN NET / CONTROL CENTER</div>
          <h1>Network operations overview</h1>
          <p className="context">Technical state, customer state and business state in one operator view.</p>
        </div>
        <div className="overview-operator-meta">
          <span><b>{tenantName}</b><small>{data?.tenant?.timezone ?? 'Tenant timezone configured'}</small></span>
          <span aria-live="polite" className={'data-state-inline ' + (connection === 'offline' || connection === 'degraded' ? 'danger' : '')}>
            <i /> {connection === 'offline' ? 'Offline / last state' : connection === 'degraded' ? 'Degraded / last state' : loading ? 'Refreshing' : connection === 'checking' ? 'Checking API' : 'Live API data'}
            {lastUpdatedAt ? ' · ' + lastUpdatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
          </span>
        </div>
      </header>

      <nav className="dashboard-commandbar" aria-label="Dashboard commands">
        <div className="commandbar-primary">
          <a href="/network"><span>Network</span><small>Fabric &amp; devices</small></a>
          <a href="/sessions"><span>Sessions</span><small>Live connections</small></a>
          <a href="/customers"><span>Customers</span><small>Subscriber state</small></a>
          <a href="/payments"><span>Payments</span><small>Transactions &amp; status</small></a>
          <a href="/dashboard/packages"><span>Packages</span><small>Jaslyn tiers &amp; access</small></a>
        </div>
        <button className="commandbar-refresh" type="button" onClick={() => void load()} disabled={loading}>
          <i />{loading ? 'Refreshing telemetry' : 'Refresh telemetry'}
        </button>
      </nav>

      {error && <div className="error-banner" role="alert"><strong>Dashboard telemetry unavailable.</strong> {error}</div>}

      <section className="overview-kpis" aria-label="Network and business KPIs">
        <article className="overview-kpi">
          <div className="overview-kpi-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 7h16M6 11h12M8 15h8M10 19h4" /></svg></div>
          <div><span className="kpi-label">Monthly revenue</span><strong>{data ? money(currency, data.kpis?.monthlyRevenue ?? 0) : '—'}</strong><small>Successful payment value</small></div>
        </article>
        <article className="overview-kpi">
          <div className="overview-kpi-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3" /><path d="M3.5 20c.6-3.3 2.5-5 5.5-5s4.9 1.7 5.5 5M16 10a2.5 2.5 0 1 0 0-5M16.5 15c2.3.2 3.8 1.7 4.3 5" /></svg></div>
          <div><span className="kpi-label">Active customers</span><strong>{data ? n(data.kpis?.activeCustomers ?? 0) : '—'}</strong><small>Tenant subscriber accounts</small></div>
        </article>
        <article className="overview-kpi">
          <div className="overview-kpi-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 8a10 10 0 0 1 14 0M8 11a6 6 0 0 1 8 0M11 14a2 2 0 0 1 2 0M12 19h.01" /></svg></div>
          <div><span className="kpi-label">Online sessions</span><strong>{data ? n(data.kpis?.onlineSessions ?? 0) : '—'}</strong><small>Current network connections</small></div>
        </article>
        <article className="overview-kpi">
          <div className="overview-kpi-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" /><path d="M12 5.5v6.5l4 2.3" /></svg></div>
          <div><span className="kpi-label">Network availability</span><strong>{availability == null ? '—' : availability + '%'}</strong><small>{network.online}/{network.totalRouters} routers online</small></div>
        </article>
      </section>

      <section className={`operations-strip ${attentionItems ? 'has-attention' : ''}`} aria-label="Operational attention summary">
        <div className="operations-strip-label"><span className="operations-strip-dot" aria-hidden="true" /> <strong>{attentionItems ? `${attentionItems} attention signal${attentionItems === 1 ? '' : 's'}` : 'No attention signals'}</strong><small>derived from live tenant telemetry</small></div>
        <div className="operations-strip-items">
          <span><b>{network.offline}</b> offline routers</span>
          <span><b>{network.degraded}</b> degraded</span>
          <span><b>{operations.networkCommands.failed}</b> failed commands</span>
          <span><b>{operations.access.expiring24h}</b> expiring 24h</span>
        </div>
      </section>

      <section className="overview-grid overview-primary">
        <article className="panel overview-panel">
          <div className="panel-head"><div><div className="panel-kicker">COMMERCIAL TELEMETRY</div><h2>Revenue performance</h2><p>Returned payment series for this tenant.</p></div><span className="panel-badge">{revenue.length ? `${revenue.length} PERIODS` : 'NO SERIES'}</span></div>
          <div className="overview-total">{data ? money(currency, data.kpis?.monthlyRevenue ?? 0) : '—'}<small>{data ? `${money(currency, revenueTotal)} across returned periods` : 'Waiting for authenticated telemetry'}</small></div>
          {revenueChart ? <div className="overview-chart" role="img" aria-label="Revenue performance line chart"><svg viewBox="0 0 720 190" preserveAspectRatio="none"><line x1="18" y1="24" x2="702" y2="24" /><line x1="18" y1="74" x2="702" y2="74" /><line x1="18" y1="124" x2="702" y2="124" /><line x1="18" y1="174" x2="702" y2="174" /><polygon points={revenueChart.area} /><polyline points={revenueChart.line} /><circle cx={revenueChart.points.at(-1)?.x ?? 18} cy={revenueChart.points.at(-1)?.y ?? 174} r="4" /></svg><div className="overview-chart-axis"><span>Earlier periods</span><span>Latest returned period</span></div></div> : <div className="overview-empty"><strong>No revenue series returned.</strong><span>No invented figures are shown.</span></div>}
        </article>

        <article className="panel overview-panel network-summary">
          <div className="panel-head"><div><div className="panel-kicker">NETWORK FABRIC</div><h2>Router health</h2><p>{n(network.totalRouters)} registered devices</p></div><span className="panel-badge">{network.degraded + network.offline ? `${network.degraded + network.offline} ATTENTION` : 'STABLE'}</span></div>
          <div className="health-meter" style={healthStyle}><div className="health-meter-value">{availability == null ? 'N/A' : `${availability}%`}<small>availability</small></div></div>
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

      <section className="overview-grid overview-tertiary">
        <article className="panel overview-panel">
          <div className="panel-head"><div><div className="panel-kicker">SITE FOOTPRINT</div><h2>Locations</h2><p>Tenant locations and their returned router/user state.</p></div><a className="panel-badge" href="/network">OPEN NETWORK →</a></div>
          <div className="location-list">
            {locations.length ? locations.slice(0, 8).map((location, index) => {
              const routerTotal = location.routers ?? 0;
              const routerOnline = location.onlineRouters ?? 0;
              const health = percent(routerOnline, routerTotal);
              return <div className="location-row" key={index}>
                <span><i aria-hidden="true" /><strong>{location.name ?? 'Unnamed location'}</strong></span>
                <span>{n(location.activeUsers ?? 0)} active users</span>
                <span>{routerOnline}/{routerTotal} routers</span>
                <b className={health == null ? 'neutral' : health >= 100 ? 'good' : health > 0 ? 'warn' : 'bad'}>{health == null ? '—' : health + '%'}</b>
              </div>;
            }) : <div className="overview-empty compact"><strong>No location records returned.</strong><span>Location telemetry will appear here when the API returns it.</span></div>}
          </div>
        </article>

        <article className="panel overview-panel posture-panel">
          <div className="panel-head"><div><div className="panel-kicker">ACCESS POSTURE</div><h2>Entitlement state</h2><p>Access validity signals returned by the API.</p></div><span className="panel-badge">{operations.access.expiring24h ? operations.access.expiring24h + ' EXPIRING' : 'STABLE'}</span></div>
          <div className="posture-list">
            <div><span>Valid active access</span><strong>{n(operations.access.activeValid)}</strong></div>
            <div><span>Expired but still active</span><strong className={operations.access.expiredButActive ? 'bad-text' : ''}>{n(operations.access.expiredButActive)}</strong></div>
            <div><span>Expiring within 24h</span><strong className={operations.access.expiring24h ? 'warn-text' : ''}>{n(operations.access.expiring24h)}</strong></div>
            <div><span>Payment failures</span><strong className={data?.kpis?.paymentFailures ? 'bad-text' : ''}>{data ? n(data.kpis?.paymentFailures ?? 0) : '—'}</strong></div>
          </div>
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
