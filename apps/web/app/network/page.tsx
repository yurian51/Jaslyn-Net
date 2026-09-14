'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../../lib/api';
import { getAccessToken } from '../../lib/auth';

type Router = {
  id: string;
  name: string;
  vendor?: string;
  model?: string;
  ipAddress?: string;
  status?: 'ONLINE' | 'DEGRADED' | 'OFFLINE' | string;
  activeUsers?: number;
  lastSeenAt?: string;
  managementProtocol?: string;
  managementEnabled?: boolean;
  managementCredentialsConfigured?: boolean;
  capabilities?: { capabilities?: string[] };
  syncError?: string | null;
};

type RouterResponse = { data: Router[] };

function formatDate(value?: string) {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Invalid timestamp' : date.toLocaleString();
}

export default function NetworkPage() {
  const [routers, setRouters] = useState<Router[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) { setError('Authentication required.'); setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const response = await apiFetch<RouterResponse>('/routers', { headers: { Authorization: `Bearer ${token}` } });
      setRouters(Array.isArray(response.data) ? response.data : []);
    } catch (cause: unknown) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Unable to load network devices.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const online = routers.filter((router) => router.status === 'ONLINE').length;
  const degraded = routers.filter((router) => router.status === 'DEGRADED').length;
  const offline = routers.filter((router) => router.status === 'OFFLINE').length;
  const users = routers.reduce((sum, router) => sum + Number(router.activeUsers ?? 0), 0);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">J</div><div><span>JASLYN NET</span><small>Network operations platform</small></div></div>
        <div className="workspace-switch"><span className="workspace-dot"/> Global Workspace <span>⌄</span></div>
        <nav className="nav"><p className="nav-section">OPERATIONS</p>
          <a className="nav-item" href="/dashboard"><span className="nav-icon">⌂</span>Overview</a>
          <a className="nav-item" href="/customers"><span className="nav-icon">◉</span>Customers</a>
          <a className="nav-item" href="/packages"><span className="nav-icon">▣</span>Plans &amp; Products</a>
          <a className="nav-item" href="/sessions"><span className="nav-icon">◌</span>Sessions</a>
          <a className="nav-item" href="/purchases"><span className="nav-icon">₮</span>Purchases</a>
          <a className="nav-item active" href="/network" aria-current="page"><span className="nav-icon">⌁</span>Network</a>
          <a className="nav-item" href="/audit"><span className="nav-icon">◈</span>Security &amp; Audit</a>
        </nav>
        <div className="sidebar-status"><span className="pulse"/><div><strong>{error ? 'API unavailable' : 'Network monitor'}</strong><small>{error ?? `${routers.length} devices loaded`}</small></div></div>
        <div className="profile"><div className="avatar">J</div><div><strong>JASLYN NET</strong><small>Tenant workspace</small></div></div>
      </aside>
      <section className="content">
        <header className="topbar"><div><div className="eyebrow">JASLYN NET / NETWORK</div><h1>Network operations</h1><p className="context">Live device inventory, management state and connectivity health.</p></div><div className="top-actions"><button className="selector" onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh devices'}</button></div></header>
        {error && <div className="error-banner" role="alert">{error}</div>}
        <section className="kpi-grid">
          <article className="kpi"><div className="kpi-label"><span>Registered devices</span></div><strong>{routers.length}</strong><div className="kpi-foot"><span>INVENTORY</span><small>tenant scoped</small></div></article>
          <article className="kpi"><div className="kpi-label"><span>Operational</span></div><strong>{online}</strong><div className="kpi-foot"><span>ONLINE</span><small>last reported state</small></div></article>
          <article className="kpi"><div className="kpi-label"><span>Attention</span></div><strong>{degraded}</strong><div className="kpi-foot"><span>DEGRADED</span><small>requires review</small></div></article>
          <article className="kpi"><div className="kpi-label"><span>Connected users</span></div><strong>{users}</strong><div className="kpi-foot"><span>LIVE</span><small>reported by routers</small></div></article>
        </section>
        <section className="panel sessions-panel"><div className="panel-head"><div><div className="panel-kicker">DEVICE FLEET</div><h2>Network devices</h2><p>{offline} offline · management credentials are never displayed.</p></div></div>
          <div className="table-wrap"><table><thead><tr><th>DEVICE</th><th>VENDOR / MODEL</th><th>ADDRESS</th><th>USERS</th><th>MANAGEMENT</th><th>LAST SEEN</th><th>STATUS</th></tr></thead><tbody>
            {routers.map((router) => <tr key={router.id}><td><strong>{router.name}</strong><br/><small>{router.id}</small></td><td>{router.vendor ?? 'Unknown'}{router.model ? ` · ${router.model}` : ''}</td><td>{router.ipAddress ?? '—'}</td><td>{Number(router.activeUsers ?? 0)}</td><td>{router.managementEnabled === false ? 'Disabled' : router.managementProtocol ?? 'Unspecified'}{router.managementCredentialsConfigured ? ' · configured' : ''}</td><td>{formatDate(router.lastSeenAt)}</td><td><span className={`status ${(router.status ?? 'UNKNOWN').toLowerCase()}`}><i/>{router.status ?? 'UNKNOWN'}</span>{router.syncError && <small> {router.syncError}</small>}</td></tr>)}
          </tbody></table>{!loading && !routers.length && <div className="empty-state">No network devices are registered for this tenant.</div>}{loading && <div className="empty-state">Loading network inventory…</div>}</div>
        </section>
        <footer className="footer"><span>JASLYN NET · Network Operations</span><span>Authenticated tenant inventory</span></footer>
      </section>
    </main>
  );
}
