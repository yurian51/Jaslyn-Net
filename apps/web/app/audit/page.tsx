'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../../../lib/api';
import { getAccessToken } from '../../../lib/auth';

type AuditEntry = { id: string; action: string; entityType?: string; entityId?: string; metadata?: Record<string, unknown>; createdAt?: string };
type AuditResponse = { data: AuditEntry[]; count?: number };

function date(value?: string) { if (!value) return '—'; const d = new Date(value); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(); }
function metadata(value?: Record<string, unknown>) { if (!value) return '—'; const safe = Object.entries(value).filter(([key]) => !/password|secret|token|credential|authorization/i.test(key)); return safe.length ? safe.map(([key, item]) => `${key}: ${typeof item === 'object' ? JSON.stringify(item) : String(item)}`).join(' · ') : '—'; }

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) { setError('Authentication required.'); setLoading(false); return; }
    setLoading(true); setError(null);
    try { const response = await apiFetch<AuditResponse>('/audit-logs?limit=500', { headers: { Authorization: `Bearer ${token}` } }); setEntries(Array.isArray(response.data) ? response.data : []); }
    catch (cause: unknown) { setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Unable to load audit logs.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return <main className="app-shell"><aside className="sidebar"><div className="brand"><div className="brand-mark">J</div><div><span>JASLYN NET</span><small>Network operations platform</small></div></div><div className="workspace-switch"><span className="workspace-dot"/> Global Workspace <span>⌄</span></div><nav className="nav"><p className="nav-section">OPERATIONS</p><a className="nav-item" href="/dashboard"><span className="nav-icon">⌂</span>Overview</a><a className="nav-item" href="/customers"><span className="nav-icon">◉</span>Customers</a><a className="nav-item" href="/packages"><span className="nav-icon">▣</span>Plans &amp; Products</a><a className="nav-item" href="/sessions"><span className="nav-icon">◌</span>Sessions</a><a className="nav-item" href="/purchases"><span className="nav-icon">₮</span>Purchases</a><a className="nav-item" href="/network"><span className="nav-icon">⌁</span>Network</a><a className="nav-item active" href="/audit" aria-current="page"><span className="nav-icon">◈</span>Security &amp; Audit</a></nav><div className="sidebar-status"><span className="pulse"/><div><strong>{error ? 'Audit API unavailable' : 'Audit stream'}</strong><small>{error ?? `${entries.length} records loaded`}</small></div></div><div className="profile"><div className="avatar">J</div><div><strong>JASLYN NET</strong><small>Tenant workspace</small></div></div></aside><section className="content"><header className="topbar"><div><div className="eyebrow">JASLYN NET / SECURITY &amp; AUDIT</div><h1>Security audit</h1><p className="context">Tenant-scoped operational events with sensitive credential fields excluded from display.</p></div><div className="top-actions"><button className="selector" onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh audit'}</button></div></header>{error && <div className="error-banner" role="alert">{error}</div>}<section className="kpi-grid"><article className="kpi"><div className="kpi-label"><span>Audit records</span></div><strong>{entries.length}</strong><div className="kpi-foot"><span>LIVE</span><small>loaded from API</small></div></article><article className="kpi"><div className="kpi-label"><span>Unique actions</span></div><strong>{new Set(entries.map((item) => item.action)).size}</strong><div className="kpi-foot"><span>EVENTS</span><small>visible action types</small></div></article><article className="kpi"><div className="kpi-label"><span>Router events</span></div><strong>{entries.filter((item) => item.entityType === 'router').length}</strong><div className="kpi-foot"><span>NETWORK</span><small>device activity</small></div></article><article className="kpi"><div className="kpi-label"><span>Payment events</span></div><strong>{entries.filter((item) => item.entityType === 'payment').length}</strong><div className="kpi-foot"><span>BILLING</span><small>payment activity</small></div></article></section><section className="panel sessions-panel"><div className="panel-head"><div><div className="panel-kicker">SECURITY EVENTS</div><h2>Audit trail</h2><p>Recent tenant operations recorded by the platform.</p></div></div><div className="table-wrap"><table><thead><tr><th>TIME</th><th>ACTION</th><th>ENTITY</th><th>ENTITY ID</th><th>DETAILS</th></tr></thead><tbody>{entries.map((item) => <tr key={item.id}><td>{date(item.createdAt)}</td><td><strong>{item.action}</strong></td><td>{item.entityType ?? '—'}</td><td>{item.entityId ?? '—'}</td><td>{metadata(item.metadata)}</td></tr>)}</tbody></table>{loading && <div className="empty-state">Loading audit records…</div>}{!loading && !entries.length && <div className="empty-state">No audit records are available for this tenant.</div>}</div></section><footer className="footer"><span>JASLYN NET · Security &amp; Audit</span><span>Sensitive credential values are never rendered</span></footer></section></main>;
}
