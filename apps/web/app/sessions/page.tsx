'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch, ApiError } from '../../lib/api';
import { getAccessToken } from '../../lib/auth';

type Session = {
  id: string;
  customerId?: string;
  routerId?: string;
  username?: string;
  ipAddress?: string;
  macAddress?: string;
  startedAt?: string;
  endedAt?: string;
  bytesIn?: string | number;
  bytesOut?: string | number;
  bytesTotal?: string | number;
  durationSeconds?: string | number;
  authenticationState?: string;
  accountingState?: string;
  status: 'ACTIVE' | 'STALE' | 'ENDED' | string;
};
type SessionResponse = { data: Session[]; count: number };
type SessionFilter = 'ACTIVE' | 'STALE' | 'ENDED' | '';
type SavedView = { name: string; status: SessionFilter; query: string };

function formatBytes(value: string | number | undefined) {
  const bytes = Number(value ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}
function formatDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}
function downloadCsv(rows: Session[]) {
  const header = ['id','username','ipAddress','macAddress','routerId','status','startedAt','endedAt','bytesTotal'];
  const csv = [header, ...rows.map(row => header.map(key => JSON.stringify(row[key as keyof Session] ?? '')))]
    .map(row => row.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'jaslyn-sessions.csv'; anchor.click();
  URL.revokeObjectURL(url);
}

export default function SessionsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState<SessionFilter>((params.get('status') as SessionFilter) || 'ACTIVE');
  const [query, setQuery] = useState(params.get('q') || '');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) { setError('Authentication required.'); setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const queryString = status ? `?status=${encodeURIComponent(status)}&limit=500` : '?limit=500';
      const response = await apiFetch<SessionResponse>(`/sessions${queryString}`, { headers: { Authorization: `Bearer ${token}` } });
      setSessions(Array.isArray(response.data) ? response.data : []);
      setCount(Number(response.count) || 0);
      setLoaded(true);
    } catch (cause: unknown) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Unable to load sessions.');
    } finally { setLoading(false); }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleSessions = sessions.filter((item) => !normalizedQuery || [item.id, item.customerId, item.routerId, item.username, item.ipAddress, item.macAddress, item.status].some((value) => String(value ?? '').toLowerCase().includes(normalizedQuery)));

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><img src="/brand/jaslyn-net-icon.svg" alt="" /></div><div><span>JASLYN NET</span><small>Network operations platform</small></div></div>
        <div className="workspace-switch"><span className="workspace-dot"/> Global Workspace <span>⌄</span></div>
        <nav className="nav">
          <p className="nav-section">OPERATIONS</p>
          <a className="nav-item" href="/dashboard"><span className="nav-icon">⌂</span>Overview</a>
          <a className="nav-item" href="/customers"><span className="nav-icon">◉</span>Customers</a>
          <a className="nav-item" href="/packages"><span className="nav-icon">▣</span>Plans &amp; Products</a>
          <a className="nav-item active" href="/sessions" aria-current="page"><span className="nav-icon">◌</span>Sessions</a>
          <a className="nav-item" href="/purchases"><span className="nav-icon">₮</span>Purchases</a>
          <a className="nav-item" href="/network"><span className="nav-icon">⌁</span>Network</a>
        </nav>
        <div className="sidebar-status"><span className="pulse"/><div><strong>{error ? 'API unavailable' : 'Session monitor'}</strong><small>{error ?? `${count} session records loaded`}</small></div></div>
        <div className="profile"><div className="avatar"><img src="/brand/jaslyn-net-icon.svg" alt="" /></div><div><strong>JASLYN NET</strong><small>Tenant workspace</small></div></div>
      </aside>
      <section className="content">
        <header className="topbar">
          <div><div className="eyebrow">JASLYN NET / SESSIONS</div><h1>Session operations</h1><p className="context">Inspect active connections, traffic counters and session lifecycle state.</p></div>
          <div className="top-actions"><button className="selector" onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh data'}</button></div>
        </header>
        {error && <div className="error-banner" role="alert">{error}</div>}
        <section className="kpi-grid">
          <article className="kpi"><div className="kpi-label"><span>Records</span></div><strong>{loaded ? count : '—'}</strong><div className="kpi-foot"><span>API</span><small>tenant scoped</small></div></article>
          <article className="kpi"><div className="kpi-label"><span>Visible active</span></div><strong>{loaded ? sessions.filter((item) => item.status === 'ACTIVE').length : '—'}</strong><div className="kpi-foot"><span>LIVE</span><small>current filter</small></div></article>
          <article className="kpi"><div className="kpi-label"><span>Stale evidence</span></div><strong>{loaded ? sessions.filter((item) => item.status === 'STALE').length : '—'}</strong><div className="kpi-foot"><span>VERIFY</span><small>network evidence missing</small></div></article>
          <article className="kpi"><div className="kpi-label"><span>Traffic</span></div><strong>{loaded ? formatBytes(sessions.reduce((sum, item) => sum + Number(item.bytesTotal ?? 0), 0)) : '—'}</strong><div className="kpi-foot"><span>COUNTERS</span><small>visible records</small></div></article>
        </section>
        <section className="panel sessions-panel">
          <div className="panel-head"><div><div className="panel-kicker">SESSION INVENTORY</div><h2>Network sessions</h2><p>{visibleSessions.length} visible of {count} API records. Tenant-isolated data; stale state is preserved until live evidence returns.</p></div><div className="periods" role="group" aria-label="Session status filter">
            {(['ACTIVE', 'STALE', 'ENDED', ''] as const).map((value) => <button key={value || 'all'} className={status === value ? 'selected' : ''} aria-pressed={status === value} onClick={() => setStatus(value)}>{value || 'ALL'}</button>)}
          </div></div>
          <div className="session-search"><label htmlFor="session-search">Search sessions</label><input id="session-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Username, customer, IP, MAC, router…" /></div>
          <div className="table-wrap"><table><thead><tr><th>USERNAME</th><th>IP ADDRESS</th><th>MAC ADDRESS</th><th>STARTED</th><th>TRAFFIC</th><th>STATUS</th></tr></thead><tbody>
            {visibleSessions.map((item) => <tr key={item.id}><td>{item.username ?? item.customerId ?? '—'}</td><td>{item.ipAddress ?? '—'}</td><td>{item.macAddress ?? '—'}</td><td>{formatDate(item.startedAt)}</td><td>{formatBytes(item.bytesTotal)}</td><td><span className={`status ${item.status.toLowerCase()}`}><i/>{item.status}</span></td></tr>)}
          </tbody></table>{!loading && !visibleSessions.length && <div className="empty-state">{!loaded ? 'Session data is unavailable; an empty result cannot be confirmed.' : sessions.length ? 'No sessions match this search and status filter.' : 'No sessions matched the selected status filter.'}</div>}{loading && <div className="empty-state">Loading tenant session data…</div>}</div>
        </section>
        <footer className="footer"><span>JASLYN NET · Session Operations</span><span>Data loaded from authenticated tenant API</span></footer>
      </section>
      <style jsx>{`
        .operator-page{min-height:100vh;padding:28px 34px 42px;background:#f4f6f8;color:#172337}.operator-page-header{max-width:1580px;margin:0 auto 16px;display:flex;justify-content:space-between;gap:20px;align-items:flex-end}.operator-page-header h1{margin:6px 0 4px;font-size:30px;letter-spacing:-.035em}.operator-page-header p{margin:0;color:#7f8b9c;font-size:11px;line-height:1.5}.operator-header-actions{display:flex;align-items:center;gap:8px}.operator-data-state{display:inline-flex;align-items:center;gap:7px;color:#68778a;font-size:9px;font-weight:750}.operator-data-state i{width:6px;height:6px;border-radius:50%;background:#3f9b70}.operator-button{height:38px;padding:0 13px;border:1px solid #1c3148;border-radius:7px;background:#1b3046;color:#fff;font-size:9px;font-weight:800}.operator-button.subtle{background:#fff;color:#4f6075;border-color:#d8e0e8}.operator-button:disabled{opacity:.5}.operator-toolbar{max-width:1580px;margin:0 auto 12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}.operator-search{height:38px;min-width:310px;flex:1;display:flex;align-items:center;gap:8px;padding:0 10px;background:#fff;border:1px solid #dce3ea;border-radius:7px;color:#8190a2}.operator-search input{border:0;outline:0;flex:1;font-size:10px;color:#27364a;background:transparent}.operator-search kbd{font-size:8px;border:1px solid #dbe1e8;padding:2px 5px;border-radius:4px}.operator-filter-group{display:flex;border:1px solid #dce3ea;border-radius:7px;overflow:hidden;background:#fff}.operator-filter-group button{height:36px;padding:0 10px;border:0;border-right:1px solid #e8edf2;background:#fff;color:#7a8797;font-size:8px;font-weight:800}.operator-filter-group button:last-child{border-right:0}.operator-filter-group .selected{background:#edf2f6;color:#1d3045}.operator-select{height:38px;border:1px solid #d8e0e8;border-radius:7px;background:#fff;color:#536479;font-size:9px;padding:0 10px}.operator-error{max-width:1580px;margin:0 auto 12px;padding:10px 12px;border:1px solid #e6c7cb;background:#fff6f7;color:#8c414b;font-size:10px}.operator-bulkbar{max-width:1580px;margin:0 auto 8px;padding:8px 10px;background:#1b3046;color:#fff;display:flex;align-items:center;gap:8px;border-radius:7px;font-size:9px}.operator-bulkbar strong{margin-right:auto}.operator-bulkbar button{border:1px solid #617387;background:transparent;color:#fff;border-radius:5px;padding:6px 9px;font-size:8px}.operator-surface{max-width:1580px;margin:0 auto;background:#fff;border:1px solid #dfe5eb;border-radius:9px;overflow:hidden}.operator-surface-head{display:flex;justify-content:space-between;gap:12px;padding:16px 18px;border-bottom:1px solid #e9edf1}.operator-surface-head>div>span{font-size:8px;letter-spacing:.13em;font-weight:850;color:#8c98a7}.operator-surface-head h2{margin:5px 0 3px;font-size:15px}.operator-surface-head p{margin:0;color:#8995a4;font-size:9px}.operator-count{align-self:center;color:#718095;font-size:8px;font-weight:800;text-transform:uppercase}.operator-table-wrap{overflow:auto}.operator-table{width:100%;min-width:920px;border-collapse:collapse}.operator-table th{padding:10px 11px;border-bottom:1px solid #e9edf1;color:#8b96a5;font-size:8px;text-align:left;letter-spacing:.08em}.operator-table td{padding:10px 11px;border-bottom:1px solid #eef1f4;color:#59697e;font-size:9px;vertical-align:top}.operator-table tr:hover>td{background:#fafbfd}.operator-table .check-col{width:35px}.operator-row-trigger{display:grid;text-align:left;gap:3px;border:0;background:transparent;padding:0;color:inherit;cursor:pointer}.operator-row-trigger strong{color:#26364b;font-size:9px}.operator-row-trigger small,.operator-table td small{color:#99a3b0;font-size:8px}.operator-status{display:inline-flex;align-items:center;gap:6px;font-size:8px;font-weight:850}.operator-status i{width:6px;height:6px;border-radius:50%;background:#7c8c9f}.operator-status.active{color:#2d805d}.operator-status.active i{background:#3b9b70}.operator-status.stale{color:#9a742d}.operator-status.stale i{background:#c39a4c}.operator-status.ended{color:#7c8795}.operator-menu{border:0;background:transparent;color:#8491a1;font-size:15px;cursor:pointer}.expanded-row>td{border-bottom:0}.operator-expanded-cell{background:#f8fafb!important;padding:14px 18px!important}.operator-detail-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.operator-detail-grid>div:not(.operator-timeline){display:grid;gap:3px}.operator-detail-grid span{font-size:7px;letter-spacing:.1em;color:#9aa4b0;font-weight:850}.operator-detail-grid b{font-size:9px;color:#34445a;word-break:break-word}.operator-session-action{grid-column:1/-1}.operator-danger-button{min-height:32px;padding:0 10px;border:1px solid #c95766;border-radius:6px;background:#fff6f7;color:#9a4350;font-size:8px;font-weight:850}.operator-danger-button:disabled{opacity:.5}.operator-timeline{grid-column:1/-1;border-top:1px solid #e5eaf0;padding-top:11px}.operator-timeline ol{list-style:none;margin:7px 0 0;padding:0;display:flex;gap:18px;flex-wrap:wrap}.operator-timeline li{display:grid;grid-template-columns:auto 1fr;column-gap:6px;color:#56667b;font-size:8px}.operator-timeline li i{grid-row:span 2;width:6px;height:6px;margin-top:2px;border-radius:50%;background:#5b7592}.operator-timeline time{color:#98a2ae}.operator-empty{min-height:220px;display:grid;place-content:center;text-align:center;gap:5px;color:#8c98a7;font-size:9px}.operator-empty strong{color:#516278;font-size:11px}@media(max-width:800px){.operator-page{padding:20px 13px 78px}.operator-page-header{align-items:flex-start;flex-direction:column}.operator-header-actions{width:100%;justify-content:space-between}.operator-toolbar{align-items:stretch}.operator-search{min-width:100%}.operator-filter-group{flex:1}.operator-filter-group button{flex:1}.operator-detail-grid{grid-template-columns:1fr 1fr}}@media(max-width:520px){.operator-detail-grid{grid-template-columns:1fr}.operator-timeline{grid-column:auto}.operator-page-header h1{font-size:25px}}
        :global(.operator-page button:focus-visible),:global(.operator-page input:focus-visible),:global(.operator-page select:focus-visible){outline:2px solid #2c6ea6;outline-offset:2px}
        @media(prefers-reduced-motion:reduce){:global(.operator-page *){scroll-behavior:auto!important;transition:none!important}}
      `}</style>
    </main>
  );
}
