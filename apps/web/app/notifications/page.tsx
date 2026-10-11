'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ApiError, apiFetch } from '../../lib/api';
import { getAccessToken } from '../../lib/auth';
import BrandLogo from '../brand-logo';
import './notifications.css';

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

type SmsProviderStatus = { provider: string; enabled: boolean; configured: boolean; credentialsPresent: boolean; senderIdConfigured: boolean; senderId?: string; mode: string };
type SmsProviderSettings = {
  configured: boolean; provider: 'beem' | 'custom_rest'; enabled: boolean; senderId: string; endpoint: string;
  authType: 'none' | 'bearer' | 'api_key' | 'basic'; apiKeyHeader?: string; recipientField?: string;
  messageField?: string; senderField?: string; responseIdField?: string; responseSuccessField?: string;
  responseSuccessValue?: string; hasCredentials: boolean;
};
type SmsCampaign = { id: string; name: string; category: string; status: string; recipientCount: number; queuedCount: number; pending: number; processing: number; accepted: number; failed: number; createdAt: string };

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
  const [smsSettings, setSmsSettings] = useState<SmsProviderSettings | null>(null);
  const [smsConfigLoading, setSmsConfigLoading] = useState(false);
  const [smsConfigSaving, setSmsConfigSaving] = useState(false);
  const [smsConfigError, setSmsConfigError] = useState<string | null>(null);
  const [smsConfigSuccess, setSmsConfigSuccess] = useState<string | null>(null);
  const [smsProviderType, setSmsProviderType] = useState<'beem' | 'custom_rest'>('custom_rest');
  const [smsEndpoint, setSmsEndpoint] = useState('');
  const [smsSenderId, setSmsSenderId] = useState('');
  const [smsAuthType, setSmsAuthType] = useState<'none' | 'bearer' | 'api_key' | 'basic'>('bearer');
  const [smsApiKey, setSmsApiKey] = useState('');
  const [smsApiSecret, setSmsApiSecret] = useState('');
  const [smsApiKeyHeader, setSmsApiKeyHeader] = useState('X-API-Key');
  const [smsRecipientField, setSmsRecipientField] = useState('to');
  const [smsMessageField, setSmsMessageField] = useState('message');
  const [smsSenderField, setSmsSenderField] = useState('sender');
  const [smsResponseIdField, setSmsResponseIdField] = useState('messageId');
  const [smsResponseSuccessField, setSmsResponseSuccessField] = useState('');
  const [smsResponseSuccessValue, setSmsResponseSuccessValue] = useState('true');
  const [smsConfigEnabled, setSmsConfigEnabled] = useState(false);
  const [bulkName, setBulkName] = useState('');
  const [bulkRecipients, setBulkRecipients] = useState('');
  const [bulkMessage, setBulkMessage] = useState('');
  const [bulkCategory, setBulkCategory] = useState<'TRANSACTIONAL' | 'EXPIRY' | 'PAYMENT' | 'PURCHASE' | 'MARKETING'>('EXPIRY');
  const [bulkConfirmed, setBulkConfirmed] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkSuccess, setBulkSuccess] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<SmsCampaign[]>([]);

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

  const loadSmsSettings = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    setSmsConfigLoading(true);
    try {
      const settings = await apiFetch<SmsProviderSettings>('/notifications/sms/settings', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSmsSettings(settings);
      setSmsProviderType(settings.provider);
      setSmsEndpoint(settings.endpoint || '');
      setSmsSenderId(settings.senderId || '');
      setSmsAuthType(settings.authType || 'bearer');
      setSmsApiKeyHeader(settings.apiKeyHeader || 'X-API-Key');
      setSmsRecipientField(settings.recipientField || 'to');
      setSmsMessageField(settings.messageField || 'message');
      setSmsSenderField(settings.senderField || 'sender');
      setSmsResponseIdField(settings.responseIdField || 'messageId');
      setSmsResponseSuccessField(settings.responseSuccessField || '');
      setSmsResponseSuccessValue(settings.responseSuccessValue || 'true');
      setSmsConfigEnabled(settings.enabled === true);
    } catch (err: unknown) {
      setSmsConfigError(err instanceof Error ? err.message : 'Unable to load SMS settings.');
    } finally {
      setSmsConfigLoading(false);
    }
  }, []);

  useEffect(() => { void loadSmsSettings(); }, [loadSmsSettings]);

  async function saveSmsSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getAccessToken();
    if (!token) { setSmsConfigError('Authentication required.'); return; }
    if (smsProviderType === 'custom_rest' && !smsEndpoint.trim()) {
      setSmsConfigError('Custom provider endpoint is required.');
      return;
    }
    if (!smsSenderId.trim()) { setSmsConfigError('Sender ID is required.'); return; }
    setSmsConfigSaving(true); setSmsConfigError(null); setSmsConfigSuccess(null);
    try {
      const saved = await apiFetch<{ hasCredentials: boolean }>('/notifications/sms/settings', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: smsProviderType, endpoint: smsEndpoint.trim() || undefined, senderId: smsSenderId.trim(),
          authType: smsAuthType, apiKey: smsApiKey || undefined, apiSecret: smsApiSecret || undefined,
          apiKeyHeader: smsApiKeyHeader, recipientField: smsRecipientField, messageField: smsMessageField,
          senderField: smsSenderField, responseIdField: smsResponseIdField,
          responseSuccessField: smsResponseSuccessField, responseSuccessValue: smsResponseSuccessValue,
          enabled: smsConfigEnabled,
        }),
      });
      setSmsApiKey(''); setSmsApiSecret('');
      setSmsConfigSuccess('Provider settings saved. Credentials are stored encrypted; no test SMS was sent.');
      if (smsSettings) setSmsSettings({ ...smsSettings, provider: smsProviderType, endpoint: smsEndpoint, senderId: smsSenderId, authType: smsAuthType, hasCredentials: saved.hasCredentials, enabled: smsConfigEnabled });
      await Promise.all([loadSmsSettings(), load()]);
    } catch (err: unknown) {
      setSmsConfigError(err instanceof ApiError || err instanceof Error ? err.message : 'Unable to save SMS settings.');
    } finally {
      setSmsConfigSaving(false);
    }
  }

  const loadCampaigns = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    try {
      const result = await apiFetch<{ data: SmsCampaign[] }>('/notifications/sms/campaigns?limit=20', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCampaigns(Array.isArray(result.data) ? result.data : []);
    } catch {
      // Campaign history is an independent surface; keep the outbox usable if it is unavailable.
    }
  }, []);

  useEffect(() => { void loadCampaigns(); }, [loadCampaigns]);

  async function queueBulkCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getAccessToken();
    if (!token) { setBulkError('Authentication required.'); return; }
    const recipients = [...new Set(bulkRecipients.split(/[\\s,;]+/).map((value) => value.trim()).filter(Boolean))];
    if (!recipients.length) { setBulkError('Add at least one phone number.'); return; }
    if (recipients.length > 1000) { setBulkError('A campaign can contain at most 1,000 unique recipients.'); return; }
    if (!bulkMessage.trim()) { setBulkError('Write the SMS message before queueing.'); return; }
    if (!bulkConfirmed) { setBulkError('Confirm that this campaign and recipient list are correct.'); return; }
    setBulkSending(true); setBulkError(null); setBulkSuccess(null);
    try {
      const key = `web-bulk-${crypto.randomUUID()}`;
      const result = await apiFetch<SmsCampaign>('/notifications/sms/bulk', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({ name: bulkName.trim() || undefined, recipients, message: bulkMessage.trim(), category: bulkCategory, idempotencyKey: key }),
      });
      setBulkSuccess(`Campaign queued: ${result.queuedCount ?? recipients.length} recipient(s). Messages will only be submitted when the SMS provider is enabled and configured.`);
      setBulkName(''); setBulkRecipients(''); setBulkMessage(''); setBulkConfirmed(false);
      await Promise.all([load(), loadCampaigns()]);
    } catch (err: unknown) {
      setBulkError(err instanceof ApiError || err instanceof Error ? err.message : 'Unable to queue this SMS campaign.');
    } finally {
      setBulkSending(false);
    }
  }

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
    { key: 'SENT', value: stats.SENT, icon: 'check' as const, label: 'Accepted by provider', tone: 'sent' },
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
            <p>Delivery queue, provider acceptance and retry controls for the authenticated tenant. Provider acceptance is not a handset delivery receipt.</p>
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
            ? 'Provider credentials are present and SMS worker is enabled. A provider acceptance is not a handset delivery receipt.'
            : 'SMS delivery is safely disabled until credentials, sender ID and SMS_ENABLED=true are configured.')}</p>
        </div>
        <span className={`notifications-sms-state ${smsProvider?.configured ? 'ready' : 'disabled'}`}>
          {smsStatusError ? 'STATUS UNKNOWN' : smsProvider?.configured ? 'CONFIGURED' : 'DISABLED'}
        </span>
      </section>

      <section className="notifications-surface notifications-bulk-surface" aria-labelledby="sms-settings-title">
        <div className="notifications-surface-head">
          <div><span>PROVIDER CONTROL CENTER</span><h2 id="sms-settings-title">SMS Gateway Settings</h2><p>Choose a provider, set the Sender ID and map its REST API. Credentials are write-only and never returned to the browser.</p></div>
        </div>
        <form className="notifications-bulk-form" onSubmit={(event) => void saveSmsSettings(event)}>
          <div className="notifications-bulk-fields">
            <label>Provider
              <select value={smsProviderType} onChange={(event) => { const next = event.target.value as typeof smsProviderType; setSmsProviderType(next); if (next === 'beem') setSmsAuthType('basic'); }}>
                <option value="custom_rest">Custom REST API</option><option value="beem">Beem</option>
              </select>
            </label>
            <label>Sender ID
              <input value={smsSenderId} onChange={(event) => setSmsSenderId(event.target.value)} maxLength={16} placeholder="Approved sender ID" required />
            </label>
          </div>
          {smsProviderType === 'custom_rest' ? <label className="notifications-bulk-wide">HTTPS send endpoint
            <input value={smsEndpoint} onChange={(event) => setSmsEndpoint(event.target.value)} type="url" placeholder="https://api.provider.example/sms/send" required />
            <small>The hostname must be approved in the server-side SMS_CUSTOM_ALLOWED_HOSTS allowlist.</small>
          </label> : <p>Beem uses its native request format. Leave endpoint blank to use the standard Beem endpoint.</p>}
          {smsProviderType === 'custom_rest' ? <div className="notifications-bulk-fields">
            <label>Authentication
              <select value={smsAuthType} onChange={(event) => setSmsAuthType(event.target.value as typeof smsAuthType)}>
                <option value="bearer">Bearer token</option><option value="api_key">API key header</option><option value="basic">Basic authentication</option><option value="none">No authentication</option>
              </select>
            </label>
            {smsAuthType === 'api_key' ? <label>API key header name
              <input value={smsApiKeyHeader} onChange={(event) => setSmsApiKeyHeader(event.target.value)} placeholder="X-API-Key" />
            </label> : null}
          </div> : <p>Beem requires Basic authentication with both API key/username and API secret. The provider adapter uses Beem's native request format.</p>}
          {smsAuthType !== 'none' ? <div className="notifications-bulk-fields">
            <label>API key / username
              <input value={smsApiKey} onChange={(event) => setSmsApiKey(event.target.value)} type="password" autoComplete="new-password" placeholder={smsSettings?.hasCredentials ? 'Saved securely — blank keeps current key' : 'Enter API key or username'} />
            </label>
            {smsAuthType === 'basic' ? <label>API secret / password
              <input value={smsApiSecret} onChange={(event) => setSmsApiSecret(event.target.value)} type="password" autoComplete="new-password" placeholder={smsSettings?.hasCredentials ? 'Saved securely — blank keeps current secret' : 'Enter API secret'} />
            </label> : null}
          </div> : null}
          {smsProviderType === 'custom_rest' ? <>
            <div className="notifications-bulk-fields">
              <label>Request field: recipient
                <input value={smsRecipientField} onChange={(event) => setSmsRecipientField(event.target.value)} placeholder="to or recipient.phone" />
              </label>
              <label>Request field: message
                <input value={smsMessageField} onChange={(event) => setSmsMessageField(event.target.value)} placeholder="message or content.text" />
              </label>
              <label>Request field: Sender ID
                <input value={smsSenderField} onChange={(event) => setSmsSenderField(event.target.value)} placeholder="sender" />
              </label>
              <label>Response field: message ID
                <input value={smsResponseIdField} onChange={(event) => setSmsResponseIdField(event.target.value)} placeholder="messageId or data.id" />
              </label>
              <label>Optional response success field
                <input value={smsResponseSuccessField} onChange={(event) => setSmsResponseSuccessField(event.target.value)} placeholder="success or data.accepted" />
              </label>
              <label>Expected success value
                <input value={smsResponseSuccessValue} onChange={(event) => setSmsResponseSuccessValue(event.target.value)} placeholder="true" />
              </label>
            </div>
            <small>Use simple JSON paths (for example data.messageId). Arbitrary scripts and redirects are not supported.</small>
          </> : null}
          <label className="notifications-bulk-confirm">
            <input type="checkbox" checked={smsConfigEnabled} onChange={(event) => setSmsConfigEnabled(event.target.checked)} />
            <span>Enable this tenant's provider configuration. Dispatch still requires the deployment-level SMS_ENABLED=true switch and an approved Sender ID.</span>
          </label>
          {smsConfigError ? <div className="notifications-error" role="alert"><Icon name="alert" /><span>{smsConfigError}</span></div> : null}
          {smsConfigSuccess ? <div className="notifications-bulk-success" role="status">{smsConfigSuccess}</div> : null}
          <div className="notifications-bulk-submit">
            <span>{smsConfigLoading ? 'Loading saved configuration…' : smsSettings?.hasCredentials ? 'Credentials are saved encrypted. Leave secret fields blank to retain them.' : 'No saved credentials are available.'}</span>
            <button className="notifications-action primary" type="submit" disabled={smsConfigSaving || smsConfigLoading}>
              {smsConfigSaving ? 'Saving settings…' : 'Save SMS settings'}
            </button>
          </div>
        </form>
      </section>

      <section className="notifications-surface notifications-bulk-surface" aria-labelledby="bulk-sms-title">
        <div className="notifications-surface-head">
          <div>
            <span>CAMPAIGN COMPOSER</span>
            <h2 id="bulk-sms-title">Bulk SMS</h2>
            <p>Queue up to 1,000 unique Tanzanian mobile numbers. No SMS is submitted until provider delivery is enabled.</p>
          </div>
        </div>
        <form className="notifications-bulk-form" onSubmit={(event) => void queueBulkCampaign(event)}>
          <div className="notifications-bulk-fields">
            <label>Campaign name
              <input value={bulkName} onChange={(event) => setBulkName(event.target.value)} maxLength={120} placeholder="e.g. October expiry reminders" />
            </label>
            <label>Message category
              <select value={bulkCategory} onChange={(event) => setBulkCategory(event.target.value as typeof bulkCategory)}>
                <option value="EXPIRY">Expiry reminder</option>
                <option value="PAYMENT">Payment update</option>
                <option value="PURCHASE">Purchase confirmation</option>
                <option value="TRANSACTIONAL">Transactional</option>
                <option value="MARKETING">Marketing (opt-in required)</option>
              </select>
            </label>
          </div>
          <label className="notifications-bulk-wide">Recipients
            <textarea value={bulkRecipients} onChange={(event) => setBulkRecipients(event.target.value)} rows={4} placeholder="255712345678&#10;0712345678&#10;Separate numbers with a new line, comma or semicolon." />
            <small>{new Set(bulkRecipients.split(/[\\s,;]+/).map((value) => value.trim()).filter(Boolean)).size} unique recipient(s), maximum 1,000. Numbers are normalized and validated by the API.</small>
          </label>
          <label className="notifications-bulk-wide">SMS message
            <textarea value={bulkMessage} onChange={(event) => setBulkMessage(event.target.value)} rows={4} maxLength={1600} placeholder="Write the message to send…" required />
            <small>{bulkMessage.length}/1,600 characters. Longer messages may use multiple SMS segments and increase cost.</small>
          </label>
          {bulkError ? <div className="notifications-error" role="alert"><Icon name="alert" /><span>{bulkError}</span></div> : null}
          {bulkSuccess ? <div className="notifications-bulk-success" role="status">{bulkSuccess}</div> : null}
          <label className="notifications-bulk-confirm">
            <input type="checkbox" checked={bulkConfirmed} onChange={(event) => setBulkConfirmed(event.target.checked)} />
            <span>I have permission to contact these recipients and have checked the campaign content. Marketing messages will be queued only for numbers with recorded opt-in for this tenant.</span>
          </label>
          <div className="notifications-bulk-submit">
            <span>Queueing is not proof of handset delivery. Provider credentials and an approved sender ID are required for dispatch.</span>
            <button className="notifications-action primary" type="submit" disabled={bulkSending || !bulkConfirmed}>
              {bulkSending ? 'Queueing campaign…' : 'Queue bulk SMS'}
            </button>
          </div>
        </form>
      </section>

      <section className="notifications-surface notifications-campaigns-surface">
        <div className="notifications-surface-head">
          <div><span>CAMPAIGN HISTORY</span><h2>Recent bulk campaigns</h2><p>Progress is based on tenant-scoped outbox rows and provider acceptance.</p></div>
        </div>
        {campaigns.length ? (
          <div className="notifications-table-wrap">
            <table className="notifications-table">
              <thead><tr><th>Campaign</th><th>Category</th><th>Recipients</th><th>Queued</th><th>Waiting</th><th>Accepted</th><th>Failed</th><th>Created</th></tr></thead>
              <tbody>{campaigns.map((campaign) => <tr key={campaign.id}>
                <td><strong>{campaign.name}</strong><small>{campaign.id.slice(0, 8)}…</small></td>
                <td>{campaign.category}</td><td>{campaign.recipientCount}</td><td>{campaign.queuedCount}</td><td>{campaign.pending + campaign.processing}</td><td>{campaign.accepted}</td><td>{campaign.failed}</td><td>{fmt(campaign.createdAt)}</td>
              </tr>)}</tbody>
            </table>
          </div>
        ) : <div className="notifications-empty"><strong>No bulk campaigns yet</strong><span>Queued campaigns for this tenant will appear here.</span></div>}
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
