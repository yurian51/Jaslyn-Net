'use client';

import './dashboard.css';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { apiFetch, ApiError } from '../../lib/api';
import { getAccessToken } from '../../lib/auth';

type CommandCenter = {
  generatedAt: string;
  systemHealth: {
    status: 'OPERATIONAL' | 'ATTENTION' | 'DEGRADED';
    devices: { total: number; online: number; degraded: number; unreachable: number };
    activeIncidents: number;
    degradedServices: number;
    activeSessions: number;
    authenticationFailures24h: number;
    paymentFailures24h: number;
    providerFailures24h: Array<{ provider: string; failures: number }>;
    commandQueue: { pending: number; failed: number };
  };
  devices: Array<{
    id: string; name: string; vendor?: string; model?: string; ipAddress?: string; macAddress?: string;
    status: string; activeUsers: number; updatedAt?: string; managementProtocol?: string;
    telemetry: { uptime: string | number | null; cpu: number | null; memory: number | null; interfaces: unknown[] | null; bandwidth: number | null; latency: number | null; packetLoss: number | null; source: string };
    activeSessions: number; recentCommands: Array<{ id: string; commandType: string; status: string; provider?: string; error?: string | null }>;
    recentIncidents: Array<{ id: string; title: string; severity: string; status: string }>;
  }>;
  sessions: Array<{ id: string; subscriber: string; device: string; ip?: string; username?: string; startedAt: string; bytesIn: number; bytesOut: number; status: string; authenticationState: string; accountingState: string }>;
  incidents: Array<{ id: string; title: string; severity: string; status: string; category: string; affectedDevices: number; affectedSubscribers: number; startedAt: string; lastSeenAt: string; acknowledgedAt?: string | null; resolvedAt?: string | null; resolution?: string | null }>;
  commands: Array<{ id: string; commandType: string; actor: string; provider?: string; status: string; error?: string | null; createdAt: string; sentAt?: string | null; completedAt?: string | null; verifiedAt?: string | null }>;
  recentCriticalEvents: Array<{ id: string; title: string; summary?: string; severity: string; category: string; occurredAt: string }>;
};

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
  const [nocData, setNocData] = useState<CommandCenter | null>(null);
  const [nocError, setNocError] = useState<string | null>(null);
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
      const [next, commandCenter] = await Promise.all([
        apiFetch<Overview>('/overview', { headers: { Authorization: `Bearer ${token}` } }),
        apiFetch<CommandCenter>('/overview/command-center', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      setData(next);
      setNocData(commandCenter);
      setNocError(null);
      setError(null);
      setConnection('online');
      setLastUpdatedAt(new Date());
    } catch (cause: unknown) {
      const message = cause instanceof ApiError || cause instanceof Error ? cause.message : 'Unable to load dashboard telemetry.';
      setError(message);
      if (!nocData) setNocError(message);
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
          <a href="/purchases"><span>Purchases</span><small>Purchase &amp; access flow</small></a>
          <a href="/customer-commerce"><span>Commerce</span><small>Wallet, rewards &amp; renewals</small></a>
          <a href="/communication"><span>Communication</span><small>Messages &amp; commands</small></a>
          <a href="/packages"><span>Packages</span><small>Plans &amp; products</small></a>
          <a href="/dashboard/packages"><span>Jaslyn Tiers</span><small>Premium tier catalogue</small></a>
        </div>
        <button className="commandbar-refresh" type="button" onClick={() => void load()} disabled={loading}>
          <i />{loading ? 'Refreshing telemetry' : 'Refresh telemetry'}
        </button>
      </nav>

      {error && <div className="error-banner" role="alert"><strong>Dashboard telemetry unavailable.</strong> {error}</div>}
      <section className="noc-command-center" aria-label="NOC command center">
        <div className="noc-head">
          <div><div className="panel-kicker">NOC COMMAND CENTER</div><h2>Operational state</h2><p>Only persisted tenant state and reported telemetry are shown.</p></div>
          <span className={`noc-health noc-${(nocData?.systemHealth.status ?? 'DEGRADED').toLowerCase()}`}><i />{nocData?.systemHealth.status ?? (nocError ? 'DEGRADED' : 'LOADING')}</span>
        </div>
        {nocError && <div className="noc-degraded" role="alert"><strong>NOC telemetry degraded.</strong> {nocError}</div>}
        <div className="noc-health-grid">
          <a href="/incidents"><b>{nocData?.systemHealth.activeIncidents ?? '—'}</b><span>Active incidents</span></a>
          <a href="/network"><b>{nocData?.systemHealth.devices.unreachable ?? '—'}</b><span>Unreachable devices</span></a>
          <a href="/sessions"><b>{nocData?.systemHealth.activeSessions ?? '—'}</b><span>Active sessions</span></a>
          <a href="/radius"><b>{nocData?.systemHealth.authenticationFailures24h ?? '—'}</b><span>Auth failures · 24h</span></a>
          <a href="/payments"><b>{nocData?.systemHealth.paymentFailures24h ?? '—'}</b><span>Payment failures · 24h</span></a>
          <a href="/network-commands"><b>{nocData?.systemHealth.commandQueue.pending ?? '—'}</b><span>Commands queued</span></a>
        </div>
        <div className="noc-grid">
          <article className="noc-panel">
            <div className="noc-panel-head"><div><span>DEVICE FLEET</span><h3>Reachability</h3></div><a href="/network">Open network →</a></div>
            <div className="noc-list">
              {(nocData?.devices ?? []).slice(0,8).map((device) => <div className="noc-row" key={device.id}><span><i className={`noc-dot ${device.status.toLowerCase()}`} /><strong>{device.name}</strong><small>{device.vendor ?? 'Unknown vendor'} · {device.ipAddress ?? 'No IP'}</small></span><b>{device.status}</b><em>{device.activeSessions} sessions</em></div>)}
              {!nocData?.devices.length && <div className="noc-empty">{nocError ? 'Device telemetry unavailable.' : 'No persisted devices returned.'}</div>}
            </div>
          </article>
          <article className="noc-panel">
            <div className="noc-panel-head"><div><span>ACTIVE INCIDENTS</span><h3>Operator queue</h3></div><a href="/incidents">Open incidents →</a></div>
            <div className="noc-list">
              {(nocData?.incidents ?? []).slice(0,6).map((incident) => <a className="noc-row" href={`/incidents?q=${encodeURIComponent(incident.id)}`} key={incident.id}><span><i className={`noc-dot ${incident.severity.toLowerCase()}`} /><strong>{incident.title}</strong><small>{incident.category} · {incident.affectedDevices} devices · {incident.affectedSubscribers} subscribers</small></span><b>{incident.severity}</b></a>)}
              {!nocData?.incidents.length && <div className="noc-empty">{nocError ? 'Incident telemetry unavailable.' : 'No active incidents.'}</div>}
            </div>
          </article>
        </div>
        <div className="noc-grid">
          <article className="noc-panel wide">
            <div className="noc-panel-head"><div><span>SESSION CONTROL</span><h3>Current connections</h3></div><a href="/sessions">Open sessions →</a></div>
            <div className="noc-table-wrap"><table><thead><tr><th>SUBSCRIBER</th><th>DEVICE</th><th>IP</th><th>AUTH</th><th>ACCOUNTING</th><th>STATE</th></tr></thead><tbody>
              {(nocData?.sessions ?? []).slice(0,8).map((session) => <tr key={session.id}><td><strong>{session.subscriber}</strong><small>{session.username ?? '—'}</small></td><td>{session.device}</td><td>{session.ip ?? '—'}</td><td>{session.authenticationState}</td><td>{session.accountingState}</td><td><span className="noc-status">{session.status}</span></td></tr>)}
              {!nocData?.sessions.length && <tr><td colSpan={6}><div className="noc-empty">{nocError ? 'Session telemetry unavailable.' : 'No active session records.'}</div></td></tr>}
            </tbody></table></div>
          </article>
          <article className="noc-panel">
            <div className="noc-panel-head"><div><span>COMMAND FABRIC</span><h3>Execution queue</h3></div><a href="/network-commands">Open commands →</a></div>
            <div className="noc-list">
              {(nocData?.commands ?? []).slice(0,7).map((command) => <a className="noc-row" href={`/network-commands?q=${encodeURIComponent(command.id)}`} key={command.id}><span><strong>{command.commandType}</strong><small>{command.actor} · {command.provider ?? 'provider pending'}</small></span><b>{command.status}</b></a>)}
              {!nocData?.commands.length && <div className="noc-empty">{nocError ? 'Command telemetry unavailable.' : 'No persisted command records.'}</div>}
            </div>
          </article>
        </div>
        <div className="noc-grid">
          <article className="noc-panel">
            <div className="noc-panel-head"><div><span>PROVIDER HEALTH</span><h3>Failed commands · 24h</h3></div></div>
            <div className="noc-provider-list">{(nocData?.systemHealth.providerFailures24h ?? []).map((item) => <div key={item.provider}><span>{item.provider}</span><b>{item.failures}</b></div>)}{!nocData?.systemHealth.providerFailures24h.length && <div className="noc-empty">No provider failures recorded in the last 24 hours.</div>}</div>
          </article>
          <article className="noc-panel">
            <div className="noc-panel-head"><div><span>CRITICAL EVENTS</span><h3>Recent high-severity events</h3></div></div>
            <div className="noc-list">{(nocData?.recentCriticalEvents ?? []).slice(0,6).map((event) => <div className="noc-row" key={event.id}><span><strong>{event.title}</strong><small>{event.category} · {new Date(event.occurredAt).toLocaleString()}</small></span><b>{event.severity}</b></div>)}{!nocData?.recentCriticalEvents.length && <div className="noc-empty">No critical incident records returned.</div>}</div>
          </article>
        </div>
        <div className="noc-telemetry-note">Device CPU, memory, interfaces, bandwidth, latency, packet loss and uptime are intentionally shown only when a telemetry source persists them. The current schema does not report those values, so Jaslyn Net does not manufacture them.</div>
      </section>

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
          <a href="/dashboard/packages"><b>Jaslyn Tiers</b><span>Eight premium package tiers and feature flags →</span></a>
          <a href="/purchases"><b>Purchases</b><span>Payment, voucher and access operations →</span></a>
          <a href="/customer-commerce"><b>Customer Commerce</b><span>Wallet, beneficiaries, saved purchases, rewards and renewals →</span></a>
          <a href="/communication"><b>Communication</b><span>Telegram-style conversations, search and operator commands →</span></a>
          <a href="/audit"><b>Security &amp; Audit</b><span>Tenant-scoped operational event trail →</span></a>
        </div>
        <div className="overview-footer-metrics"><span><b>{bytes(traffic)}</b> observed traffic in returned sessions</span><span>Timezone: {data?.tenant?.timezone ?? 'tenant configured'}</span></div>
      </section>
    
      <style jsx>{`
        .noc-command-center{margin:0 0 18px;border:1px solid #dfe5eb;background:#fff;padding:18px}
        .noc-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;border-bottom:1px solid #e9edf1;padding-bottom:12px}.noc-head h2{margin:4px 0;font-size:18px}.noc-head p{margin:0;color:#8995a5;font-size:9px}.noc-health{display:inline-flex;align-items:center;gap:7px;padding:6px 9px;border:1px solid #dce3ea;font-size:8px;font-weight:850;letter-spacing:.08em}.noc-health i,.noc-dot{width:6px;height:6px;border-radius:50%;display:inline-block;background:#7890ad}.noc-operational i,.noc-dot.online{background:#3b9b70}.noc-attention i,.noc-dot.degraded,.noc-dot.warning{background:#bd862d}.noc-degraded,.noc-dot.critical,.noc-degraded i{background:#fff5f6;color:#984651}.noc-health.noc-degraded i,.noc-dot.offline{background:#c95766}.noc-health.noc-degraded{color:#984651}.noc-health.noc-attention{color:#8b671d}.noc-health.noc-operational{color:#2e7455}
        .noc-health-grid{display:grid;grid-template-columns:repeat(6,1fr);border-bottom:1px solid #e9edf1}.noc-health-grid a{padding:12px;border-right:1px solid #edf0f3;text-decoration:none}.noc-health-grid a:last-child{border-right:0}.noc-health-grid b{display:block;font-size:20px;color:#26364b}.noc-health-grid span{display:block;margin-top:3px;color:#8a96a5;font-size:8px}
        .noc-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}.noc-panel{border:1px solid #e4e9ee;min-width:0}.noc-panel.wide{grid-column:span 2}.noc-panel-head{display:flex;justify-content:space-between;gap:10px;padding:11px 12px;border-bottom:1px solid #e9edf1}.noc-panel-head span{font-size:7px;letter-spacing:.12em;color:#929da9;font-weight:850}.noc-panel-head h3{margin:3px 0 0;font-size:12px}.noc-panel-head a{font-size:8px;color:#526f91;text-decoration:none}.noc-list{min-height:80px}.noc-row{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 11px;border-bottom:1px solid #eef1f4;text-decoration:none;color:inherit}.noc-row:last-child{border-bottom:0}.noc-row>span{min-width:0}.noc-row strong,.noc-row small{display:block}.noc-row strong{font-size:9px;color:#2f4054;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.noc-row small{font-size:7px;color:#98a3af;margin-top:3px}.noc-row b{font-size:7px;letter-spacing:.05em;color:#68788b;white-space:nowrap}.noc-row em{font-size:7px;color:#8895a4;font-style:normal}.noc-dot{margin-right:7px;vertical-align:middle}.noc-status{font-size:7px;font-weight:850;color:#3b7a5b}.noc-table-wrap{overflow:auto}.noc-table-wrap table{width:100%;border-collapse:collapse;min-width:650px}.noc-table-wrap th{padding:8px 10px;text-align:left;font-size:7px;color:#929da9;letter-spacing:.08em;border-bottom:1px solid #e9edf1}.noc-table-wrap td{padding:9px 10px;font-size:8px;color:#65758a;border-bottom:1px solid #eef1f4}.noc-table-wrap td strong,.noc-table-wrap td small{display:block}.noc-table-wrap td strong{color:#34465b}.noc-table-wrap td small{font-size:7px;color:#9aa4af;margin-top:2px}.noc-provider-list>div{display:flex;justify-content:space-between;padding:9px 11px;border-bottom:1px solid #eef1f4;font-size:8px}.noc-provider-list b{color:#a14c57}.noc-empty{padding:22px;text-align:center;color:#909ba7;font-size:8px}.noc-telemetry-note{margin-top:10px;padding:9px 11px;background:#f7f9fb;border-top:1px solid #e9edf1;color:#8793a1;font-size:8px;line-height:1.5}
        @media(max-width:1100px){.noc-health-grid{grid-template-columns:repeat(3,1fr)}.noc-health-grid a:nth-child(3){border-right:0}.noc-grid{grid-template-columns:1fr}.noc-panel.wide{grid-column:auto}}@media(max-width:600px){.noc-command-center{padding:12px}.noc-health-grid{grid-template-columns:repeat(2,1fr)}.noc-health-grid a{border-bottom:1px solid #edf0f3}.noc-head{flex-direction:column}.noc-grid{gap:8px}}
        @media(prefers-reduced-motion:reduce){.noc-command-center *{scroll-behavior:auto!important;transition:none!important}}
      `}</style>
    </main>
  );
}
