'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch, ApiError } from '../../lib/api';
import { clearAccessToken, getAccessToken } from '../../lib/auth';
import './security-sessions.css';

type SessionRecord = {
  id: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt?: string | null;
  isCurrent: boolean;
  isActive: boolean;
};
type SessionsResponse = { data: SessionRecord[]; count: number };

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}
function deviceLabel(userAgent?: string | null) {
  if (!userAgent) return 'Unknown device';
  if (/android/i.test(userAgent)) return 'Android device';
  if (/iphone|ipad|ios/i.test(userAgent)) return 'Apple mobile device';
  if (/windows/i.test(userAgent)) return 'Windows computer';
  if (/macintosh|mac os/i.test(userAgent)) return 'Mac computer';
  if (/linux/i.test(userAgent)) return 'Linux computer';
  return userAgent.slice(0, 110);
}

export default function SecuritySessionsPage() {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'CURRENT' | 'REVOKED' | 'EXPIRED'>('ALL');
  const [sortOrder, setSortOrder] = useState<'RECENT' | 'OLDEST'>('RECENT');
  const [showFullIp, setShowFullIp] = useState(false);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) { setError('Authentication required. Please sign in again.'); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<SessionsResponse>('/auth/sessions', { headers: { Authorization: 'Bearer ' + token } });
      setSessions(Array.isArray(result.data) ? result.data : []);
    } catch (cause: unknown) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Unable to load sessions.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function revoke(session: SessionRecord) {
    if (!window.confirm(session.isCurrent
      ? 'Revoke this session? You will be signed out immediately.'
      : 'Revoke this session? That device will be signed out on its next request.')) return;
    const token = getAccessToken();
    if (!token) { setError('Authentication required. Please sign in again.'); return; }
    setWorking(session.id); setError(null); setNotice(null);
    try {
      await apiFetch<{ revoked: boolean }>('/auth/sessions/' + encodeURIComponent(session.id) + '/revoke', {
        method: 'POST', headers: { Authorization: 'Bearer ' + token },
      });
      if (session.isCurrent) {
        clearAccessToken();
        window.location.replace('/login');
        return;
      }
      setNotice('Session revoked. The change is recorded in the security audit trail.');
      await load();
    } catch (cause: unknown) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Unable to revoke session.');
    } finally { setWorking(null); }
  }

  async function revokeOthers() {
    if (!window.confirm('Sign out all other sessions for this account? This device will remain signed in.')) return;
    const token = getAccessToken();
    if (!token) { setError('Authentication required. Please sign in again.'); return; }
    setWorking('others'); setError(null); setNotice(null);
    try {
      const result = await apiFetch<{ revokedCount: number }>('/auth/sessions/revoke-others', {
        method: 'POST', headers: { Authorization: 'Bearer ' + token },
      });
      setNotice(result.revokedCount + ' other session(s) revoked. This session remains active.');
      await load();
    } catch (cause: unknown) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Unable to revoke other sessions.');
    } finally { setWorking(null); }
  }

  const activeOtherSessions = sessions.filter((session) => session.isActive && !session.isCurrent).length;
  const currentSessions = sessions.filter((session) => session.isCurrent).length;
  const revokedSessions = sessions.filter((session) => Boolean(session.revokedAt)).length;
  const filteredSessions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return sessions.filter((session) => {
      const device = deviceLabel(session.userAgent).toLowerCase();
      const matchesQuery = !normalized || device.includes(normalized)
        || (session.ipAddress ?? '').toLowerCase().includes(normalized)
        || session.id.toLowerCase().includes(normalized);
      const matchesStatus = statusFilter === 'ALL'
        || (statusFilter === 'ACTIVE' && session.isActive)
        || (statusFilter === 'CURRENT' && session.isCurrent)
        || (statusFilter === 'REVOKED' && Boolean(session.revokedAt))
        || (statusFilter === 'EXPIRED' && !session.isActive && !session.revokedAt);
      return matchesQuery && matchesStatus;
    }).sort((a, b) => {
      if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
      const delta = new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
      return sortOrder === 'RECENT' ? delta : -delta;
    });
  }, [sessions, query, statusFilter, sortOrder]);

  function exportCsv() {
    const columns: Array<keyof SessionRecord> = ['id', 'userAgent', 'ipAddress', 'createdAt', 'lastSeenAt', 'expiresAt', 'revokedAt', 'isCurrent', 'isActive'];
    const escapeCell = (value: unknown) => '"' + String(value ?? '').replace(/"/g, '""') + '"';
    const csv = [columns.join(','), ...filteredSessions.map((session) => columns.map((key) => escapeCell(session[key])).join(','))].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'jaslyn-net-sessions-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function displayIp(ip?: string | null) {
    if (!ip) return 'IP address unavailable';
    if (showFullIp) return ip;
    const ipv4 = ip.match(/^(\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.)\\d{1,3}$/);
    if (ipv4) return ipv4[1] + '•••';
    if (ip.includes(':')) return ip.split(':').slice(0, 3).join(':') + ':•••';
    return ip.length > 8 ? ip.slice(0, 4) + '•••' : '•••';
  }

  return (
    <main className="security-sessions-page">
      <header className="security-sessions-header">
        <div>
          <p className="security-eyebrow">JASLYN NET / SECURITY</p>
          <h1>Sessions &amp; devices</h1>
          <p>Review signed-in devices and revoke access you no longer trust.</p>
        </div>
        <div className="security-header-actions">
          <button type="button" className="security-button secondary" onClick={exportCsv} disabled={loading || filteredSessions.length === 0}>Export CSV</button>
          <button type="button" className="security-button secondary" onClick={() => void load()} disabled={loading || Boolean(working)}>{loading ? 'Refreshing…' : 'Refresh'}</button>
          <button type="button" className="security-button danger" onClick={() => void revokeOthers()} disabled={loading || Boolean(working) || activeOtherSessions === 0}>
            {working === 'others' ? 'Revoking…' : 'Sign out other sessions'}
          </button>
        </div>
      </header>

      <section className="security-session-summary" aria-label="Session summary">
        <article><span>Listed sessions</span><strong>{sessions.length}</strong><small>All records returned by the API</small></article>
        <article><span>Other active sessions</span><strong>{activeOtherSessions}</strong><small>{currentSessions} current session(s) · {revokedSessions} revoked</small></article>
        <article><span>Access control</span><strong>Server-enforced</strong><small>Revocation is checked against the server session record.</small></article>
      </section>

      {error && <div className="security-message error" role="alert">{error}</div>}
      {notice && <div className="security-message success" role="status">{notice}</div>}
      <section className="security-session-tools" aria-label="Filter session records">
        <label className="security-session-search">Search devices, IP addresses or session IDs
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sessions…" type="search" />
        </label>
        <label>Status
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
            <option value="ALL">All sessions</option><option value="ACTIVE">Active</option><option value="CURRENT">This device</option><option value="REVOKED">Revoked</option><option value="EXPIRED">Expired</option>
          </select>
        </label>
        <label>Sort by activity
          <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as typeof sortOrder)}>
            <option value="RECENT">Most recent first</option><option value="OLDEST">Oldest first</option>
          </select>
        </label>
        <label className="security-ip-toggle"><input type="checkbox" checked={showFullIp} onChange={(event) => setShowFullIp(event.target.checked)} /> Show full IP addresses</label>
        <span className="security-filter-count">{filteredSessions.length} of {sessions.length} sessions</span>
      </section>
      {loading ? <div className="security-empty">Loading session records…</div> : sessions.length === 0
        ? <div className="security-empty">No session records were returned.</div>
        : filteredSessions.length === 0
          ? <div className="security-empty">No sessions match these filters. Try changing your search or status.</div>
        : <section className="security-session-list" aria-label="Your sessions">
          {filteredSessions.map((session) => (
            <article className="security-session-card" key={session.id}>
              <div className="security-session-icon" aria-hidden="true">⌁</div>
              <div className="security-session-main">
                <div className="security-session-title">
                  <h2>{deviceLabel(session.userAgent)}</h2>
                  {session.isCurrent && <span className="session-pill current">This device</span>}
                  {session.revokedAt && <span className="session-pill revoked">Revoked</span>}
                  {session.isActive && !session.isCurrent && <span className="session-pill active">Active session</span>}
                  {!session.isActive && !session.revokedAt && <span className="session-pill revoked">Expired</span>}
                </div>
                <p>{displayIp(session.ipAddress)} · Started {formatDate(session.createdAt)}</p>
                <p>Last seen {formatDate(session.lastSeenAt)} · Expires {formatDate(session.expiresAt)}</p>
                {session.revokedAt && <p>Revoked {formatDate(session.revokedAt)}</p>}
              </div>
              {session.isActive && <button type="button" className="security-button danger" disabled={Boolean(working)} onClick={() => void revoke(session)}>
                {working === session.id ? 'Revoking…' : 'Revoke'}
              </button>}
            </article>
          ))}
        </section>}
      <p className="security-footnote">Session revocation is enforced by the API. Access tokens are short-lived; revoked sessions are denied even before token expiry. Device labels are inferred from the user-agent string and may be approximate.</p>
    </main>
  );
}
