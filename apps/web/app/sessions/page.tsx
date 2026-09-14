'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../../../lib/api';
import { getAccessToken } from '../../../lib/auth';

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
  status: 'ACTIVE' | 'ENDED' | string;
};

type SessionResponse = { data: Session[]; count: number };

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

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState<'ACTIVE' | 'ENDED' | ''>('ACTIVE');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      const query = status ? `?status=${encodeURIComponent(status)}&limit=500` : '?limit=500';
      const response = await apiFetch<SessionResponse>(`/sessions${query}`, { headers: { Authorization: `Bearer ${token}` } });
      setSessions(Array.isArray(response.data) ? response.data : []);
      setCount(Number(response.count) || 0);
    } catch (cause: unknown) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Unable to load sessions.');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">J</div><div><span>JASLYN NET</span><small>Network operations platform</small></div></div>
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
        <div className="profile"><div className="avatar">J</div><div><strong>JASLYN NET</strong><small>Tenant workspace</small></div></div>
      </aside>
      <section className="content">
        <header className="topbar">
          <div><div className="eyebrow">JASLYN NET / SESSIONS</div><h1>Session operations</h1><p className="context">Inspect active connections, traffic counters and session lifecycle state.</p></div>
          <div className="top-actions"><button className="selector" onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh data'}</button></div>
        </header>
        {error && <div className="error-banner" role="alert">{error}</div>}
        <section className="kpi-grid">
          <article className="kpi"><div className="kpi-label"><span>Records</span></div><strong>{count}</strong><div className="kpi-foot"><span>API</span><small>tenant scoped</small></div></article>
          <article className="kpi"><div className="kpi-label"><span>Visible active</span></div><strong>{sessions.filter((item) => item.status === 'ACTIVE').length}</strong><div className="kpi-foot"><span>LIVE</span><small>current filter</small></div></article>
          <article className="kpi"><div className="kpi-label"><span>Traffic in</span></div><strong>{formatBytes(sessions.reduce((sum, item) => sum + Number(item.bytesIn ?? 0), 0))}</strong><div className="kpi-foot"><span>COUNTERS</span><small>visible records</small></div></article>
          <article className="kpi"><div className="kpi-label"><span>Traffic out</span></div><strong>{formatBytes(sessions.reduce((sum, item) => sum + Number(item.bytesOut ?? 0), 0))}</strong><div className="kpi-foot"><span>COUNTERS</span><small>visible records</small></div></article>
        </section>
        <section className="panel sessions-panel">
          <div className="panel-head"><div><div className="panel-kicker">SESSION INVENTORY</div><h2>Network sessions</h2><p>Tenant-isolated session records from the API.</p></div><div className="periods" role="group" aria-label="Session status filter">
            {(['ACTIVE', 'ENDED', ''] as const).map((value) => <button key={value || 'all'} className={status === value ? 'selected' : ''} aria-pressed={status === value} onClick={() => setStatus(value)}>{value || 'ALL'}</button>)}
          </div></div>
          <div className="table-wrap"><table><thead><tr><th>USERNAME</th><th>IP ADDRESS</th><th>MAC ADDRESS</th><th>STARTED</th><th>TRAFFIC</th><th>STATUS</th></tr></thead><tbody>
            {sessions.map((item) => <tr key={item.id}><td>{item.username ?? item.customerId ?? '—'}</td><td>{item.ipAddress ?? '—'}</td><td>{item.macAddress ?? '—'}</td><td>{formatDate(item.startedAt)}</td><td>{formatBytes(item.bytesTotal)}</td><td><span className={`status ${item.status.toLowerCase()}`}><i/>{item.status}</span></td></tr>)}
          </tbody></table>{!loading && !sessions.length && <div className="empty-state">No sessions matched the selected filter.</div>}{loading && <div className="empty-state">Loading tenant session data…</div>}</div>
        </section>
        <footer className="footer"><span>JASLYN NET · Session Operations</span><span>Data loaded from authenticated tenant API</span></footer>
      </section>
    </main>
  );
}
