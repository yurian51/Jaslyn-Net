'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, apiFetch } from '../../lib/api';
import { getAccessToken } from '../../lib/auth';
import BrandLogo from '../brand-logo';

type Item = {
  id: string;
  customerName?: string;
  username: string;
  accessType: string;
  state: string;
  expiresAt?: string | null;
};

type Page = {
  data: Item[];
  pagination: { total: number };
};

type Filter = 'ALL' | 'HOTSPOT' | 'RADIUS' | 'PPPOE' | 'STATIC';

function Icon({ name }: { name: 'access' | 'refresh' | 'search' | 'users' | 'wifi' | 'radius' | 'clock' | 'alert' | 'pause' | 'play' }) {
  const paths = {
    access: <><path d="M4 10a12 12 0 0 1 16 0" /><path d="M7 13a7.5 7.5 0 0 1 10 0" /><path d="M10 16a3.5 3.5 0 0 1 4 0" /><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" /></>,
    refresh: <><path d="M20 11a8 8 0 0 0-14.8-4.1L4 9" /><path d="M4 5v4h4" /><path d="M4 13a8 8 0 0 0 14.8 4.1L20 15" /><path d="M20 19v-4h-4" /></>,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
    users: <><circle cx="9" cy="8" r="3" /><path d="M4 19c.5-3 2-4.6 5-4.6s4.5 1.6 5 4.6" /><path d="M15 6.8a3 3 0 0 1 0 5.6M17.3 14.6c1.6.6 2.7 1.9 3 4.4" /></>,
    wifi: <><path d="M4 9a12 12 0 0 1 16 0" /><path d="M7 12a7.5 7.5 0 0 1 10 0" /><path d="M10 15a3.5 3.5 0 0 1 4 0" /><circle cx="12" cy="18.5" r="1" fill="currentColor" stroke="none" /></>,
    radius: <><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /></>,
    clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></>,
    alert: <><path d="m12 3 9 17H3L12 3Z" /><path d="M12 9v4M12 16h.01" /></>,
    pause: <><rect x="7" y="6" width="3" height="12" rx="1" /><rect x="14" y="6" width="3" height="12" rx="1" /></>,
    play: <path d="m9 6 8 6-8 6V6Z" />,
  } as const;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export default function AccessNetworkPage() {
  const [data, setData] = useState<Page | null>(null);
  const [type, setType] = useState<Filter>('ALL');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

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
      setData(await apiFetch<Page>('/isp/access-bindings?page=1&limit=100', {
        headers: { Authorization: `Bearer ${token}` },
      }));
    } catch (cause: unknown) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Unable to load access network.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sourceRows = data?.data ?? [];

  const rows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return sourceRows.filter((item) => {
      const matchesType = type === 'ALL' || item.accessType === type;
      const matchesQuery = !normalized || `${item.customerName ?? ''} ${item.username} ${item.accessType} ${item.state} ${item.id}`.toLowerCase().includes(normalized);
      return matchesType && matchesQuery;
    });
  }, [sourceRows, type, query]);

  const total = data?.pagination.total ?? 0;
  const active = sourceRows.filter((item) => item.state === 'ACTIVE').length;
  const suspended = sourceRows.filter((item) => item.state === 'SUSPENDED').length;
  const expiring = sourceRows.filter((item) => item.expiresAt && new Date(item.expiresAt).getTime() > Date.now() && new Date(item.expiresAt).getTime() <= Date.now() + 24 * 60 * 60 * 1000).length;
  const hotspot = sourceRows.filter((item) => item.accessType === 'HOTSPOT').length;
  const radius = sourceRows.filter((item) => item.accessType === 'RADIUS').length;

  async function change(item: Item) {
    const token = getAccessToken();
    if (!token) return;

    const next = item.state === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    setBusy(item.id);
    setError(null);

    try {
      await apiFetch('/isp/access-bindings/' + item.id + '/state', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: next, reason: 'Operator changed access state to ' + next }),
      });
      await load();
    } catch (cause: unknown) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Access state update failed.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="access-page">
      <header className="access-header">
        <div className="access-title">
          <div className="access-brand"><BrandLogo alt="JASLYN NET" /></div>
          <div>
            <span>JASLYN NET · ACCESS NETWORK</span>
            <h1>Access network</h1>
            <p>One operational view for WiFi, Hotspot, RADIUS, PPPoE and static access bindings.</p>
          </div>
        </div>
        <div className="access-actions">
          <span className="access-live"><i />{loading ? 'SYNCING' : 'LIVE API DATA'}</span>
          <button className="access-button secondary" type="button" onClick={() => void load()} disabled={loading}>
            <Icon name="refresh" />
            <span>{loading ? 'Refreshing…' : 'Refresh'}</span>
          </button>
        </div>
      </header>

      {error ? <div className="access-error" role="alert"><Icon name="alert" /><span>{error}</span></div> : null}

      <section className="access-summary" aria-label="Access network summary">
        <div className="access-summary-intro">
          <span>ACCESS FABRIC</span>
          <strong>Subscriber access posture</strong>
          <small>Current state from the tenant-scoped access API.</small>
        </div>
        <div className="access-stat-grid">
          <article className="access-stat"><div className="access-stat-icon"><Icon name="users" /></div><strong>{total}</strong><span>Total bindings</span><small>all access types</small></article>
          <article className="access-stat active"><div className="access-stat-icon"><Icon name="wifi" /></div><strong>{active}</strong><span>Active</span><small>customer access</small></article>
          <article className="access-stat suspended"><div className="access-stat-icon"><Icon name="pause" /></div><strong>{suspended}</strong><span>Suspended</span><small>operator controlled</small></article>
          <article className="access-stat expiring"><div className="access-stat-icon"><Icon name="clock" /></div><strong>{expiring}</strong><span>Expiring soon</span><small>next 24 hours</small></article>
          <article className="access-stat"><div className="access-stat-icon"><Icon name="radius" /></div><strong>{hotspot + radius}</strong><span>AAA access</span><small>{hotspot} hotspot · {radius} radius</small></article>
        </div>
      </section>

      <section className="access-surface">
        <div className="access-surface-head">
          <div>
            <span>ACCESS BINDINGS</span>
            <h2>Customer access</h2>
            <p>Filter and operate on existing bindings. No demo records are introduced.</p>
          </div>
          <label className="access-search">
            <Icon name="search" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customer, username or type" aria-label="Search access bindings" />
            {query ? <button type="button" onClick={() => setQuery('')} aria-label="Clear search">×</button> : null}
          </label>
        </div>

        <div className="access-filterbar" role="tablist" aria-label="Access type filter">
          {(['ALL', 'HOTSPOT', 'RADIUS', 'PPPOE', 'STATIC'] as const).map((item) => (
            <button key={item} type="button" role="tab" aria-selected={type === item} className={type === item ? 'active' : ''} onClick={() => setType(item)}>
              {item}
              <small>{item === 'ALL' ? sourceRows.length : sourceRows.filter((row) => row.accessType === item).length}</small>
            </button>
          ))}
        </div>

        <div className="access-table-wrap">
          <table className="access-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Username</th>
                <th>Access type</th>
                <th>State</th>
                <th>Expires</th>
                <th>Operation</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => {
                const state = item.state.toLowerCase();
                const disabled = ['disabled', 'expired'].includes(state);
                return (
                  <tr key={item.id}>
                    <td><strong>{item.customerName ?? '—'}</strong><small>{item.id.slice(0, 8)}…</small></td>
                    <td>{item.username}</td>
                    <td><span className="access-type">{item.accessType}</span></td>
                    <td><span className={`access-status ${state}`}><i />{item.state}</span></td>
                    <td>{item.expiresAt ? new Date(item.expiresAt).toLocaleString() : '—'}</td>
                    <td>
                      <button className="access-row-action" type="button" disabled={busy === item.id || disabled} onClick={() => void change(item)}>
                        <Icon name={item.state === 'ACTIVE' ? 'pause' : 'play'} />
                        <span>{busy === item.id ? 'Saving…' : item.state === 'ACTIVE' ? 'Suspend' : 'Resume'}</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {loading ? <div className="access-empty"><div className="access-empty-icon"><Icon name="refresh" /></div><strong>Loading access bindings…</strong><span>Reading current subscriber access state.</span></div> : null}
          {!loading && !rows.length ? <div className="access-empty"><div className="access-empty-icon"><Icon name="access" /></div><strong>{query || type !== 'ALL' ? 'No matching access bindings' : 'No access bindings registered'}</strong><span>{query || type !== 'ALL' ? 'Try another filter or search term.' : 'The tenant access API currently contains no binding records.'}</span></div> : null}
        </div>
      </section>

      <footer className="access-footer">
        <span>JASLYN NET · Access Network</span>
        <span>Tenant-scoped operational surface</span>
      </footer>
    </main>
  );
}
