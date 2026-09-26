'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, apiFetch } from '../../lib/api';
import { getAccessToken } from '../../lib/auth';
import BrandLogo from '../brand-logo';

type FiberLine = {
  id: string;
  name: string;
  customerName?: string;
  technology: string;
  serviceStatus: string;
  upstreamBps?: number | null;
  downstreamBps?: number | null;
  installationAddress?: string | null;
};

type Page = {
  data: FiberLine[];
  pagination: { total: number };
};

type Filter = 'ALL' | 'ACTIVE' | 'FAULT' | 'SUSPENDED' | 'DISCONNECTED' | 'PLANNED';

const rate = (bps?: number | null) => bps == null ? '—' : Math.round(bps / 1000000) + ' Mbps';

function Icon({ name }: { name: 'fiber' | 'refresh' | 'search' | 'users' | 'signal' | 'alert' | 'pause' | 'play' | 'map' }) {
  const paths = {
    fiber: <><path d="M4 7h16M4 12h16M4 17h16" /><circle cx="7" cy="7" r="1" /><circle cx="17" cy="17" r="1" /><path d="M10 7v10" /></>,
    refresh: <><path d="M20 11a8 8 0 0 0-14.8-4.1L4 9" /><path d="M4 5v4h4" /><path d="M4 13a8 8 0 0 0 14.8 4.1L20 15" /><path d="M20 19v-4h-4" /></>,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
    users: <><circle cx="9" cy="8" r="3" /><path d="M4 19c.5-3 2-4.6 5-4.6s4.5 1.6 5 4.6" /><path d="M15 6.8a3 3 0 0 1 0 5.6M17.3 14.6c1.6.6 2.7 1.9 3 4.4" /></>,
    signal: <><path d="M4 9a12 12 0 0 1 16 0" /><path d="M7 12a7.5 7.5 0 0 1 10 0" /><path d="M10 15a3.5 3.5 0 0 1 4 0" /><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" /></>,
    alert: <><path d="m12 3 9 17H3L12 3Z" /><path d="M12 9v4M12 16h.01" /></>,
    pause: <><rect x="7" y="6" width="3" height="12" rx="1" /><rect x="14" y="6" width="3" height="12" rx="1" /></>,
    play: <path d="m9 6 8 6-8 6V6Z" />,
    map: <><path d="m4 6 5-2 6 2 5-2v14l-5 2-6-2-5 2V6Z" /><path d="M9 4v14M15 6v14" /></>,
  } as const;

  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export default function FiberPage() {
  const [data, setData] = useState<Page | null>(null);
  const [filter, setFilter] = useState<Filter>('ALL');
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
      setData(await apiFetch<Page>('/isp/fiber-lines?page=1&limit=100', {
        headers: { Authorization: `Bearer ${token}` },
      }));
    } catch (cause: unknown) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Unable to load fiber lines.');
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
    return sourceRows.filter((line) => {
      const matchesFilter = filter === 'ALL' || line.serviceStatus === filter;
      const matchesQuery = !normalized || `${line.name} ${line.customerName ?? ''} ${line.technology} ${line.serviceStatus} ${line.installationAddress ?? ''} ${line.id}`.toLowerCase().includes(normalized);
      return matchesFilter && matchesQuery;
    });
  }, [sourceRows, filter, query]);

  const active = sourceRows.filter((line) => line.serviceStatus === 'ACTIVE').length;
  const fault = sourceRows.filter((line) => line.serviceStatus === 'FAULT').length;
  const suspended = sourceRows.filter((line) => line.serviceStatus === 'SUSPENDED').length;
  const disconnected = sourceRows.filter((line) => line.serviceStatus === 'DISCONNECTED').length;
  const provisionedMbps = sourceRows.reduce((sum, line) => sum + Number(line.downstreamBps ?? 0), 0) / 1000000;

  async function change(line: FiberLine) {
    const token = getAccessToken();
    if (!token) return;

    const next = line.serviceStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    setBusy(line.id);
    setError(null);

    try {
      await apiFetch('/isp/fiber-lines/' + line.id + '/status', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next, reason: 'Operator changed fiber service to ' + next }),
      });
      await load();
    } catch (cause: unknown) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Fiber status update failed.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="fiber-page">
      <header className="fiber-header">
        <div className="fiber-title">
          <div className="fiber-brand"><BrandLogo alt="JASLYN NET" /></div>
          <div>
            <span>JASLYN NET · ACCESS NETWORK · FIBER</span>
            <h1>Fiber services</h1>
            <p>Customer fiber lines, service state and provisioned capacity from the live ISP control surface.</p>
          </div>
        </div>

        <div className="fiber-actions">
          <span className="fiber-live"><i />{loading ? 'SYNCING' : 'LIVE API DATA'}</span>
          <button className="fiber-button secondary" type="button" onClick={() => void load()} disabled={loading}>
            <Icon name="refresh" />
            <span>{loading ? 'Refreshing…' : 'Refresh'}</span>
          </button>
        </div>
      </header>

      {error ? <div className="fiber-error" role="alert"><Icon name="alert" /><span>{error}</span></div> : null}

      <section className="fiber-summary" aria-label="Fiber service summary">
        <div className="fiber-summary-intro">
          <span>FIBER FABRIC</span>
          <strong>Service line posture</strong>
          <small>Current service state and capacity reported by the tenant ISP API.</small>
        </div>

        <div className="fiber-stat-grid">
          <article className="fiber-stat"><div className="fiber-stat-icon"><Icon name="fiber" /></div><strong>{loading ? '—' : sourceRows.length}</strong><span>Total lines</span><small>tenant inventory</small></article>
          <article className="fiber-stat active"><div className="fiber-stat-icon"><Icon name="signal" /></div><strong>{loading ? '—' : active}</strong><span>Active</span><small>serving customers</small></article>
          <article className="fiber-stat fault"><div className="fiber-stat-icon"><Icon name="alert" /></div><strong>{loading ? '—' : fault}</strong><span>Fault</span><small>requires attention</small></article>
          <article className="fiber-stat suspended"><div className="fiber-stat-icon"><Icon name="pause" /></div><strong>{loading ? '—' : suspended}</strong><span>Suspended</span><small>operator controlled</small></article>
          <article className="fiber-stat capacity"><div className="fiber-stat-icon"><Icon name="signal" /></div><strong>{loading ? '—' : Math.round(provisionedMbps)}</strong><span>Downstream Mbps</span><small>{disconnected} disconnected</small></article>
        </div>
      </section>

      <section className="fiber-surface">
        <div className="fiber-surface-head">
          <div>
            <span>FIBER SERVICE LINES</span>
            <h2>Customer lines</h2>
            <p>Operate only on records returned by the existing fiber service API.</p>
          </div>

          <label className="fiber-search">
            <Icon name="search" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search line, customer, technology or address" aria-label="Search fiber services" />
            {query ? <button type="button" onClick={() => setQuery('')} aria-label="Clear search">×</button> : null}
          </label>
        </div>

        <div className="fiber-filterbar" role="tablist" aria-label="Fiber service status filter">
          {(['ALL', 'ACTIVE', 'FAULT', 'SUSPENDED', 'DISCONNECTED', 'PLANNED'] as const).map((item) => {
            const count = item === 'ALL' ? sourceRows.length : sourceRows.filter((line) => line.serviceStatus === item).length;
            return <button key={item} type="button" role="tab" aria-selected={filter === item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}><span>{item}</span><small>{count}</small></button>;
          })}
        </div>

        <div className="fiber-table-wrap">
          <table className="fiber-table">
            <thead>
              <tr>
                <th>Line</th>
                <th>Customer</th>
                <th>Technology</th>
                <th>Status</th>
                <th>Up / Down</th>
                <th>Installation</th>
                <th>Operation</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((line) => {
                const state = line.serviceStatus.toLowerCase();
                const disabled = ['fault', 'disconnected', 'planned'].includes(state);

                return (
                  <tr key={line.id}>
                    <td><strong>{line.name}</strong><small>{line.id.slice(0, 8)}…</small></td>
                    <td>{line.customerName ?? '—'}</td>
                    <td><span className="fiber-technology">{line.technology || '—'}</span></td>
                    <td><span className={`fiber-status ${state}`}><i />{line.serviceStatus}</span></td>
                    <td><span className="fiber-rate">{rate(line.upstreamBps)} ↑</span> <span className="fiber-rate">{rate(line.downstreamBps)} ↓</span></td>
                    <td><span className="fiber-address"><Icon name="map" />{line.installationAddress ?? '—'}</span></td>
                    <td>
                      <button className="fiber-row-action" type="button" disabled={busy === line.id || disabled} onClick={() => void change(line)}>
                        <Icon name={line.serviceStatus === 'ACTIVE' ? 'pause' : 'play'} />
                        <span>{busy === line.id ? 'Saving…' : line.serviceStatus === 'ACTIVE' ? 'Suspend' : 'Resume'}</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {loading ? <div className="fiber-empty"><div className="fiber-empty-icon"><Icon name="refresh" /></div><strong>Loading fiber services…</strong><span>Reading current line state and capacity.</span></div> : null}
          {!loading && !rows.length ? <div className="fiber-empty"><div className="fiber-empty-icon"><Icon name="fiber" /></div><strong>{query || filter !== 'ALL' ? 'No matching fiber lines' : 'No fiber lines configured'}</strong><span>{query || filter !== 'ALL' ? 'Try another filter or search term.' : 'The tenant fiber API currently contains no line records.'}</span></div> : null}
        </div>
      </section>

      <footer className="fiber-footer">
        <span>JASLYN NET · Fiber Services</span>
        <span>Tenant-scoped service inventory</span>
      </footer>
    </main>
  );
}
