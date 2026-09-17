'use client';

import { useCallback, useEffect, useState } from 'react';
import { getAccessToken } from '../../lib/auth';
import { apiFetch } from '../../lib/api';

type Incident = {
  id: string;
  category: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  title: string;
  summary?: string;
  rootResourceType?: string;
  rootResourceId?: string;
  startedAt: string;
  lastSeenAt: string;
  affectedResources: number;
  affectedCustomers: number;
  affectedSessions: number;
  estimatedRevenue: string | number;
};

type IncidentResponse = { data: Incident[]; count: number };
const money = (value: string | number) => Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (value: string) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(); };

export default function IncidentsPage() {
  const [data, setData] = useState<IncidentResponse | null>(null);
  const [status, setStatus] = useState<'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) { setError('Authentication required.'); setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const query = status ? `?status=${status}` : '';
      setData(await apiFetch<IncidentResponse>(`/incidents${query}`, { headers: { Authorization: `Bearer ${token}` } }));
    } catch (cause: unknown) { setError(cause instanceof Error ? cause.message : 'Unable to load incidents.'); }
    finally { setLoading(false); }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  async function action(id: string, kind: 'acknowledge' | 'resolve') {
    const token = getAccessToken();
    if (!token) return;
    setBusy(id); setError(null);
    try {
      await apiFetch(`/incidents/${id}/${kind}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(kind === 'resolve' ? { body: JSON.stringify({ resolution: 'Resolved by operator from Incident Center' }) } : {}),
      });
      await load();
    } catch (cause: unknown) { setError(cause instanceof Error ? cause.message : 'Incident action failed.'); }
    finally { setBusy(null); }
  }

  const incidents = data?.data ?? [];
  const open = incidents.filter((item) => item.status === 'OPEN').length;
  const acknowledged = incidents.filter((item) => item.status === 'ACKNOWLEDGED').length;
  const affectedCustomers = incidents.reduce((sum, item) => sum + item.affectedCustomers, 0);
  const critical = incidents.filter((item) => item.severity === 'CRITICAL' && item.status !== 'RESOLVED').length;

  return <main className="incident-page">
    <header className="incident-header">
      <div><div className="eyebrow">JASLYN NET / OPERATIONS</div><h1>Incident Center</h1><p>Correlate infrastructure failures with affected subscribers, sessions and measurable business exposure.</p></div>
      <div className="incident-actions"><label className="incident-filter">Status<select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="">All states</option><option value="OPEN">Open</option><option value="ACKNOWLEDGED">Acknowledged</option><option value="RESOLVED">Resolved</option></select></label><button className="incident-refresh" onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button></div>
    </header>
    {error && <div className="error-banner" role="alert">{error}</div>}
    <section className="incident-kpis">
      <article><span>OPEN INCIDENTS</span><strong>{open}</strong><small>awaiting operator action</small></article>
      <article><span>ACKNOWLEDGED</span><strong>{acknowledged}</strong><small>under active investigation</small></article>
      <article><span>AFFECTED CUSTOMERS</span><strong>{affectedCustomers}</strong><small>reported by incident records</small></article>
      <article><span>CRITICAL ACTIVE</span><strong>{critical}</strong><small>requires immediate review</small></article>
    </section>
    <section className="panel incident-panel">
      <div className="panel-head"><div><div className="panel-kicker">OPERATIONAL EVENT CORRELATION</div><h2>Incident inventory</h2><p>Only stored incident relationships are displayed. No synthetic network-health data is generated.</p></div><span className="panel-badge">{data?.count ?? 0} RECORDS</span></div>
      {loading ? <div className="empty-state">Loading incident intelligence…</div> : !incidents.length ? <div className="empty-state"><strong>No incident records</strong><span>No incidents are stored for the selected filter.</span></div> : <div className="incident-table-wrap"><table><thead><tr><th>SEVERITY</th><th>INCIDENT</th><th>ROOT RESOURCE</th><th>IMPACT</th><th>BUSINESS EXPOSURE</th><th>STARTED</th><th>ACTIONS</th></tr></thead><tbody>{incidents.map((item) => <tr key={item.id}>
        <td><span className={`severity ${item.severity.toLowerCase()}`}><i />{item.severity}</span></td>
        <td><strong>{item.title}</strong><small>{item.category} · {item.status}</small>{item.summary && <p>{item.summary}</p>}</td>
        <td><span className="resource-type">{item.rootResourceType || '—'}</span><small>{item.rootResourceId || 'No resource ID'}</small></td>
        <td><strong>{item.affectedCustomers}</strong> customers<small>{item.affectedSessions} sessions · {item.affectedResources} resources</small></td>
        <td><strong>TSh {money(item.estimatedRevenue)}</strong><small>estimated exposure</small></td>
        <td><time>{fmt(item.startedAt)}</time><small>Last seen {fmt(item.lastSeenAt)}</small></td>
        <td><div className="row-actions">{item.status === 'OPEN' && <button disabled={busy === item.id} onClick={() => void action(item.id, 'acknowledge')}>Acknowledge</button>}{item.status !== 'RESOLVED' && <button className="resolve" disabled={busy === item.id} onClick={() => void action(item.id, 'resolve')}>{busy === item.id ? 'Working…' : 'Resolve'}</button>}</div></td>
      </tr>)}</tbody></table></div>}
    </section>
    <footer className="footer"><span>JASLYN NET · Incident Center</span><span>Tenant-scoped operational events</span></footer>
    <style jsx>{`
      .incident-page{min-height:100vh;background:#f5f7fa;color:#152033;padding:34px 42px 42px}.incident-header{max-width:1580px;margin:0 auto 22px;display:flex;justify-content:space-between;align-items:flex-end;gap:20px}.incident-header h1{margin:7px 0 5px;font-size:31px;letter-spacing:-.04em;line-height:1.08}.incident-header p{margin:0;color:#8793a3;font-size:12px;line-height:1.55}.incident-actions{display:flex;align-items:flex-end;gap:8px}.incident-filter{display:grid;gap:5px;color:#6f7d90;font-size:9px;font-weight:750}.incident-filter select{height:40px;min-width:150px;border:1px solid #dfe5ec;border-radius:8px;padding:0 10px;background:#fff;color:#263247;font-size:10px;outline:0}.incident-refresh{height:40px;padding:0 14px;border:1px solid #17263a;border-radius:8px;background:#17263a;color:#fff;font-size:10px;font-weight:750}.incident-refresh:disabled{opacity:.55}.error-banner{max-width:1580px;margin:0 auto 12px}.incident-kpis{max-width:1580px;margin:0 auto 14px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.incident-kpis article{min-height:112px;padding:17px 18px;background:#fff;border:1px solid #e1e6ed;border-radius:11px;box-shadow:0 5px 18px rgba(15,23,42,.025)}.incident-kpis span{display:block;color:#8995a5;font-size:8px;letter-spacing:.12em;font-weight:800}.incident-kpis strong{display:block;margin-top:13px;color:#152033;font-size:25px;letter-spacing:-.03em}.incident-kpis small{display:block;margin-top:5px;color:#929dab;font-size:9px}.panel{max-width:1580px;margin:0 auto;background:#fff;border:1px solid #e1e6ed;border-radius:12px;box-shadow:0 6px 22px rgba(15,23,42,.03)}.panel-head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;padding:19px 20px;border-bottom:1px solid #edf0f4}.panel-kicker{color:#8995a5;font-size:9px;letter-spacing:.13em;font-weight:800}.panel h2{margin:6px 0 4px;font-size:16px}.panel-head p{margin:0;color:#8995a5;font-size:10px}.panel-badge{padding:7px 9px;border:1px solid #e6eaf0;border-radius:7px;color:#7a8798;background:#fafbfd;font-size:8px;font-weight:800}.incident-table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:1120px}th{padding:11px 12px;text-align:left;border-bottom:1px solid #edf0f4;color:#929dac;font-size:8px;letter-spacing:.09em;font-weight:800}td{padding:13px 12px;border-bottom:1px solid #f0f2f5;color:#627086;font-size:10px;vertical-align:top}td strong{color:#253247;font-size:10px}td small{display:block;margin-top:4px;color:#98a2b0;font-size:8px;line-height:1.45}td p{margin:6px 0 0;color:#8793a3;font-size:9px;line-height:1.45;max-width:300px}.severity{display:inline-flex;align-items:center;gap:6px;font-size:8px;font-weight:850;letter-spacing:.05em}.severity i{width:6px;height:6px;border-radius:50%;background:#7890ad}.severity.critical{color:#bd5360}.severity.critical i{background:#c95766}.severity.warning{color:#a87720}.severity.warning i{background:#bd862d}.severity.info{color:#56769c}.severity.info i{background:#668bb2}.resource-type{display:block;color:#52657e;font-size:9px;font-weight:750}.row-actions{display:flex;gap:6px;white-space:nowrap}.row-actions button{min-height:32px;padding:0 9px;border:1px solid #dce3eb;border-radius:7px;background:#fff;color:#5e6d80;font-size:8px;font-weight:750}.row-actions button:hover:not(:disabled){background:#f7f9fb}.row-actions .resolve{border-color:#19344f;background:#17304a;color:#fff}.row-actions button:disabled{opacity:.5}.empty-state{min-height:250px;display:grid;place-items:center;align-content:center;gap:6px;color:#8b97a6;font-size:10px;text-align:center}.empty-state strong{color:#53657a;font-size:12px}.footer{max-width:1580px;margin:14px auto 0;display:flex;justify-content:space-between;color:#9aa4b1;font-size:9px}@media(max-width:900px){.incident-header{align-items:flex-start;flex-direction:column}.incident-actions{width:100%}.incident-filter{flex:1}.incident-filter select{width:100%}.incident-refresh{flex:0 0 auto}.incident-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:560px){.incident-page{padding:20px 13px 82px}.incident-header h1{font-size:25px}.incident-actions{align-items:stretch}.incident-kpis{grid-template-columns:1fr;gap:8px}.incident-kpis article{min-height:92px}.panel-head{padding:15px}.footer{display:none}}
    `}</style>
  </main>;
}
