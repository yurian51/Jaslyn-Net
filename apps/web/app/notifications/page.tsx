'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, apiFetch } from '../../lib/api';
import { getAccessToken } from '../../lib/auth';
import BrandLogo from '../brand-logo';

type Notification = {
  id: string;
  channel: string;
  recipient: string;
  eventType: string;
  status: string;
  attempts: number;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
  sentAt?: string | null;
  availableAt?: string | null;
  category?: string;
  providerMessageId?: string | null;
};

type SmsProviderStatus = { provider: string; enabled: boolean; configured: boolean; credentialsPresent: boolean; senderIdConfigured: boolean; mode: string };

type Stats = {
  PENDING: number;
  PROCESSING: number;
  SENT: number;
  FAILED: number;
  CANCELED: number;
};

function fmt(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Invalid timestamp' : date.toLocaleString();
}

function Icon({ name }: { name: 'bell' | 'refresh' | 'recover' | 'search' | 'check' | 'clock' | 'alert' | 'x' }) {
  const paths = {
    bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    refresh: <><path d="M20 11a8 8 0 0 0-14.8-4.1L4 9" /><path d="M4 5v4h4" /><path d="M4 13a8 8 0 0 0 14.8 4.1L20 15" /><path d="M20 19v-4h-4" /></>,
    recover: <><path d="M5 7h10a4 4 0 0 1 0 8H9" /><path d="m9 11 3 4-3 4" /></>,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
    check: <path d="m5 12 4 4 10-10" />,
    clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></>,
    alert: <><path d="m12 3 9 17H3L12 3Z" /><path d="M12 9v4M12 16h.01" /></>,
    x: <path d="m7 7 10 10M17 7 7 17" />,
  } as const;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export default function NotificationsPage() {
  const [rows, setRows] = useState<Notification[]>([]);
  const [stats, setStats] = useState<Stats>({ PENDING: 0, PROCESSING: 0, SENT: 0, FAILED: 0, CANCELED: 0 });
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [smsProvider, setSmsProvider] = useState<SmsProviderStatus | null>(null);
  const [smsStatusError, setSmsStatusError] = useState<string | null>(null);

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
      const headers = { Authorization: `Bearer ${token}` };
      const [list, summary] = await Promise.all([
        apiFetch<{ data: Notification[] }>('/notifications/outbox?limit=100', { headers }),
        apiFetch<Stats>('/notifications/stats', { headers }),
      ]);
      setRows(Array.isArray(list.data) ? list.data : []);
      setStats(summary);
    } catch (err: unknown) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : 'Unable to load notification operations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    apiFetch<SmsProviderStatus>('/notifications/sms/status', {
      headers: { Authorization: `Bearer ${token}` },
    }).then((status) => {
      setSmsProvider(status);
      setSmsStatusError(null);
    }).catch((err: unknown) => {
      setSmsStatusError(err instanceof Error ? err.message : 'SMS provider status unavailable.');
    });
  }, []);

  async function recover() {
    const token = getAccessToken();
    if (!token) return;

    setRecovering(true);
    setError(null);
    try {
      await apiFetch('/notifications/recover-stale?maxAgeMinutes=15', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      await load();
    } catch (err: unknown) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : 'Unable to recover stale notifications.');
    } finally {
      setRecovering(false);
    }
  }

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return rows;
    return rows.filter((row) =>
      `${row.eventType} ${row.channel} ${row.recipient} ${row.status} ${row.id}`.toLowerCase().includes(normalized),
    );
  }, [query, rows]);

  const statCards = [
    { key: 'PENDING', value: stats.PENDING, icon: 'clock' as const, label: 'Waiting to send', tone: 'pending' },
    { key: 'PROCESSING', value: stats.PROCESSING, icon: 'refresh' as const, label: 'In processing', tone: 'processing' },
    { key: 'SENT', value: stats.SENT, icon: 'check' as const, label: 'Delivered successfully', tone: 'sent' },
    { key: 'FAILED', value: stats.FAILED, icon: 'alert' as const, label: 'Needs attention', tone: 'failed' },
    { key: 'CANCELED', value: stats.CANCELED, icon: 'x' as const, label: 'Canceled', tone: 'canceled' },
  ];

  return (
    <main className="notifications-page">
      <header className="notifications-header">
        <div className="notifications-identity">
          <div className="notifications-brand"><BrandLogo alt="JASLYN NET" /></div>
          <div>
            <span className="notifications-eyebrow">JASLYN NET · OPERATIONS</span>
            <h1>Notifications</h1>
            <p>Delivery health, queue state and recovery controls for the authenticated tenant.</p>
          </div>
        </div>

        <div className="notifications-actions">
          <button className="notifications-action secondary" type="button" onClick={() => void recover()} disabled={recovering}>
            <Icon name="recover" />
            <span>{recovering ? 'Recovering…' : 'Recover stale'}</span>
          </button>
          <button className="notifications-action primary" type="button" onClick={() => void load()} disabled={loading}>
            <Icon name="refresh" />
            <span>{loading ? 'Refreshing…' : 'Refresh'}</span>
          </button>
        </div>
      </header>

      {error ? (
        <div className="notifications-error" role="alert">
          <Icon name="alert" />
          <span>{error}</span>
        </div>
      ) : null}

      <section className="notifications-sms-provider" aria-label="SMS provider configuration">
        <div>
          <span className="notifications-sms-eyebrow">SMS DELIVERY PROVIDER</span>
          <strong>{smsProvider?.provider === 'beem' ? 'Beem SMS API' : (smsProvider?.provider || 'Provider status')}</strong>
          <p>{smsStatusError || (smsProvider?.configured
            ? 'Provider credentials are present and SMS worker is enabled. Queue acceptance is not the same as handset delivery.'
            : 'SMS delivery is safely disabled until credentials, sender ID and SMS_ENABLED=true are configured.')}</p>
        </div>
        <span className={`notifications-sms-state ${smsProvider?.configured ? 'ready' : 'disabled'}`}>
          {smsStatusError ? 'STATUS UNKNOWN' : smsProvider?.configured ? 'CONFIGURED' : 'DISABLED'}
        </span>
      </section>

      <section className="notifications-overview" aria-label="Notification status">
        <div className="notifications-overview-copy">
          <span>OUTBOX OVERVIEW</span>
          <strong>Delivery pipeline</strong>
          <small>Operational state from the live notification outbox.</small>
        </div>
        <div className="notifications-stat-grid">
          {statCards.map((card) => (
            <article className={`notifications-stat ${card.tone}`} key={card.key}>
              <div className="notifications-stat-icon"><Icon name={card.icon} /></div>
              <div className="notifications-stat-value">{card.value}</div>
              <div className="notifications-stat-copy">
                <strong>{card.key}</strong>
                <span>{card.label}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="notifications-surface">
        <div className="notifications-surface-head">
          <div>
            <span>DELIVERY OUTBOX</span>
            <h2>Recent notifications</h2>
            <p>Tenant-scoped event deliveries, recipients and delivery errors.</p>
          </div>
          <label className="notifications-search">
            <Icon name="search" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search notifications" aria-label="Search notifications" />
            {query ? <button type="button" onClick={() => setQuery('')} aria-label="Clear search">×</button> : null}
          </label>
        </div>

        <div className="notifications-table-wrap">
          <table className="notifications-table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Channel</th>
                <th>Category</th>
                <th>Recipient</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Available</th>
                <th>Provider receipt</th>
                <th>Last error</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.eventType}</strong>
                    <small>{row.id.slice(0, 8)}…</small>
                  </td>
                  <td><span className="notifications-channel">{row.channel}</span></td>
                  <td><span className="notifications-channel">{row.category ?? '—'}</span></td>
                  <td className="notifications-recipient">{row.recipient}</td>
                  <td><span className={`notifications-status ${row.status.toLowerCase()}`}><i />{row.status}</span></td>
                  <td>{row.attempts}</td>
                  <td>{fmt(row.availableAt)}</td>
                  <td><small>{row.providerMessageId ?? '—'}</small></td>
                  <td><small className="notifications-error-text">{row.lastError ?? '—'}</small></td>
                  <td>{fmt(row.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {!loading && !filteredRows.length ? (
            <div className="notifications-empty">
              <div className="notifications-empty-icon"><Icon name="bell" /></div>
              <strong>{query ? 'No matching notifications' : 'No notification records'}</strong>
              <span>{query ? 'Try a broader search term.' : 'The tenant notification outbox is currently empty.'}</span>
            </div>
          ) : null}

          {loading ? (
            <div className="notifications-empty">
              <div className="notifications-empty-icon"><Icon name="refresh" /></div>
              <strong>Loading notification outbox…</strong>
              <span>Reading current delivery state.</span>
            </div>
          ) : null}
        </div>
      </section>

      <footer className="notifications-footer">
        <span>JASLYN NET · Notification Operations</span>
        <span>Authenticated operator surface</span>
      </footer>
    </main>
  );
}
