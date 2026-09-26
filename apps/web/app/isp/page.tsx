'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, apiFetch } from '../../lib/api';
import { getAccessToken } from '../../lib/auth';
import BrandLogo from '../brand-logo';

type AccessBinding = { id:string; customerName?:string; username:string; accessType:string; state:string; routerId?:string|null; packageId?:string|null; expiresAt?:string|null };
type Job = { id:string; customerName?:string; siteName?:string; jobType:string; status:string; priority:string; title:string; scheduledAt?:string|null };
type Site = { id:string; name:string; siteType:string; status:string; latitude?:number|null; longitude?:number|null };
type FiberLine = { id:string; name:string; customerName?:string; technology:string; serviceStatus:string; upstreamBps?:number|null; downstreamBps?:number|null; installationAddress?:string|null };
type Page<T> = { data:T[]; pagination:{ page:number; limit:number; total:number; pages:number } };
type Tab = 'access' | 'jobs' | 'sites' | 'fiber';

const tabs: Array<[Tab, string]> = [
  ['access', 'Customer access'],
  ['jobs', 'Field jobs'],
  ['sites', 'Network sites'],
  ['fiber', 'Fiber lines'],
];

const tokenHeaders = (): Record<string, string> => {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Invalid timestamp' : date.toLocaleString();
};

const formatRate = (bps?: number | null) => !bps ? '—' : `${Math.round(bps / 1_000_000)} Mbps`;

function Icon({ name }: { name: 'isp' | 'refresh' | 'search' | 'users' | 'jobs' | 'site' | 'fiber' | 'alert' | 'play' | 'pause' | 'check' }) {
  const paths = {
    isp: <><path d="M4 18h16" /><path d="M7 18V9l5-4 5 4v9" /><path d="M10 18v-5h4v5" /><path d="M9 9h.01M15 9h.01" /></>,
    refresh: <><path d="M20 11a8 8 0 0 0-14.8-4.1L4 9" /><path d="M4 5v4h4" /><path d="M4 13a8 8 0 0 0 14.8 4.1L20 15" /><path d="M20 19v-4h-4" /></>,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
    users: <><circle cx="9" cy="8" r="3" /><path d="M4 19c.5-3 2-4.6 5-4.6s4.5 1.6 5 4.6" /><path d="M15 6.8a3 3 0 0 1 0 5.6M17.3 14.6c1.6.6 2.7 1.9 3 4.4" /></>,
    jobs: <><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M8 9h8M8 13h5M8 17h8" /></>,
    site: <><path d="M12 21s6-5.1 6-10a6 6 0 1 0-12 0c0 4.9 6 10 6 10Z" /><circle cx="12" cy="11" r="2" /></>,
    fiber: <><path d="M4 7h16M4 12h16M4 17h16" /><circle cx="7" cy="7" r="1" /><circle cx="17" cy="17" r="1" /><path d="M10 7v10" /></>,
    alert: <><path d="m12 3 9 17H3L12 3Z" /><path d="M12 9v4M12 16h.01" /></>,
    play: <path d="m9 6 8 6-8 6V6Z" />,
    pause: <><rect x="7" y="6" width="3" height="12" rx="1" /><rect x="14" y="6" width="3" height="12" rx="1" /></>,
    check: <path d="m5 12 4 4 10-10" />,
  } as const;

  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export default function IspOperationsPage() {
  const [tab, setTab] = useState<Tab>('access');
  const [access, setAccess] = useState<Page<AccessBinding> | null>(null);
  const [jobs, setJobs] = useState<Page<Job> | null>(null);
  const [sites, setSites] = useState<Page<Site> | null>(null);
  const [fiber, setFiber] = useState<Page<FiberLine> | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setError('Authentication required.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const query = `?page=1&limit=50${search.trim() ? `&search=${encodeURIComponent(search.trim())}` : ''}`;
      const headers = { Authorization: `Bearer ${token}` };

      const [accessResponse, jobsResponse, sitesResponse, fiberResponse] = await Promise.all([
        apiFetch<Page<AccessBinding>>(`/isp/access-bindings${query}`, { headers }),
        apiFetch<Page<Job>>(`/isp/jobs${query}`, { headers }),
        apiFetch<Page<Site>>(`/isp/sites${query}`, { headers }),
        apiFetch<Page<FiberLine>>(`/isp/fiber-lines${query}`, { headers }),
      ]);

      setAccess(accessResponse);
      setJobs(jobsResponse);
      setSites(sitesResponse);
      setFiber(fiberResponse);
    } catch (cause: unknown) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Unable to load ISP operations.');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeAccess = useMemo(() => access?.data.filter((item) => item.state === 'ACTIVE').length ?? 0, [access]);
  const openJobs = useMemo(() => jobs?.data.filter((item) => !['COMPLETED', 'CANCELED'].includes(item.status)).length ?? 0, [jobs]);
  const onlineSites = useMemo(() => sites?.data.filter((item) => item.status === 'ACTIVE').length ?? 0, [sites]);
  const activeFiber = useMemo(() => fiber?.data.filter((item) => item.serviceStatus === 'ACTIVE').length ?? 0, [fiber]);

  const changeAccessState = async (item: AccessBinding) => {
    const next = item.state === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    setBusyId(item.id);
    setError(null);

    try {
      await apiFetch(`/isp/access-bindings/${item.id}/state`, {
        method: 'PUT',
        headers: { ...tokenHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: next, reason: next === 'ACTIVE' ? 'Operator resumed access' : 'Operator suspended access' }),
      });
      await load();
    } catch (cause: unknown) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Access state update failed.');
    } finally {
      setBusyId(null);
    }
  };

  const updateJob = async (item: Job) => {
    const next = item.status === 'OPEN' ? 'IN_PROGRESS' : item.status === 'IN_PROGRESS' ? 'COMPLETED' : 'OPEN';
    setBusyId(item.id);
    setError(null);

    try {
      await apiFetch(`/isp/jobs/${item.id}`, {
        method: 'PUT',
        headers: { ...tokenHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next, note: `Operator changed job status to ${next}` }),
      });
      await load();
    } catch (cause: unknown) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Job update failed.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="isp-page">
      <header className="isp-header">
        <div className="isp-title">
          <div className="isp-brand"><BrandLogo alt="JASLYN NET" /></div>
          <div>
            <span>JASLYN NET · ISP OPERATIONS</span>
            <h1>ISP operations</h1>
            <p>One tenant-scoped operating view across subscriber access, field work, network sites and fiber service.</p>
          </div>
        </div>
        <div className="isp-actions">
          <span className={`isp-live ${error ? 'danger' : ''}`}><i />{error ? 'ACTION REQUIRED' : loading ? 'SYNCING' : 'LIVE API DATA'}</span>
          <button className="isp-button secondary" type="button" onClick={() => void load()} disabled={loading}>
            <Icon name="refresh" />
            <span>{loading ? 'Refreshing…' : 'Refresh'}</span>
          </button>
        </div>
      </header>

      {error ? <div className="isp-error" role="alert"><Icon name="alert" /><div><strong>Operation failed</strong><span>{error}</span></div></div> : null}

      <section className="isp-summary" aria-label="ISP operational summary">
        <div className="isp-summary-intro">
          <span>OPERATIONS FABRIC</span>
          <strong>Service posture</strong>
          <small>Live counters from the tenant-scoped ISP APIs.</small>
        </div>
        <div className="isp-stat-grid">
          <article className="isp-stat"><div className="isp-stat-icon"><Icon name="users" /></div><strong>{loading ? '—' : activeAccess}</strong><span>Active access</span><small>subscriber bindings</small></article>
          <article className="isp-stat"><div className="isp-stat-icon"><Icon name="jobs" /></div><strong>{loading ? '—' : openJobs}</strong><span>Open jobs</span><small>field work queue</small></article>
          <article className="isp-stat"><div className="isp-stat-icon"><Icon name="site" /></div><strong>{loading ? '—' : onlineSites}</strong><span>Active sites</span><small>network footprint</small></article>
          <article className="isp-stat"><div className="isp-stat-icon"><Icon name="fiber" /></div><strong>{loading ? '—' : activeFiber}</strong><span>Active fiber</span><small>service lines</small></article>
        </div>
      </section>

      <section className="isp-surface">
        <div className="isp-surface-head">
          <div>
            <span>ISP CONTROL SURFACES</span>
            <h2>Operations workspace</h2>
            <p>Search the live ISP entities and operate only on records returned by the authenticated API.</p>
          </div>
          <label className="isp-search">
            <Icon name="search" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search customer, job, site or fiber" aria-label="Search ISP operations" />
            {search ? <button type="button" onClick={() => setSearch('')} aria-label="Clear search">×</button> : null}
          </label>
        </div>

        <div className="isp-tabs" role="tablist" aria-label="ISP control surfaces">
          {tabs.map(([key, label]) => {
            const count = key === 'access' ? access?.pagination.total : key === 'jobs' ? jobs?.pagination.total : key === 'sites' ? sites?.pagination.total : fiber?.pagination.total;
            return (
              <button key={key} className={tab === key ? 'active' : ''} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>
                <span>{label}</span>
                <small>{count ?? 0}</small>
              </button>
            );
          })}
        </div>

        {tab === 'access' ? (
          <div className="isp-table-wrap">
            <table className="isp-table">
              <thead><tr><th>Customer</th><th>Username</th><th>Type</th><th>State</th><th>Expires</th><th>Operation</th></tr></thead>
              <tbody>
                {access?.data.map((item) => {
                  const state = item.state.toLowerCase();
                  const disabled = ['disabled', 'expired'].includes(state);
                  return (
                    <tr key={item.id}>
                      <td><strong>{item.customerName ?? 'Unknown customer'}</strong><small>{item.id.slice(0, 8)}…</small></td>
                      <td>{item.username}</td>
                      <td><span className="isp-type">{item.accessType}</span></td>
                      <td><span className={`isp-status ${state}`}><i />{item.state}</span></td>
                      <td>{formatDate(item.expiresAt)}</td>
                      <td><button className="isp-row-action" type="button" disabled={busyId === item.id || disabled} onClick={() => void changeAccessState(item)}><Icon name={item.state === 'ACTIVE' ? 'pause' : 'play'} /><span>{busyId === item.id ? 'Saving…' : item.state === 'ACTIVE' ? 'Suspend' : 'Resume'}</span></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!loading && !access?.data.length ? <div className="isp-empty"><div className="isp-empty-icon"><Icon name="users" /></div><strong>No access bindings</strong><span>The tenant ISP API returned no customer access records.</span></div> : null}
            {loading ? <div className="isp-empty"><strong>Loading access operations…</strong></div> : null}
          </div>
        ) : null}

        {tab === 'jobs' ? (
          <div className="isp-table-wrap">
            <table className="isp-table">
              <thead><tr><th>Priority</th><th>Job</th><th>Customer</th><th>Site</th><th>Type</th><th>Status</th><th>Operation</th></tr></thead>
              <tbody>
                {jobs?.data.map((item) => {
                  const state = item.status.toLowerCase();
                  return (
                    <tr key={item.id}>
                      <td><span className={`isp-priority ${item.priority.toLowerCase()}`}>{item.priority}</span></td>
                      <td><strong>{item.title}</strong><small>{item.id.slice(0, 8)}…</small></td>
                      <td>{item.customerName ?? '—'}</td>
                      <td>{item.siteName ?? '—'}</td>
                      <td>{item.jobType}</td>
                      <td><span className={`isp-status ${state}`}><i />{item.status}</span></td>
                      <td><button className="isp-row-action" type="button" disabled={busyId === item.id || item.status === 'CANCELED'} onClick={() => void updateJob(item)}><Icon name={item.status === 'OPEN' ? 'play' : item.status === 'IN_PROGRESS' ? 'check' : 'refresh'} /><span>{busyId === item.id ? 'Saving…' : item.status === 'OPEN' ? 'Start' : item.status === 'IN_PROGRESS' ? 'Complete' : 'Reopen'}</span></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!loading && !jobs?.data.length ? <div className="isp-empty"><div className="isp-empty-icon"><Icon name="jobs" /></div><strong>No field jobs</strong><span>The tenant ISP API returned no field work records.</span></div> : null}
            {loading ? <div className="isp-empty"><strong>Loading field jobs…</strong></div> : null}
          </div>
        ) : null}

        {tab === 'sites' ? (
          <div className="isp-table-wrap">
            <table className="isp-table">
              <thead><tr><th>Site</th><th>Type</th><th>Status</th><th>Coordinates</th></tr></thead>
              <tbody>
                {sites?.data.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.name}</strong><small>{item.id.slice(0, 8)}…</small></td>
                    <td>{item.siteType}</td>
                    <td><span className={`isp-status ${item.status.toLowerCase()}`}><i />{item.status}</span></td>
                    <td>{item.latitude != null && item.longitude != null ? `${item.latitude}, ${item.longitude}` : 'Not geolocated'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && !sites?.data.length ? <div className="isp-empty"><div className="isp-empty-icon"><Icon name="site" /></div><strong>No network sites</strong><span>The tenant ISP API returned no site records.</span></div> : null}
            {loading ? <div className="isp-empty"><strong>Loading network sites…</strong></div> : null}
          </div>
        ) : null}

        {tab === 'fiber' ? (
          <div className="isp-table-wrap">
            <table className="isp-table">
              <thead><tr><th>Line</th><th>Customer</th><th>Technology</th><th>Status</th><th>Capacity</th><th>Installation</th></tr></thead>
              <tbody>
                {fiber?.data.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.name}</strong><small>{item.id.slice(0, 8)}…</small></td>
                    <td>{item.customerName ?? '—'}</td>
                    <td><span className="isp-type">{item.technology}</span></td>
                    <td><span className={`isp-status ${item.serviceStatus.toLowerCase()}`}><i />{item.serviceStatus}</span></td>
                    <td>{formatRate(item.upstreamBps)} ↑ / {formatRate(item.downstreamBps)} ↓</td>
                    <td>{item.installationAddress ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && !fiber?.data.length ? <div className="isp-empty"><div className="isp-empty-icon"><Icon name="fiber" /></div><strong>No fiber lines</strong><span>The tenant ISP API returned no fiber records.</span></div> : null}
            {loading ? <div className="isp-empty"><strong>Loading fiber services…</strong></div> : null}
          </div>
        ) : null}

        <div className="isp-footer-metrics">
          <span>Access <b>{access?.pagination.total ?? 0}</b></span>
          <span>Jobs <b>{jobs?.pagination.total ?? 0}</b></span>
          <span>Sites <b>{sites?.pagination.total ?? 0}</b></span>
          <span>Fiber <b>{fiber?.pagination.total ?? 0}</b></span>
        </div>
      </section>

      <footer className="isp-footer">
        <span>JASLYN NET · ISP Operations</span>
        <span>Tenant-scoped service control</span>
      </footer>
    </main>
  );
}
