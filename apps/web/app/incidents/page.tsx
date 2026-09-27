'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { getAccessToken } from '../../lib/auth';
import { apiFetch } from '../../lib/api';

type Incident = {
  id: string;
  tenantId: string;
  tenantName: string;
  category: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  title: string;
  summary?: string;
  rootResourceType?: string;
  rootResourceId?: string;
  startedAt: string;
  lastSeenAt: string;
  resolvedAt?: string;
  affectedResources: number;
  affectedDevices: number;
  affectedCustomers: number;
  affectedSessions: number;
  estimatedRevenue: string | number;
  assigneeUserId?: string | null;
};

type IncidentResponse = { data: Incident[]; count: number };
type IncidentStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | '';
type SavedView = { name: string; status: IncidentStatus; query: string };
type AuditEntry = { id: string; action: string; actorName?: string | null; createdAt: string; metadata?: Record<string, unknown> };


const money = (value: string | number) => Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
};

function downloadCsv(rows: Incident[]) {
  const keys: Array<keyof Incident> = ['id', 'severity', 'status', 'category', 'title', 'rootResourceType', 'rootResourceId', 'affectedResources', 'affectedCustomers', 'affectedSessions', 'estimatedRevenue', 'startedAt', 'lastSeenAt'];
  const csv = [keys, ...rows.map((row) => keys.map((key) => JSON.stringify(row[key] ?? '')))]
    .map((row) => row.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'jaslyn-incidents.csv';
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function IncidentsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [data, setData] = useState<IncidentResponse | null>(null);
  const [status, setStatus] = useState<IncidentStatus>((params.get('status') as IncidentStatus) || '');
  const [query, setQuery] = useState(params.get('q') || '');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [auditByIncident, setAuditByIncident] = useState<Record<string, AuditEntry[]>>({});

  const syncUrl = useCallback((nextStatus: IncidentStatus, nextQuery: string) => {
    const next = new URLSearchParams(params.toString());
    nextStatus ? next.set('status', nextStatus) : next.delete('status');
    nextQuery.trim() ? next.set('q', nextQuery.trim()) : next.delete('q');
    const search = next.toString();
    router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  useEffect(() => {
    const stored = window.localStorage.getItem('jaslyn.incidents.savedViews');
    if (stored) {
      try { setSavedViews(JSON.parse(stored)); } catch { setSavedViews([]); }
    }
  }, []);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) { setError('Authentication required.'); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const queryString = status ? `?status=${encodeURIComponent(status)}` : '';
      const response = await apiFetch<IncidentResponse>(`/incidents${queryString}`, { headers: { Authorization: `Bearer ${token}` } });
      setData({ data: Array.isArray(response.data) ? response.data : [], count: Number(response.count) || 0 });
      setSelected(new Set());
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Unable to load incidents.');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  async function action(id: string, kind: 'acknowledge' | 'resolve') {
    const token = getAccessToken();
    if (!token) return;
    setBusy(id);
    setError(null);
    try {
      await apiFetch(`/incidents/${id}/${kind}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(kind === 'resolve' ? { body: JSON.stringify({ resolution: 'Resolved by operator from Incident Center' }) } : {}),
      });
      await load();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Incident action failed.');
    } finally {
      setBusy(null);
    }
  }

  const incidents = data?.data ?? [];
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return incidents;
    return incidents.filter((item) =>
      `${item.id} ${item.title} ${item.category} ${item.severity} ${item.status} ${item.rootResourceType ?? ''} ${item.rootResourceId ?? ''}`.toLowerCase().includes(needle),
    );
  }, [incidents, query]);

  const open = filtered.filter((item) => item.status === 'OPEN').length;
  const acknowledged = filtered.filter((item) => item.status === 'ACKNOWLEDGED').length;
  const affectedCustomers = filtered.reduce((sum, item) => sum + item.affectedCustomers, 0);
  const critical = filtered.filter((item) => item.severity === 'CRITICAL' && item.status !== 'RESOLVED').length;
  const allSelected = filtered.length > 0 && filtered.every((item) => selected.has(item.id));

  function toggleAll() {
    setSelected((current) => {
      const next = new Set(current);
      if (allSelected) filtered.forEach((item) => next.delete(item.id));
      else filtered.forEach((item) => next.add(item.id));
      return next;
    });
  }

  function toggleRow(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function loadAudit(id: string) {
    const token = getAccessToken();
    if (!token) return;
    try {
      const response = await apiFetch<{ data: AuditEntry[] }>(`/incidents/${id}/audit-trail`, { headers: { Authorization: `Bearer ${token}` } });
      setAuditByIncident((current) => ({ ...current, [id]: Array.isArray(response.data) ? response.data : [] }));
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Unable to load incident audit trail.');
    }
  }

  async function assignIncident(id: string) {
    const assigneeUserId = window.prompt('Tenant user ID to assign this incident to. Leave blank to unassign.');
    if (assigneeUserId === null) return;
    const token = getAccessToken();
    if (!token) return;
    setBusy(id);
    try {
      await apiFetch(`/incidents/${id}/assign`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigneeUserId: assigneeUserId.trim() || null }),
      });
      await load();
      await loadAudit(id);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Incident assignment failed.');
    } finally {
      setBusy(null);
    }
  }

  function saveCurrentView() {
    const name = window.prompt('Saved view name');
    if (!name?.trim()) return;
    const next = [...savedViews.filter((view) => view.name !== name.trim()), { name: name.trim(), status, query }];
    setSavedViews(next);
    window.localStorage.setItem('jaslyn.incidents.savedViews', JSON.stringify(next));
  }

  function applyView(view: SavedView) {
    setStatus(view.status);
    setQuery(view.query);
    syncUrl(view.status, view.query);
  }

  const selectedRows = filtered.filter((item) => selected.has(item.id));

  return (
    <main className="incident-page">
      <header className="incident-header">
        <div>
          <div className="eyebrow">JASLYN NET / OPERATIONS</div>
          <h1>Incident Center</h1>
          <p>Correlate infrastructure failures with affected subscribers, sessions and measurable business exposure.</p>
        </div>
        <div className="incident-actions">
          <span className="incident-telemetry"><i />{loading ? 'Refreshing telemetry' : error ? 'Telemetry unavailable' : 'API telemetry'}</span>
          <button className="incident-refresh" onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
        </div>
      </header>

      {error && <div className="error-banner" role="alert"><strong>Incident telemetry unavailable.</strong> {error}</div>}

      <section className="incident-toolbar" aria-label="Incident filters">
        <label className="incident-search">
          <span aria-hidden="true">⌕</span>
          <input value={query} onChange={(event) => { setQuery(event.target.value); syncUrl(status, event.target.value); }} placeholder="Search incident, resource, category or ID" aria-label="Search incidents" />
          <kbd>/</kbd>
        </label>
        <div className="incident-filter-group" role="group" aria-label="Incident status">
          {(['', 'OPEN', 'ACKNOWLEDGED', 'RESOLVED'] as const).map((value) => (
            <button key={value || 'ALL'} className={status === value ? 'selected' : ''} aria-pressed={status === value} onClick={() => { setStatus(value); syncUrl(value, query); }}>{value || 'ALL'}</button>
          ))}
        </div>
        <button className="incident-button subtle" onClick={saveCurrentView}>Save view</button>
        {savedViews.length > 0 && (
          <select className="incident-select" aria-label="Saved incident views" value="" onChange={(event) => {
            const view = savedViews.find((item) => item.name === event.target.value);
            if (view) applyView(view);
          }}>
            <option value="">Saved views</option>
            {savedViews.map((view) => <option key={view.name} value={view.name}>{view.name}</option>)}
          </select>
        )}
      </section>

      {selectedRows.length > 0 && (
        <div className="incident-bulkbar" role="region" aria-label="Selected incident actions">
          <strong>{selectedRows.length} selected</strong>
          <button onClick={() => downloadCsv(selectedRows)}>Export selected</button>
          <button onClick={() => navigator.clipboard?.writeText(selectedRows.map((item) => item.id).join('\n'))}>Copy IDs</button>
          <button onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      <section className="incident-kpis" aria-label="Incident posture">
        <article><span>OPEN INCIDENTS</span><strong>{open}</strong><small>awaiting operator action</small></article>
        <article><span>ACKNOWLEDGED</span><strong>{acknowledged}</strong><small>under active investigation</small></article>
        <article><span>AFFECTED CUSTOMERS</span><strong>{affectedCustomers}</strong><small>reported by incident records</small></article>
        <article><span>CRITICAL ACTIVE</span><strong>{critical}</strong><small>requires immediate review</small></article>
      </section>

      <section className="incident-panel">
        <div className="panel-head">
          <div><div className="panel-kicker">OPERATIONAL EVENT CORRELATION</div><h2>Incident inventory</h2><p>{filtered.length} visible · stored incident relationships only.</p></div>
          <span className="panel-badge">{selectedRows.length ? `${selectedRows.length} SELECTED` : `${data?.count ?? 0} RECORDS`}</span>
        </div>
        <div className="incident-table-wrap">
          <table>
            <thead><tr><th className="check-col"><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all visible incidents" /></th><th>SEVERITY</th><th>INCIDENT</th><th>ROOT RESOURCE</th><th>IMPACT</th><th>EXPOSURE</th><th>LAST SEEN</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} className={expanded === item.id ? 'expanded-row' : ''}>
                  <td><input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleRow(item.id)} aria-label={`Select incident ${item.id}`} /></td>
                  <td><span className={`severity ${item.severity.toLowerCase()}`}><i />{item.severity}</span></td>
                  <td>
                    <button className="incident-row-trigger" onClick={() => { const next = expanded === item.id ? null : item.id; setExpanded(next); if (next) void loadAudit(next); }} aria-expanded={expanded === item.id}>
                      <strong>{item.title}</strong><small>{item.category} · {item.status} · {item.id}</small>
                    </button>
                  </td>
                  <td><span className="resource-type">{item.rootResourceType || '—'}</span><small>{item.rootResourceId || 'No resource ID'}</small></td>
                  <td><strong>{item.affectedCustomers}</strong> customers<small>{item.affectedSessions} sessions · {item.affectedResources} resources</small></td>
                  <td><strong>TSh {money(item.estimatedRevenue)}</strong><small>estimated exposure</small></td>
                  <td><time>{fmt(item.lastSeenAt)}</time><small>Started {fmt(item.startedAt)}</small></td>
                  <td>
                    <div className="row-actions">
                      {item.status === 'OPEN' && <button disabled={busy === item.id} onClick={() => void action(item.id, 'acknowledge')}>Acknowledge</button>}
                      {item.status !== 'RESOLVED' && <button className="resolve" disabled={busy === item.id} onClick={() => void action(item.id, 'resolve')}>{busy === item.id ? 'Working…' : 'Resolve'}</button>}
                      <button className="menu" onClick={() => setExpanded(expanded === item.id ? null : item.id)} aria-label={`Toggle incident details for ${item.id}`}>⋯</button>
                    </div>
                  </td>
                  {expanded === item.id && (
                    <td colSpan={7} className="incident-expanded-cell">
                      <div className="incident-detail-grid">
                        <div><span>INCIDENT ID</span><b>{item.id}</b></div><div><span>AFFECTED TENANT</span><b>{item.tenantName} · {item.tenantId}</b></div>
                        <div><span>ROOT RESOURCE</span><b>{item.rootResourceType || '—'} · {item.rootResourceId || '—'}</b></div>
                        <div><span>ASSIGNEE</span><b>{item.assigneeUserId || 'Unassigned'}</b></div>
                        <div><span>BUSINESS EXPOSURE</span><b>TSh {money(item.estimatedRevenue)}</b></div>
                        <div><span>AFFECTED DEVICES</span><b>{item.affectedDevices}</b></div><div><span>AFFECTED CUSTOMERS</span><b>{item.affectedCustomers}</b></div>
                        <div><span>AFFECTED SESSIONS</span><b>{item.affectedSessions}</b></div>
                        <div><span>AFFECTED RESOURCES</span><b>{item.affectedResources}</b></div>
                        {item.summary && <div className="incident-summary"><span>SUMMARY</span><p>{item.summary}</p></div>}
                        <div className="incident-timeline">
                          <span>AUDIT TRAIL</span>
                          <ol>{(auditByIncident[item.id] ?? []).slice(-8).map((entry) => <li key={entry.id} className="done"><i /><span>{entry.action}<time>{entry.actorName || 'System'} · {fmt(entry.createdAt)}</time></span></li>)}</ol>
                        </div>
                        <div className="incident-timeline">
                          <span>INCIDENT TIMELINE</span>
                          <ol>
                            <li className="done"><i /><span>Started<time>{fmt(item.startedAt)}</time></span></li>
                            <li className={item.status === 'OPEN' ? 'current' : 'done'}><i /><span>{item.status === 'OPEN' ? 'Open' : 'Acknowledged'}<time>{fmt(item.lastSeenAt)}</time></span></li>
                            {item.status === 'RESOLVED' && <li className="done"><i /><span>Resolved<time>{fmt(item.resolvedAt)}</time></span></li>}
                          </ol>
                        </div>
                        <div className="incident-detail-actions"><button disabled={busy === item.id} onClick={() => void assignIncident(item.id)}>Assign / unassign</button>
                          {item.status === 'OPEN' && <button disabled={busy === item.id} onClick={() => void action(item.id, 'acknowledge')}>Acknowledge incident</button>}
                          {item.status !== 'RESOLVED' && <button className="resolve" disabled={busy === item.id} onClick={() => void action(item.id, 'resolve')}>Resolve incident</button>}
                        </div>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {loading && <div className="empty-state"><strong>Loading incident telemetry…</strong><span>Waiting for the authenticated incident API.</span></div>}
          {!loading && !filtered.length && <div className="empty-state"><strong>{query ? 'No incidents match the current search.' : 'No incident records'}</strong><span>No synthetic incident events are generated.</span></div>}
        </div>
      </section>

      <footer className="footer"><span>JASLYN NET · Incident Center</span><span>Tenant-scoped operational events</span></footer>

      <style jsx>{`
        .incident-page{min-height:100vh;background:#f4f6f8;color:#152033;padding:28px 34px 42px}.incident-header{max-width:1580px;margin:0 auto 14px;display:flex;justify-content:space-between;align-items:flex-end;gap:20px}.incident-header h1{margin:6px 0 4px;font-size:30px;letter-spacing:-.035em}.incident-header p{margin:0;color:#7f8b9c;font-size:11px;line-height:1.5}.incident-actions{display:flex;align-items:center;gap:10px}.incident-telemetry{display:inline-flex;align-items:center;gap:7px;color:#68778a;font-size:9px;font-weight:750}.incident-telemetry i{width:6px;height:6px;border-radius:50%;background:#3b9b70}.incident-refresh{height:38px;padding:0 13px;border:1px solid #1b3046;border-radius:7px;background:#1b3046;color:#fff;font-size:9px;font-weight:800}.incident-refresh:disabled{opacity:.55}.error-banner{max-width:1580px;margin:0 auto 10px;padding:10px 12px;border:1px solid #e6c7cb;background:#fff6f7;color:#8c414b;font-size:10px}.incident-toolbar{max-width:1580px;margin:0 auto 10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}.incident-search{height:38px;min-width:300px;flex:1;display:flex;align-items:center;gap:8px;padding:0 10px;background:#fff;border:1px solid #dce3ea;border-radius:7px;color:#8190a2}.incident-search input{border:0;outline:0;flex:1;font-size:10px;color:#27364a;background:transparent}.incident-search kbd{font-size:8px;border:1px solid #dbe1e8;padding:2px 5px;border-radius:4px}.incident-filter-group{display:flex;border:1px solid #dce3ea;border-radius:7px;overflow:hidden;background:#fff}.incident-filter-group button{height:36px;padding:0 10px;border:0;border-right:1px solid #e8edf2;background:#fff;color:#7a8797;font-size:8px;font-weight:800}.incident-filter-group button:last-child{border-right:0}.incident-filter-group .selected{background:#edf2f6;color:#1d3045}.incident-button.subtle,.incident-select{height:38px;border:1px solid #d8e0e8;border-radius:7px;background:#fff;color:#536479;font-size:9px;padding:0 10px}.incident-bulkbar{max-width:1580px;margin:0 auto 8px;padding:8px 10px;background:#1b3046;color:#fff;display:flex;align-items:center;gap:8px;border-radius:7px;font-size:9px}.incident-bulkbar strong{margin-right:auto}.incident-bulkbar button{border:1px solid #617387;background:transparent;color:#fff;border-radius:5px;padding:6px 9px;font-size:8px}.incident-kpis{max-width:1580px;margin:0 auto 12px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border:1px solid #dfe5eb;background:#fff}.incident-kpis article{padding:13px 16px;border-right:1px solid #e9edf1}.incident-kpis article:last-child{border-right:0}.incident-kpis span{display:block;color:#8d98a6;font-size:8px;letter-spacing:.1em;font-weight:850}.incident-kpis strong{display:block;margin-top:6px;color:#25364b;font-size:21px}.incident-kpis small{display:block;margin-top:3px;color:#929daa;font-size:8px}.incident-panel{max-width:1580px;margin:0 auto;background:#fff;border:1px solid #dfe5eb;border-radius:9px;overflow:hidden}.panel-head{display:flex;justify-content:space-between;gap:18px;padding:16px 18px;border-bottom:1px solid #e9edf1}.panel-kicker{color:#8995a5;font-size:8px;letter-spacing:.13em;font-weight:850}.panel h2{margin:5px 0 3px;font-size:15px}.panel-head p{margin:0;color:#8995a5;font-size:9px}.panel-badge{align-self:center;color:#718095;font-size:8px;font-weight:850}.incident-table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:1120px}th{padding:10px 11px;text-align:left;border-bottom:1px solid #e9edf1;color:#8b96a5;font-size:8px;letter-spacing:.08em;font-weight:850}td{padding:10px 11px;border-bottom:1px solid #eef1f4;color:#59697e;font-size:9px;vertical-align:top}tr:hover>td{background:#fafbfd}.check-col{width:35px}.incident-row-trigger{display:grid;text-align:left;gap:3px;border:0;background:transparent;padding:0;color:inherit;cursor:pointer}.incident-row-trigger strong{color:#26364b;font-size:9px}.incident-row-trigger small,td small{color:#99a3b0;font-size:8px;line-height:1.4}.severity{display:inline-flex;align-items:center;gap:6px;font-size:8px;font-weight:850;letter-spacing:.05em}.severity i{width:6px;height:6px;border-radius:50%;background:#7890ad}.severity.critical{color:#bd5360}.severity.critical i{background:#c95766}.severity.warning{color:#a87720}.severity.warning i{background:#bd862d}.severity.info{color:#56769c}.severity.info i{background:#668bb2}.resource-type{display:block;color:#52657e;font-size:9px;font-weight:750}.row-actions{display:flex;gap:5px;white-space:nowrap}.row-actions button,.incident-detail-actions button{min-height:31px;padding:0 9px;border:1px solid #dce3eb;border-radius:6px;background:#fff;color:#5e6d80;font-size:8px;font-weight:750}.row-actions .resolve,.incident-detail-actions .resolve{border-color:#19344f;background:#17304a;color:#fff}.row-actions button:disabled,.incident-detail-actions button:disabled{opacity:.5}.row-actions .menu{font-size:15px;padding:0 7px}.expanded-row>td{border-bottom:0}.incident-expanded-cell{background:#f8fafb!important;padding:14px 18px!important}.incident-detail-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.incident-detail-grid>div:not(.incident-timeline):not(.incident-summary):not(.incident-detail-actions){display:grid;gap:3px}.incident-detail-grid span{font-size:7px;letter-spacing:.1em;color:#9aa4b0;font-weight:850}.incident-detail-grid b{font-size:9px;color:#34445a;word-break:break-word}.incident-summary{grid-column:1/-1;border-top:1px solid #e5eaf0;padding-top:10px}.incident-summary p{margin:5px 0 0;color:#66758a;font-size:9px;line-height:1.5}.incident-timeline{grid-column:1/-1;border-top:1px solid #e5eaf0;padding-top:10px}.incident-timeline ol{list-style:none;margin:7px 0 0;padding:0;display:flex;gap:18px;flex-wrap:wrap}.incident-timeline li{display:flex;gap:7px;color:#56667b;font-size:8px}.incident-timeline li i{width:6px;height:6px;margin-top:2px;border-radius:50%;background:#9aa6b4}.incident-timeline li.done i{background:#3b9b70}.incident-timeline li.current i{background:#bd862d}.incident-timeline time{display:block;color:#98a2ae;margin-top:2px}.incident-detail-actions{grid-column:1/-1;display:flex;gap:6px}.empty-state{min-height:220px;display:grid;place-content:center;text-align:center;gap:5px;color:#8b97a6;font-size:9px}.empty-state strong{color:#53657a;font-size:11px}.footer{max-width:1580px;margin:12px auto 0;display:flex;justify-content:space-between;color:#9aa4b1;font-size:9px}@media(max-width:900px){.incident-header{align-items:flex-start;flex-direction:column}.incident-actions{width:100%;justify-content:space-between}.incident-search{min-width:100%}.incident-filter-group{flex:1}.incident-filter-group button{flex:1}.incident-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.incident-kpis article:nth-child(2){border-right:0}.incident-kpis article:nth-child(-n+2){border-bottom:1px solid #e9edf1}.incident-detail-grid{grid-template-columns:1fr 1fr}}@media(max-width:520px){.incident-page{padding:20px 13px 82px}.incident-header h1{font-size:25px}.incident-kpis{grid-template-columns:1fr}.incident-kpis article{border-right:0!important;border-bottom:1px solid #e9edf1}.incident-kpis article:last-child{border-bottom:0}.incident-detail-grid{grid-template-columns:1fr}.incident-summary,.incident-timeline,.incident-detail-actions{grid-column:auto}.footer{display:none}}:global(.incident-page button:focus-visible),:global(.incident-page input:focus-visible),:global(.incident-page select:focus-visible){outline:2px solid #2c6ea6;outline-offset:2px}@media(prefers-reduced-motion:reduce){:global(.incident-page *){scroll-behavior:auto!important;transition:none!important}}
      `}</style>
    </main>
  );
}
