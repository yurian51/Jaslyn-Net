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
  const [ending, setEnding] = useState<string | null>(null);

  const syncUrl = useCallback((nextStatus: SessionFilter, nextQuery: string) => {
    const next = new URLSearchParams(params.toString());
    nextStatus ? next.set('status', nextStatus) : next.delete('status');
    nextQuery.trim() ? next.set('q', nextQuery.trim()) : next.delete('q');
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [params, pathname, router]);

  useEffect(() => {
    const stored = window.localStorage.getItem('jaslyn.sessions.savedViews');
    if (stored) { try { setSavedViews(JSON.parse(stored)); } catch { setSavedViews([]); } }
  }, []);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) { setError('Authentication required.'); setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const queryString = status ? `?status=${encodeURIComponent(status)}&limit=500` : '?limit=500';
      const response = await apiFetch<SessionResponse>(`/sessions${queryString}`, { headers: { Authorization: `Bearer ${token}` } });
      setSessions(Array.isArray(response.data) ? response.data : []);
      setCount(Number(response.count) || 0);
    } catch (cause: unknown) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Unable to load sessions.');
    } finally { setLoading(false); }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return sessions;
    return sessions.filter(item => `${item.id} ${item.username ?? ''} ${item.customerId ?? ''} ${item.ipAddress ?? ''} ${item.macAddress ?? ''} ${item.routerId ?? ''} ${item.status}`.toLowerCase().includes(needle));
  }, [query, sessions]);

  const allVisibleSelected = filtered.length > 0 && filtered.every(row => selected.has(row.id));
  const toggleAll = () => setSelected(current => {
    const next = new Set(current);
    if (allVisibleSelected) filtered.forEach(row => next.delete(row.id)); else filtered.forEach(row => next.add(row.id));
    return next;
  });
  const toggleRow = (id: string) => setSelected(current => {
    const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  function saveCurrentView() {
    const name = window.prompt('Saved view name');
    if (!name?.trim()) return;
    const next = [...savedViews.filter(view => view.name !== name.trim()), { name: name.trim(), status, query }];
    setSavedViews(next); window.localStorage.setItem('jaslyn.sessions.savedViews', JSON.stringify(next));
  }
  function applyView(view: SavedView) { setStatus(view.status); setQuery(view.query); syncUrl(view.status, view.query); }
  function changeStatus(nextStatus: SessionFilter) { setStatus(nextStatus); syncUrl(nextStatus, query); }
  function changeQuery(nextQuery: string) { setQuery(nextQuery); syncUrl(status, nextQuery); }

  const selectedRows = filtered.filter(row => selected.has(row.id));

  async function disconnectSession(id: string) {
    const token = getAccessToken();
    if (!token) { setError('Authentication required.'); return; }
    if (!window.confirm('Disconnect this session? The action will be recorded by the authenticated API.')) return;
    setEnding(id);
    setError(null);
    try {
      await apiFetch(`/sessions/${id}/end`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      await load();
    } catch (cause: unknown) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Unable to disconnect session.');
    } finally {
      setEnding(null);
    }
  }

  return (
    <main className="operator-page sessions-operator">
      <header className="operator-page-header">
        <div><div className="eyebrow">JASLYN NET / SESSIONS</div><h1>Session operations</h1><p>Inspect live connections, accounting evidence and session lifecycle state without leaving the operator surface.</p></div>
        <div className="operator-header-actions"><span className="operator-data-state"><i />{loading ? 'Refreshing telemetry' : error ? 'Telemetry unavailable' : 'API telemetry'}</span><button className="operator-button" onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button></div>
      </header>

      {error && <div className="operator-error" role="alert"><strong>Session telemetry unavailable.</strong> {error}</div>}

      <section className="operator-toolbar" aria-label="Session filters">
        <label className="operator-search"><span aria-hidden="true">⌕</span><input value={query} onChange={e => changeQuery(e.target.value)} placeholder="Search username, IP, MAC, router or session ID" aria-label="Search sessions" /><kbd> / </kbd></label>
        <div className="operator-filter-group" role="group" aria-label="Session status">
          {(['ACTIVE','STALE','ENDED',''] as const).map(value => <button key={value || 'ALL'} className={status === value ? 'selected' : ''} aria-pressed={status === value} onClick={() => changeStatus(value)}>{value || 'ALL'}</button>)}
        </div>
        <button className="operator-button subtle" onClick={saveCurrentView}>Save view</button>
        {savedViews.length > 0 && <select className="operator-select" aria-label="Saved session views" value="" onChange={e => { const view = savedViews.find(item => item.name === e.target.value); if (view) applyView(view); }}>
          <option value="">Saved views</option>{savedViews.map(view => <option key={view.name} value={view.name}>{view.name}</option>)}
        </select>}
      </section>

      {selectedRows.length > 0 && <div className="operator-bulkbar" role="region" aria-label="Selected session actions">
        <strong>{selectedRows.length} selected</strong><button onClick={() => downloadCsv(selectedRows)}>Export selected</button><button onClick={async () => { await navigator.clipboard?.writeText(selectedRows.map(row => row.id).join('\n')); }}>Copy IDs</button><button onClick={() => setSelected(new Set())}>Clear</button>
      </div>}

      <section className="operator-surface">
        <div className="operator-surface-head"><div><span>SESSION INVENTORY</span><h2>Connections</h2><p>{filtered.length} visible · {count} returned by the authenticated tenant API</p></div><span className="operator-count">{selectedRows.length ? `${selectedRows.length} selected` : 'Tenant scoped'}</span></div>
        <div className="operator-table-wrap">
          <table className="operator-table">
            <thead><tr><th className="check-col"><input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} aria-label="Select all visible sessions" /></th><th>SESSION</th><th>ADDRESS</th><th>ROUTER</th><th>STARTED</th><th>TRAFFIC</th><th>STATE</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {filtered.map(item => <tr key={item.id} className={expanded === item.id ? 'expanded-row' : ''}>
                <td><input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleRow(item.id)} aria-label={`Select session ${item.id}`} /></td>
                <td><button className="operator-row-trigger" onClick={() => setExpanded(expanded === item.id ? null : item.id)} aria-expanded={expanded === item.id}><strong>{item.username ?? item.customerId ?? 'Unknown session'}</strong><small>{item.id}</small></button></td>
                <td><strong>{item.ipAddress ?? '—'}</strong><small>{item.macAddress ?? 'No MAC evidence'}</small></td>
                <td>{item.routerId ?? '—'}</td><td>{formatDate(item.startedAt)}</td><td>{formatBytes(item.bytesTotal)}</td>
                <td><span className={`operator-status ${item.status.toLowerCase()}`}><i />{item.status}</span></td>
                <td><button className="operator-menu" aria-label={`Toggle details for ${item.id}`} onClick={() => setExpanded(expanded === item.id ? null : item.id)}>⋯</button></td>
                {expanded === item.id && <td colSpan={7} className="operator-expanded-cell"><div className="operator-detail-grid">
                  <div><span>SESSION ID</span><b>{item.id}</b></div><div><span>CUSTOMER</span><b>{item.customerId ?? '—'}</b></div><div><span>BYTES IN</span><b>{formatBytes(item.bytesIn)}</b></div><div><span>BYTES OUT</span><b>{formatBytes(item.bytesOut)}</b></div><div><span>STARTED</span><b>{formatDate(item.startedAt)}</b></div><div><span>ENDED</span><b>{formatDate(item.endedAt)}</b></div><div><span>DURATION</span><b>{item.durationSeconds == null ? '—' : String(item.durationSeconds) + 's'}</b></div><div><span>AUTHENTICATION</span><b>{item.authenticationState ?? 'NOT_REPORTED'}</b></div><div><span>ACCOUNTING</span><b>{item.accountingState ?? 'NOT_REPORTED'}</b></div>
                  <div className="operator-timeline"><span>SESSION TIMELINE</span><ol><li><i />Session record started <time>{formatDate(item.startedAt)}</time></li>{item.endedAt && <li><i />Session ended <time>{formatDate(item.endedAt)}</time></li>}</ol></div>
                  {item.status === 'ACTIVE' && <div className="operator-session-action"><button className="operator-danger-button" disabled={ending === item.id} onClick={() => void disconnectSession(item.id)}>{ending === item.id ? 'Disconnecting…' : 'Disconnect session'}</button></div>}
                </div></td>}
              </tr>)}
            </tbody>
          </table>
          {!loading && !filtered.length && <div className="operator-empty"><strong>{query ? 'No sessions match the current search.' : 'No session records returned.'}</strong><span>No synthetic records are displayed.</span></div>}
          {loading && <div className="operator-empty"><strong>Loading session telemetry…</strong><span>Waiting for the authenticated API response.</span></div>}
        </div>
      </section>
      <style jsx>{`
        .operator-page{min-height:100vh;padding:28px 34px 42px;background:#f4f6f8;color:#172337}.operator-page-header{max-width:1580px;margin:0 auto 16px;display:flex;justify-content:space-between;gap:20px;align-items:flex-end}.operator-page-header h1{margin:6px 0 4px;font-size:30px;letter-spacing:-.035em}.operator-page-header p{margin:0;color:#7f8b9c;font-size:11px;line-height:1.5}.operator-header-actions{display:flex;align-items:center;gap:8px}.operator-data-state{display:inline-flex;align-items:center;gap:7px;color:#68778a;font-size:9px;font-weight:750}.operator-data-state i{width:6px;height:6px;border-radius:50%;background:#3f9b70}.operator-button{height:38px;padding:0 13px;border:1px solid #1c3148;border-radius:7px;background:#1b3046;color:#fff;font-size:9px;font-weight:800}.operator-button.subtle{background:#fff;color:#4f6075;border-color:#d8e0e8}.operator-button:disabled{opacity:.5}.operator-toolbar{max-width:1580px;margin:0 auto 12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}.operator-search{height:38px;min-width:310px;flex:1;display:flex;align-items:center;gap:8px;padding:0 10px;background:#fff;border:1px solid #dce3ea;border-radius:7px;color:#8190a2}.operator-search input{border:0;outline:0;flex:1;font-size:10px;color:#27364a;background:transparent}.operator-search kbd{font-size:8px;border:1px solid #dbe1e8;padding:2px 5px;border-radius:4px}.operator-filter-group{display:flex;border:1px solid #dce3ea;border-radius:7px;overflow:hidden;background:#fff}.operator-filter-group button{height:36px;padding:0 10px;border:0;border-right:1px solid #e8edf2;background:#fff;color:#7a8797;font-size:8px;font-weight:800}.operator-filter-group button:last-child{border-right:0}.operator-filter-group .selected{background:#edf2f6;color:#1d3045}.operator-select{height:38px;border:1px solid #d8e0e8;border-radius:7px;background:#fff;color:#536479;font-size:9px;padding:0 10px}.operator-error{max-width:1580px;margin:0 auto 12px;padding:10px 12px;border:1px solid #e6c7cb;background:#fff6f7;color:#8c414b;font-size:10px}.operator-bulkbar{max-width:1580px;margin:0 auto 8px;padding:8px 10px;background:#1b3046;color:#fff;display:flex;align-items:center;gap:8px;border-radius:7px;font-size:9px}.operator-bulkbar strong{margin-right:auto}.operator-bulkbar button{border:1px solid #617387;background:transparent;color:#fff;border-radius:5px;padding:6px 9px;font-size:8px}.operator-surface{max-width:1580px;margin:0 auto;background:#fff;border:1px solid #dfe5eb;border-radius:9px;overflow:hidden}.operator-surface-head{display:flex;justify-content:space-between;gap:12px;padding:16px 18px;border-bottom:1px solid #e9edf1}.operator-surface-head>div>span{font-size:8px;letter-spacing:.13em;font-weight:850;color:#8c98a7}.operator-surface-head h2{margin:5px 0 3px;font-size:15px}.operator-surface-head p{margin:0;color:#8995a4;font-size:9px}.operator-count{align-self:center;color:#718095;font-size:8px;font-weight:800;text-transform:uppercase}.operator-table-wrap{overflow:auto}.operator-table{width:100%;min-width:920px;border-collapse:collapse}.operator-table th{padding:10px 11px;border-bottom:1px solid #e9edf1;color:#8b96a5;font-size:8px;text-align:left;letter-spacing:.08em}.operator-table td{padding:10px 11px;border-bottom:1px solid #eef1f4;color:#59697e;font-size:9px;vertical-align:top}.operator-table tr:hover>td{background:#fafbfd}.operator-table .check-col{width:35px}.operator-row-trigger{display:grid;text-align:left;gap:3px;border:0;background:transparent;padding:0;color:inherit;cursor:pointer}.operator-row-trigger strong{color:#26364b;font-size:9px}.operator-row-trigger small,.operator-table td small{color:#99a3b0;font-size:8px}.operator-status{display:inline-flex;align-items:center;gap:6px;font-size:8px;font-weight:850}.operator-status i{width:6px;height:6px;border-radius:50%;background:#7c8c9f}.operator-status.active{color:#2d805d}.operator-status.active i{background:#3b9b70}.operator-status.stale{color:#9a742d}.operator-status.stale i{background:#c39a4c}.operator-status.ended{color:#7c8795}.operator-menu{border:0;background:transparent;color:#8491a1;font-size:15px;cursor:pointer}.expanded-row>td{border-bottom:0}.operator-expanded-cell{background:#f8fafb!important;padding:14px 18px!important}.operator-detail-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.operator-detail-grid>div:not(.operator-timeline){display:grid;gap:3px}.operator-detail-grid span{font-size:7px;letter-spacing:.1em;color:#9aa4b0;font-weight:850}.operator-detail-grid b{font-size:9px;color:#34445a;word-break:break-word}.operator-session-action{grid-column:1/-1}.operator-danger-button{min-height:32px;padding:0 10px;border:1px solid #c95766;border-radius:6px;background:#fff6f7;color:#9a4350;font-size:8px;font-weight:850}.operator-danger-button:disabled{opacity:.5}.operator-timeline{grid-column:1/-1;border-top:1px solid #e5eaf0;padding-top:11px}.operator-timeline ol{list-style:none;margin:7px 0 0;padding:0;display:flex;gap:18px;flex-wrap:wrap}.operator-timeline li{display:grid;grid-template-columns:auto 1fr;column-gap:6px;color:#56667b;font-size:8px}.operator-timeline li i{grid-row:span 2;width:6px;height:6px;margin-top:2px;border-radius:50%;background:#5b7592}.operator-timeline time{color:#98a2ae}.operator-empty{min-height:220px;display:grid;place-content:center;text-align:center;gap:5px;color:#8c98a7;font-size:9px}.operator-empty strong{color:#516278;font-size:11px}@media(max-width:800px){.operator-page{padding:20px 13px 78px}.operator-page-header{align-items:flex-start;flex-direction:column}.operator-header-actions{width:100%;justify-content:space-between}.operator-toolbar{align-items:stretch}.operator-search{min-width:100%}.operator-filter-group{flex:1}.operator-filter-group button{flex:1}.operator-detail-grid{grid-template-columns:1fr 1fr}}@media(max-width:520px){.operator-detail-grid{grid-template-columns:1fr}.operator-timeline{grid-column:auto}.operator-page-header h1{font-size:25px}}
        :global(.operator-page button:focus-visible),:global(.operator-page input:focus-visible),:global(.operator-page select:focus-visible){outline:2px solid #2c6ea6;outline-offset:2px}
        @media(prefers-reduced-motion:reduce){:global(.operator-page *){scroll-behavior:auto!important;transition:none!important}}
      `}</style>
    </main>
  );
}
