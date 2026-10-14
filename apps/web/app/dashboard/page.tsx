'use client';

import './dashboard.css';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { apiFetch, ApiError } from '../../lib/api';
import { getAccessToken } from '../../lib/auth';

type OperatorProfile = { user?: { fullName?: string; email?: string; role?: string; tenantName?: string; tenantSlug?: string } };

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

const OPERATOR_WORKSPACES = [
  { label: 'Network & devices', detail: 'Routers, links and topology', href: '/network', terms: 'router device topology links' },
  { label: 'Customers', detail: 'Subscriber accounts and profiles', href: '/customers', terms: 'subscriber client account' },
  { label: 'Live sessions', detail: 'Connected users and activity', href: '/sessions', terms: 'online radius active users' },
  { label: 'Payments', detail: 'Payment activity and records', href: '/payments', terms: 'money transaction reconciliation' },
  { label: 'Finance & revenue assurance', detail: 'Ledger, reconciliation and leakage checks', href: '/revenue-assurance', terms: 'finance ledger billing reconciliation revenue leakage' },
  { label: 'Incident center', detail: 'Service incidents and response', href: '/incidents', terms: 'outage alerts faults incident timeline' },
  { label: 'Field operations', detail: 'On-site work and technicians', href: '/field-operations', terms: 'field technician jobs offline sync' },
  { label: 'Network commands', detail: 'Command execution and results', href: '/network-commands', terms: 'terminal execute verify' },
  { label: 'IP address management', detail: 'IPAM pools and allocations', href: '/ipam', terms: 'subnet ip address pool allocation' },
  { label: 'RADIUS & AAA', detail: 'Authentication and accounting', href: '/radius', terms: 'aaa radius nas authentication accounting' },
  { label: 'Fiber operations', detail: 'Fiber lines and service state', href: '/fiber', terms: 'fiber olt optical line' },
  { label: 'Automation & approvals', detail: 'Event-driven workflows and approvals', href: '/automation', terms: 'workflow trigger event approval schedule' },
  { label: 'Security posture', detail: 'Security controls and risk findings', href: '/security-posture', terms: 'security risk access control posture' },
  { label: 'Security & audit', detail: 'Audit trail and security events', href: '/audit', terms: 'logs security compliance' },
  { label: 'Communication', detail: 'Messages and delivery status', href: '/communication', terms: 'sms email notifications messages' },
  { label: 'Integrations', detail: 'Connected systems and providers', href: '/integrations', terms: 'api webhooks external systems' },
  { label: 'Operations Hub', detail: 'Artifacts, workspaces, runbooks and change reviews', href: '/operations-hub', terms: 'artifacts workspace runbooks integrations change review rollback' },
] as const;

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
  const [welcomeNow, setWelcomeNow] = useState<Date | null>(null);
  const [operatorProfile, setOperatorProfile] = useState<OperatorProfile['user'] | null>(null);
  const [quickFind, setQuickFind] = useState('');
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');

  useEffect(() => { setWelcomeNow(new Date()); }, []);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    let cancelled = false;
    void apiFetch<OperatorProfile>('/auth/me', { headers: { Authorization: 'Bearer ' + token } })
      .then((profile) => { if (!cancelled) setOperatorProfile(profile.user ?? null); })
      .catch(() => { if (!cancelled) setOperatorProfile(null); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCommandOpen(false);
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, []);

  const exportOperationalSnapshot = useCallback(() => {
    if (!data) return;
    const snapshot = {
      reportType: 'jaslyn-net-operational-snapshot',
      generatedAt: new Date().toISOString(),
      tenant: data.tenant ?? null,
      kpis: data.kpis ?? null,
      network: data.network ?? null,
      operations: data.operations ?? null,
      locations: data.locations ?? [],
      sessions: data.sessions ?? [],
      note: 'Export of the latest authenticated overview API response; values are not inferred.',
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `jaslyn-net-operations-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [data]);



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
  const availability = data?.kpis?.networkAvailability;
  const healthStyle: CSSProperties = { '--overview-availability': `${Math.max(0, Math.min(100, availability ?? 0))}%` } as CSSProperties;
  const locations = data?.locations ?? [];
  const tenantName = operatorProfile?.tenantName ?? data?.tenant?.name ?? 'Jaslyn Net';
  const greetingHour = welcomeNow?.getHours();
  const greeting = greetingHour == null ? 'Welcome' : greetingHour < 12 ? 'Good morning' : greetingHour < 18 ? 'Good afternoon' : 'Good evening';
  const operatorName = operatorProfile?.fullName?.trim() || operatorProfile?.email?.split('@')[0] || 'Operator';
  const hasOperationalSignals = Boolean(data && data.network?.offline !== undefined && data.network?.degraded !== undefined && data.operations?.networkCommands?.failed !== undefined && data.operations?.access?.expiredButActive !== undefined && data.operations?.access?.expiring24h !== undefined);
  const operationalFocus = !data || !hasOperationalSignals
    ? { tone: 'unknown', title: loading ? 'Preparing your workspace' : 'Live overview unavailable', detail: loading ? 'Checking the latest network and service signals.' : data ? 'The API responded, but key health signals are missing; no healthy state is assumed.' : 'Reconnect or refresh to retrieve verified operational data.', href: '/network', action: loading ? 'Checking status' : 'Open network' }
    : network.offline > 0
      ? { tone: 'critical', title: `${n(network.offline)} router${network.offline === 1 ? '' : 's'} offline`, detail: 'Review device reachability and affected locations first.', href: '/network', action: 'Inspect network' }
      : network.degraded > 0
        ? { tone: 'warning', title: `${n(network.degraded)} router${network.degraded === 1 ? '' : 's'} degraded`, detail: 'Check device health before service quality drops further.', href: '/network', action: 'Review devices' }
        : operations.networkCommands.failed > 0
          ? { tone: 'critical', title: `${n(operations.networkCommands.failed)} failed network command${operations.networkCommands.failed === 1 ? '' : 's'}`, detail: 'Review command results and verification before retrying.', href: '/network-commands', action: 'Review commands' }
          : operations.access.expiredButActive > 0
            ? { tone: 'warning', title: `${n(operations.access.expiredButActive)} expired access entitlement${operations.access.expiredButActive === 1 ? '' : 's'} still active`, detail: 'Investigate entitlement and session synchronization.', href: '/sessions', action: 'Review sessions' }
            : operations.access.expiring24h > 0
              ? { tone: 'warning', title: `${n(operations.access.expiring24h)} access entitlement${operations.access.expiring24h === 1 ? '' : 's'} expiring soon`, detail: 'Check renewals and customer notifications.', href: '/customer-commerce', action: 'Review renewals' }
              : { tone: 'good', title: 'No priority alerts in the overview', detail: 'Keep an eye on network health, sessions and payment processing.', href: '/incidents', action: 'Open incident center' };

  return (
    <main className="overview-page">
      <section className="operator-welcome" aria-labelledby="operator-welcome-title">
        <div className="operator-welcome-copy">
          <div className="operator-welcome-eyebrow"><span className={`operator-welcome-live-dot ${connection === 'online' ? 'is-online' : connection === 'offline' || connection === 'degraded' ? 'is-offline' : 'is-checking'}`} /> JASORA · NETWORK OPERATIONS <span className="operator-welcome-date">{welcomeNow ? welcomeNow.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }) : ''}</span></div>
          <h2 id="operator-welcome-title">{greeting}, {operatorName}!</h2>
          <p>Your network, subscribers, payments and field operations — ready in one place.</p>
          <div className="operator-welcome-actions">
            <a href="/network">Open network <span aria-hidden="true">↗</span></a>
            <a href="/sessions">View live sessions <span aria-hidden="true">↗</span></a>
            <a href="/payments">Review payments <span aria-hidden="true">↗</span></a>
            <a href="/incidents">Incident center <span aria-hidden="true">↗</span></a>
            <a href="/field-operations">Field operations <span aria-hidden="true">↗</span></a>
          </div>
        </div>
        <div className="operator-welcome-status" aria-live="polite">
          <span className="operator-welcome-status-label">WORKSPACE STATUS</span>
          <strong><i className={connection === 'online' ? 'is-online' : connection === 'offline' ? 'is-offline' : 'is-checking'} />{connection === 'online' ? 'Connected' : connection === 'offline' ? 'Offline' : connection === 'degraded' ? 'Needs attention' : 'Connecting…'}</strong>
          <small>{lastUpdatedAt ? 'Updated ' + lastUpdatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Checking live API status'}</small>
        </div>
      </section>
      <section className={`operator-focus operator-focus-${operationalFocus.tone}`} aria-label="Suggested operational focus">
        <div className="operator-focus-symbol" aria-hidden="true">{operationalFocus.tone === 'critical' ? '!' : operationalFocus.tone === 'warning' ? '•' : operationalFocus.tone === 'good' ? '✓' : '…'}</div>
        <div className="operator-focus-copy"><span>RECOMMENDED NEXT ACTION</span><strong>{operationalFocus.title}</strong><p>{operationalFocus.detail}</p></div>
        <a href={operationalFocus.href}>{operationalFocus.action} <span aria-hidden="true">↗</span></a>
      </section>
      {commandOpen && (
        <div className="operator-command-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCommandOpen(false); }}>
          <section className="operator-command-dialog" role="dialog" aria-modal="true" aria-labelledby="operator-command-title">
            <div className="operator-command-search-row">
              <span aria-hidden="true">⌕</span>
              <input autoFocus value={commandQuery} onChange={(event) => setCommandQuery(event.target.value)} placeholder="Search workspaces and actions…" aria-label="Search operator commands" />
              <kbd>ESC</kbd>
            </div>
            <div className="operator-command-section-label" id="operator-command-title">QUICK ACTIONS</div>
            <div className="operator-command-results">
              {OPERATOR_WORKSPACES.filter((item) => `${item.label} ${item.detail} ${item.terms}`.toLowerCase().includes(commandQuery.trim().toLowerCase())).map((item) => (
                <a key={item.href} href={item.href} onClick={() => setCommandOpen(false)}><span className="operator-command-result-icon" aria-hidden="true">↗</span><span><strong>{item.label}</strong><small>{item.detail}</small></span><kbd>OPEN</kbd></a>
              ))}
              {'export operational snapshot'.includes(commandQuery.trim().toLowerCase()) && data && (
                <button type="button" onClick={() => { exportOperationalSnapshot(); setCommandOpen(false); }}><span className="operator-command-result-icon" aria-hidden="true">↓</span><span><strong>Export operational snapshot</strong><small>Download the latest authenticated overview as JSON</small></span><kbd>EXPORT</kbd></button>
              )}
              {!OPERATOR_WORKSPACES.some((item) => `${item.label} ${item.detail} ${item.terms}`.toLowerCase().includes(commandQuery.trim().toLowerCase())) && !('export operational snapshot'.includes(commandQuery.trim().toLowerCase()) && data) && <div className="operator-command-empty">No matching commands. Try “network”, “payments” or “export”.</div>}
            </div>
            <div className="operator-command-footer"><span>Jaslyn Net operator workspace</span><span><kbd>ESC</kbd> to close</span></div>
          </section>
        </div>
      )}
      <section className="operator-launchpad panel" aria-labelledby="operator-launchpad-title">
        <div className="operator-launchpad-heading">
          <div><div className="panel-kicker">OPERATOR LAUNCHPAD</div><h2 id="operator-launchpad-title">Where do you want to go?</h2><p>Search tools and jump directly to an operational workspace.</p></div><div className="operator-launchpad-tools"><button type="button" onClick={() => { setCommandQuery(''); setCommandOpen(true); }} className="operator-command-trigger">Dashboard actions</button><button type="button" onClick={exportOperationalSnapshot} className="operator-command-trigger" disabled={!data} title={!data ? "Wait for verified API data before exporting" : "Download the latest API snapshot"}>↓ Export snapshot</button></div>
          <span className="operator-launchpad-count">{OPERATOR_WORKSPACES.filter((item) => `${item.label} ${item.detail} ${item.terms}`.toLowerCase().includes(quickFind.trim().toLowerCase())).length} results</span>
        </div>
        <label className="operator-launchpad-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/></svg>
          <input type="search" value={quickFind} onChange={(event) => setQuickFind(event.target.value)} placeholder="Search network, customers, finance…" aria-label="Search operator workspaces" />
          {quickFind && <button type="button" onClick={() => setQuickFind('')} aria-label="Clear workspace search">Clear</button>}
        </label>
        <div className="operator-launchpad-grid" aria-live="polite">
          {OPERATOR_WORKSPACES.filter((item) => `${item.label} ${item.detail} ${item.terms}`.toLowerCase().includes(quickFind.trim().toLowerCase())).map((item) => (
            <a className="operator-launchpad-item" href={item.href} key={item.href}>
              <span className="operator-launchpad-icon" aria-hidden="true">{item.label === 'Network & devices' ? '⌘' : item.label === 'Customers' ? '◎' : item.label === 'Live sessions' ? '◉' : item.label === 'Payments' ? '$' : item.label === 'Incident center' ? '!' : item.label === 'Field operations' ? '↗' : item.label === 'Network commands' ? '›_' : '✓'}</span>
              <span className="operator-launchpad-item-copy"><strong>{item.label}</strong><small>{item.detail}</small></span>
              <span className="operator-launchpad-arrow" aria-hidden="true">↗</span>
            </a>
          ))}
          {OPERATOR_WORKSPACES.filter((item) => `${item.label} ${item.detail} ${item.terms}`.toLowerCase().includes(quickFind.trim().toLowerCase())).length === 0 && (
            <div className="operator-launchpad-empty"><strong>No matching workspace</strong><span>Try a different keyword, such as network, payments or customers.</span></div>
          )}
        </div>
        <div className="operator-launchpad-footnote"><span aria-hidden="true">↳</span> Shortcuts open existing Jaslyn Net pages; access permissions still apply.</div>
      </section>
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
          <a href="/dashboard/platform-subscription"><span>Workspace billing</span><small>Jaslyn Net plan &amp; limits</small></a>
          <a href="/dashboard/automation"><span>Automation</span><small>Workflows &amp; approvals</small></a>
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
        <div className="operations-strip-label"><span className="operations-strip-dot" aria-hidden="true" /> <strong>{!data ? 'Telemetry unavailable' : attentionItems ? `${attentionItems} attention signal${attentionItems === 1 ? '' : 's'}` : 'No attention signals'}</strong><small>{data ? 'derived from the latest tenant API snapshot' : 'No health conclusion can be drawn without an API snapshot'}</small></div>
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
          <div className="panel-head"><div><div className="panel-kicker">NETWORK FABRIC</div><h2>Router health</h2><p>{n(network.totalRouters)} registered devices</p></div><span className={`panel-badge ${!data || !network.totalRouters || network.degraded + network.offline ? 'badge-danger' : ''}`}>{!data ? 'API UNAVAILABLE' : !network.totalRouters ? 'NO INVENTORY' : network.degraded + network.offline ? `${network.degraded + network.offline} ATTENTION` : 'STABLE'}</span></div>
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
          <div className="panel-head"><div><div className="panel-kicker">ACCESS POSTURE</div><h2>Entitlement state</h2><p>Access validity signals returned by the API.</p></div><span className={`panel-badge ${!data || operations.access.expiredButActive || operations.access.expiring24h ? 'badge-danger' : ''}`}>{!data ? 'API UNAVAILABLE' : operations.access.expiredButActive ? operations.access.expiredButActive + ' EXPIRED ACTIVE' : operations.access.expiring24h ? operations.access.expiring24h + ' EXPIRING' : 'STABLE'}</span></div>
          <div className="posture-list">
            <div><span>Valid active access</span><strong>{n(operations.access.activeValid)}</strong></div>
            <div><span>Expired but still active</span><strong className={operations.access.expiredButActive ? 'bad-text' : ''}>{n(operations.access.expiredButActive)}</strong></div>
            <div><span>Expiring within 24h</span><strong className={operations.access.expiring24h ? 'warn-text' : ''}>{n(operations.access.expiring24h)}</strong></div>
            <div><span>Payment failures</span><strong className={data?.kpis?.paymentFailures ? 'bad-text' : ''}>{data ? n(data.kpis?.paymentFailures ?? 0) : '—'}</strong></div>
          </div>
        </article>
      </section>

    </main>
  );
}
