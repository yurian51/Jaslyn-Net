'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, apiFetch } from '../../lib/api';
import { getAccessToken } from '../../lib/auth';

type AccessBinding = { id:string; customerName?:string; username:string; accessType:string; state:string; routerId?:string|null; packageId?:string|null; expiresAt?:string|null };
type Job = { id:string; customerName?:string; siteName?:string; jobType:string; status:string; priority:string; title:string; scheduledAt?:string|null };
type Site = { id:string; name:string; siteType:string; status:string; latitude?:number|null; longitude?:number|null };
type FiberLine = { id:string; name:string; customerName?:string; technology:string; serviceStatus:string; upstreamBps?:number|null; downstreamBps?:number|null; installationAddress?:string|null };
type Page<T> = { data:T[]; pagination:{ page:number; limit:number; total:number; pages:number } };

type Tab = 'access'|'jobs'|'sites'|'fiber';
const tabs: Array<[Tab,string]> = [['access','Customer access'],['jobs','Field jobs'],['sites','Network sites'],['fiber','Fiber lines']];
const tokenHeaders = (): Record<string, string> => { const token = getAccessToken(); return token ? { Authorization: `Bearer ${token}` } : {}; };
const formatDate = (value?:string|null) => value ? new Date(value).toLocaleString() : '—';
const formatRate = (bps?:number|null) => !bps ? '—' : `${Math.round(bps / 1_000_000)} Mbps`;

export default function IspOperationsPage() {
  const [tab,setTab] = useState<Tab>('access');
  const [access,setAccess] = useState<Page<AccessBinding>|null>(null);
  const [jobs,setJobs] = useState<Page<Job>|null>(null);
  const [sites,setSites] = useState<Page<Site>|null>(null);
  const [fiber,setFiber] = useState<Page<FiberLine>|null>(null);
  const [search,setSearch] = useState('');
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState<string|null>(null);
  const [busyId,setBusyId] = useState<string|null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const query = `?page=1&limit=50${search.trim() ? `&search=${encodeURIComponent(search.trim())}` : ''}`;
      const headers = tokenHeaders();
      const [a,j,s,f] = await Promise.all([
        apiFetch<Page<AccessBinding>>(`/isp/access-bindings${query}`,{headers}),
        apiFetch<Page<Job>>(`/isp/jobs${query}`,{headers}),
        apiFetch<Page<Site>>(`/isp/sites${query}`,{headers}),
        apiFetch<Page<FiberLine>>(`/isp/fiber-lines${query}`,{headers}),
      ]);
      setAccess(a); setJobs(j); setSites(s); setFiber(f);
    } catch (cause:unknown) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Unable to load ISP operations.');
    } finally { setLoading(false); }
  },[search]);

  useEffect(() => { void load(); },[load]);

  const activeAccess = useMemo(() => access?.data.filter(item => item.state === 'ACTIVE').length ?? 0,[access]);
  const openJobs = useMemo(() => jobs?.data.filter(item => !['COMPLETED','CANCELED'].includes(item.status)).length ?? 0,[jobs]);
  const onlineSites = useMemo(() => sites?.data.filter(item => item.status === 'ACTIVE').length ?? 0,[sites]);
  const activeFiber = useMemo(() => fiber?.data.filter(item => item.serviceStatus === 'ACTIVE').length ?? 0,[fiber]);

  const changeAccessState = async (item:AccessBinding) => {
    const next = item.state === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    setBusyId(item.id); setError(null);
    try {
      await apiFetch(`/isp/access-bindings/${item.id}/state`,{method:'PUT',headers:{...tokenHeaders(),'Content-Type':'application/json'},body:JSON.stringify({state:next,reason:next === 'ACTIVE' ? 'Operator resumed access' : 'Operator suspended access'})});
      await load();
    } catch (cause:unknown) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Access state update failed.');
    } finally { setBusyId(null); }
  };

  const updateJob = async (item:Job) => {
    const next = item.status === 'OPEN' ? 'IN_PROGRESS' : item.status === 'IN_PROGRESS' ? 'COMPLETED' : 'OPEN';
    setBusyId(item.id); setError(null);
    try {
      await apiFetch(`/isp/jobs/${item.id}`,{method:'PUT',headers:{...tokenHeaders(),'Content-Type':'application/json'},body:JSON.stringify({status:next,note:`Operator changed job status to ${next}`})});
      await load();
    } catch (cause:unknown) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Job update failed.');
    } finally { setBusyId(null); }
  };

  return <main className="overview-page">
    <header className="overview-header">
      <div><div className="eyebrow">JASLYN NET / ISP OPERATIONS</div><h1>ISP operations control</h1><p className="context">Customer access, field work, network sites and fiber service state from the same tenant-scoped control surface.</p></div>
      <div className="top-actions"><span className={`data-state ${error ? 'danger' : ''}`}><i /> {error ? 'ACTION REQUIRED' : loading ? 'SYNCING' : 'LIVE API DATA'}</span><button className="selector" type="button" onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh operations'}</button></div>
    </header>
    {error && <div className="error-banner" role="alert"><strong>Operation failed.</strong> {error}</div>}

    <section className="kpi-grid overview-kpis" aria-label="ISP operational counters">
      <article className="kpi"><div className="kpi-label"><span>Active access</span><b>ACCESS</b></div><strong>{activeAccess}</strong><div className="kpi-foot"><span>LIVE</span><small>customer bindings</small></div></article>
      <article className="kpi"><div className="kpi-label"><span>Open jobs</span><b>FIELD</b></div><strong>{openJobs}</strong><div className="kpi-foot"><span>QUEUE</span><small>installation &amp; repair work</small></div></article>
      <article className="kpi"><div className="kpi-label"><span>Active sites</span><b>NETWORK</b></div><strong>{onlineSites}</strong><div className="kpi-foot"><span>FABRIC</span><small>operational sites</small></div></article>
      <article className="kpi"><div className="kpi-label"><span>Active fiber</span><b>FIBER</b></div><strong>{activeFiber}</strong><div className="kpi-foot"><span>SERVICE</span><small>fiber service lines</small></div></article>
    </section>

    <section className="panel overview-panel">
      <div className="panel-head"><div><div className="panel-kicker">OPERATIONS</div><h2>Control surfaces</h2><p>Search and operate the ISP entities exposed by the production API.</p></div></div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',marginBottom:16}}>
        {tabs.map(([key,label]) => <button key={key} type="button" className={`selector ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>{label}</button>)}
        <input aria-label="Search ISP operations" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search customer, job, site…" style={{marginLeft:'auto',minWidth:240,padding:'10px 12px',borderRadius:8,border:'1px solid var(--border-color,#ddd)',background:'var(--surface,#fff)'}} />
      </div>

      {tab === 'access' && <div className="table-wrap"><table><thead><tr><th>CUSTOMER</th><th>USERNAME</th><th>TYPE</th><th>STATE</th><th>EXPIRES</th><th>ACTION</th></tr></thead><tbody>{access?.data.length ? access.data.map(item => <tr key={item.id}><td><strong>{item.customerName ?? 'Unknown customer'}</strong></td><td>{item.username}</td><td>{item.accessType}</td><td><span className={`status ${item.state === 'ACTIVE' ? 'active' : ''}`}><i />{item.state}</span></td><td>{formatDate(item.expiresAt)}</td><td><button className="selector" type="button" disabled={busyId === item.id || ['DISABLED','EXPIRED'].includes(item.state)} onClick={() => void changeAccessState(item)}>{busyId === item.id ? 'Saving…' : item.state === 'ACTIVE' ? 'Suspend' : 'Resume'}</button></td></tr>) : <tr><td colSpan={6}><div className="empty-state">{loading ? 'Loading access bindings…' : 'No access bindings returned.'}</div></td></tr>}</tbody></table></div>}

      {tab === 'jobs' && <div className="table-wrap"><table><thead><tr><th>PRIORITY</th><th>JOB</th><th>CUSTOMER</th><th>SITE</th><th>TYPE</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{jobs?.data.length ? jobs.data.map(item => <tr key={item.id}><td><strong>{item.priority}</strong></td><td>{item.title}</td><td>{item.customerName ?? '—'}</td><td>{item.siteName ?? '—'}</td><td>{item.jobType}</td><td>{item.status}</td><td><button className="selector" type="button" disabled={busyId === item.id || ['CANCELED'].includes(item.status)} onClick={() => void updateJob(item)}>{busyId === item.id ? 'Saving…' : item.status === 'OPEN' ? 'Start' : item.status === 'IN_PROGRESS' ? 'Complete' : 'Reopen'}</button></td></tr>) : <tr><td colSpan={7}><div className="empty-state">{loading ? 'Loading field jobs…' : 'No field jobs returned.'}</div></td></tr>}</tbody></table></div>}

      {tab === 'sites' && <div className="table-wrap"><table><thead><tr><th>SITE</th><th>TYPE</th><th>STATUS</th><th>COORDINATES</th></tr></thead><tbody>{sites?.data.length ? sites.data.map(item => <tr key={item.id}><td><strong>{item.name}</strong></td><td>{item.siteType}</td><td>{item.status}</td><td>{item.latitude != null && item.longitude != null ? `${item.latitude}, ${item.longitude}` : 'Not geolocated'}</td></tr>) : <tr><td colSpan={4}><div className="empty-state">{loading ? 'Loading network sites…' : 'No network sites returned.'}</div></td></tr>}</tbody></table></div>}

      {tab === 'fiber' && <div className="table-wrap"><table><thead><tr><th>LINE</th><th>CUSTOMER</th><th>TECHNOLOGY</th><th>STATUS</th><th>CAPACITY</th><th>INSTALLATION</th></tr></thead><tbody>{fiber?.data.length ? fiber.data.map(item => <tr key={item.id}><td><strong>{item.name}</strong></td><td>{item.customerName ?? '—'}</td><td>{item.technology}</td><td>{item.serviceStatus}</td><td>{formatRate(item.upstreamBps)} ↑ / {formatRate(item.downstreamBps)} ↓</td><td>{item.installationAddress ?? '—'}</td></tr>) : <tr><td colSpan={6}><div className="empty-state">{loading ? 'Loading fiber lines…' : 'No fiber lines returned.'}</div></td></tr>}</tbody></table></div>}

      <div className="overview-footer-metrics"><span>Access records: <b>{access?.pagination.total ?? 0}</b></span><span>Jobs: <b>{jobs?.pagination.total ?? 0}</b></span><span>Sites: <b>{sites?.pagination.total ?? 0}</b></span><span>Fiber lines: <b>{fiber?.pagination.total ?? 0}</b></span></div>
    </section>
  </main>;
}
