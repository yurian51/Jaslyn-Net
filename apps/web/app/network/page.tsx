'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch, ApiError } from '../../lib/api';
import { getAccessToken } from '../../lib/auth';
import BrandLogo from '../brand-logo';

type Router = {
  id: string;
  name: string;
  vendor?: string;
  model?: string;
  ipAddress?: string;
  macAddress?: string;
  status?: 'ONLINE' | 'DEGRADED' | 'OFFLINE' | string;
  activeUsers?: number;
  lastSeenAt?: string;
  managementProtocol?: string;
  managementEnabled?: boolean;
  managementCredentialsConfigured?: boolean;
  apiEnabled?: boolean;
  apiEndpoint?: string;
  controllerEndpoint?: string;
  capabilities?: { capabilities?: string[] };
  syncError?: string | null;
};

type RouterResponse = { data: Router[] };
type DeviceOperational = { telemetry: { uptime: string | number | null; cpu: number | null; memory: number | null; interfaces: unknown[] | null; bandwidth: number | null; latency: number | null; packetLoss: number | null; source: string }; activeSessions: number; recentCommands: Array<{ id: string; commandType: string; status: string; provider?: string; error?: string | null }>; recentIncidents: Array<{ id: string; title: string; severity: string; status: string }> };
type CommandCenterResponse = { devices: Array<DeviceOperational & { id: string }> };

const MANAGEMENT_PROTOCOLS = [
  ['MIKROTIK_REST', 'MikroTik RouterOS REST'],
  ['UNIFI_NETWORK_API', 'Ubiquiti UniFi Network API'],
  ['OMADA_CONTROLLER_API', 'TP-Link Omada Controller API'],
  ['CAMBIUM_CNMAESTRO', 'Cambium cnMaestro'],
  ['MERAKI_DASHBOARD_API', 'Cisco Meraki Dashboard API'],
  ['ARUBA_CENTRAL_API', 'Aruba Central API'],
  ['GRANDSTREAM_GWN_API', 'Grandstream GWN API'],
  ['RUIJIE_REYEE_CLOUD_API', 'Ruijie/Reyee Cloud API'],
  ['RUCKUS_SMARTZONE_API', 'Ruckus SmartZone API'],
  ['OPENWRT_UBUS', 'OpenWrt ubus'],
  ['TELTONIKA_RMS_API', 'Teltonika RMS API'],
  ['PEPLINK_INCONTROL_API', 'Peplink InControl'],
  ['PFSENSE_API', 'pfSense / OPNsense API'],
  ['GENERIC_HTTP', 'Generic HTTP API'],
  ['SNMP', 'SNMP'],
  ['RADIUS_NAS', 'RADIUS NAS'],
] as const;

const INITIAL_FORM = {
  name: '',
  vendor: '',
  model: '',
  ipAddress: '',
  macAddress: '',
  osVersion: '',
  apiEndpoint: '',
  managementProtocol: 'MIKROTIK_REST',
  managementEnabled: true,
  controllerEndpoint: '',
  username: '',
  password: '',
  apiKey: '',
  clientId: '',
  clientSecret: '',
  accessToken: '',
  refreshToken: '',
};

type DeviceForm = typeof INITIAL_FORM;

function formatDate(value?: string) {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Invalid timestamp' : date.toLocaleString();
}

function Icon({ name }: { name: 'network' | 'plus' | 'refresh' | 'router' | 'users' | 'alert' | 'offline' | 'close' | 'search' }) {
  const paths = {
    network: <><rect x="4" y="4" width="16" height="12" rx="2" /><path d="M8 20h8M12 16v4M8 9h8M8 12h5" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    refresh: <><path d="M20 11a8 8 0 0 0-14.8-4.1L4 9" /><path d="M4 5v4h4" /><path d="M4 13a8 8 0 0 0 14.8 4.1L20 15" /><path d="M20 19v-4h-4" /></>,
    router: <><rect x="4" y="7" width="16" height="10" rx="2" /><path d="M8 11h.01M12 11h.01M16 11h.01M8 14h8" /></>,
    users: <><circle cx="9" cy="8" r="3" /><path d="M3.8 19c.5-3.1 2.1-4.7 5.2-4.7s4.7 1.6 5.2 4.7" /><path d="M15 6.5a3 3 0 0 1 0 5.8M17.1 14.4c1.8.5 3 1.8 3.5 4.6" /></>,
    alert: <><path d="m12 3 9 17H3L12 3Z" /><path d="M12 9v4M12 16h.01" /></>,
    offline: <><path d="M4 4l16 16" /><path d="M6 9a9 9 0 0 1 8.6-2.1M9 13a5 5 0 0 1 3-1M14 16.5a2.4 2.4 0 0 1-4 1.7" /></>,
    close: <path d="m7 7 10 10M17 7 7 17" />,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
  } as const;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export default function NetworkPage() {
  const [routers, setRouters] = useState<Router[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<DeviceForm>(INITIAL_FORM);
  const [operational, setOperational] = useState<Record<string, DeviceOperational>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

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
      const response = await apiFetch<RouterResponse>('/routers', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setRouters(Array.isArray(response.data) ? response.data : []);
      try {
        const commandCenter = await apiFetch<CommandCenterResponse>('/overview/command-center', { headers: { Authorization: `Bearer ${token}` } });
        setOperational(Object.fromEntries((commandCenter.devices ?? []).map((device) => [device.id, device])));
      } catch {
        setOperational({});
      }
    } catch (cause: unknown) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Unable to load network devices.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function setField<K extends keyof DeviceForm>(key: K, value: DeviceForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function createDevice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getAccessToken();

    if (!token) {
      setError('Authentication required.');
      return;
    }

    if (!form.name.trim()) {
      setError('Device name is required.');
      return;
    }

    if (!form.vendor.trim()) {
      setError('Vendor is required so Jaslyn Net can select the correct management integration.');
      return;
    }

    setSaving(true);
    setError(null);

    const credentials = Object.fromEntries(
      Object.entries({
        apiKey: form.apiKey,
        username: form.username,
        password: form.password,
        clientId: form.clientId,
        clientSecret: form.clientSecret,
        accessToken: form.accessToken,
        refreshToken: form.refreshToken,
      }).filter(([, value]) => value.trim()),
    );

    const body = {
      name: form.name.trim(),
      vendor: form.vendor.trim(),
      model: form.model.trim() || undefined,
      ipAddress: form.ipAddress.trim() || undefined,
      macAddress: form.macAddress.trim() || undefined,
      osVersion: form.osVersion.trim() || undefined,
      apiEndpoint: form.apiEndpoint.trim() || undefined,
      managementProtocol: form.managementProtocol || undefined,
      managementEnabled: form.managementEnabled,
      controllerEndpoint: form.controllerEndpoint.trim() || undefined,
      ...(Object.keys(credentials).length ? { managementCredentials: credentials } : {}),
    };

    try {
      await apiFetch<Router>('/routers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      setForm(INITIAL_FORM);
      setShowCreate(false);
      await load();
    } catch (cause: unknown) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Unable to register network device.');
    } finally {
      setSaving(false);
    }
  }

  const online = routers.filter((router) => router.status === 'ONLINE').length;
  const degraded = routers.filter((router) => router.status === 'DEGRADED').length;
  const offline = routers.filter((router) => router.status === 'OFFLINE').length;
  const users = routers.reduce((sum, router) => sum + Number(router.activeUsers ?? 0), 0);

  const filteredRouters = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return routers;
    return routers.filter((router) =>
      `${router.name} ${router.vendor ?? ''} ${router.model ?? ''} ${router.ipAddress ?? ''} ${router.status ?? ''} ${router.managementProtocol ?? ''}`.toLowerCase().includes(normalized),
    );
  }, [query, routers]);

  return (
    <main className="network-page">
      <header className="network-header">
        <div className="network-title">
          <div className="network-brand"><BrandLogo alt="JASLYN NET" /></div>
          <div>
            <span>JASLYN NET · NETWORK</span>
            <h1>Network operations</h1>
            <p>Manage routers, gateways and network infrastructure from one tenant-scoped control surface.</p>
          </div>
        </div>
        <div className="network-actions">
          <button className="network-button secondary" type="button" onClick={() => void load()} disabled={loading}>
            <Icon name="refresh" />
            <span>{loading ? 'Refreshing…' : 'Refresh'}</span>
          </button>
          <button className="network-button primary" type="button" onClick={() => { setError(null); setShowCreate(true); }}>
            <Icon name="plus" />
            <span>Add device</span>
          </button>
        </div>
      </header>

      {error ? (
        <div className="network-error" role="alert"><Icon name="alert" /><span>{error}</span></div>
      ) : null}

      <section className="network-summary" aria-label="Network inventory summary">
        <div className="network-summary-intro">
          <span>NETWORK INVENTORY</span>
          <strong>Current device posture</strong>
          <small>Live state reported through the network API.</small>
        </div>
        <div className="network-stat-grid">
          <article className="network-stat">
            <div className="network-stat-icon"><Icon name="router" /></div>
            <strong>{routers.length}</strong><span>Registered devices</span><small>tenant inventory</small>
          </article>
          <article className="network-stat online">
            <div className="network-stat-icon"><Icon name="network" /></div>
            <strong>{online}</strong><span>Operational</span><small>online state</small>
          </article>
          <article className="network-stat degraded">
            <div className="network-stat-icon"><Icon name="alert" /></div>
            <strong>{degraded}</strong><span>Attention</span><small>degraded state</small>
          </article>
          <article className="network-stat offline">
            <div className="network-stat-icon"><Icon name="offline" /></div>
            <strong>{offline}</strong><span>Offline</span><small>not reporting</small>
          </article>
          <article className="network-stat users">
            <div className="network-stat-icon"><Icon name="users" /></div>
            <strong>{users}</strong><span>Connected users</span><small>reported active users</small>
          </article>
        </div>
      </section>

      {showCreate ? (
        <section className="network-provisioning" aria-label="Add network device">
          <div className="network-provisioning-head">
            <div>
              <span>DEVICE PROVISIONING</span>
              <h2>Register a network device</h2>
              <p>Credentials are sent to the authenticated API and are never displayed back by this page.</p>
            </div>
            <button className="network-icon-button" type="button" onClick={() => { setShowCreate(false); setError(null); }} aria-label="Close device registration">
              <Icon name="close" />
            </button>
          </div>

          <div className="network-presets">
            <span>Quick setup</span>
            <button type="button" onClick={() => setForm({ ...INITIAL_FORM, name: 'MikroTik Router', vendor: 'MikroTik', managementProtocol: 'MIKROTIK_REST' })}>MikroTik</button>
            <button type="button" onClick={() => setForm({ ...INITIAL_FORM, name: 'Omada EAP', vendor: 'TP-Link Omada', managementProtocol: 'OMADA_CONTROLLER_API' })}>Omada</button>
            <button type="button" onClick={() => setForm({ ...INITIAL_FORM, name: 'RADIUS NAS', vendor: 'RADIUS NAS', managementProtocol: 'RADIUS_NAS' })}>RADIUS NAS</button>
          </div>

          <form className="network-form" onSubmit={createDevice}>
            <div className="network-form-section">
              <div className="network-form-heading"><strong>Identity</strong><span>Basic inventory information</span></div>
              <div className="network-form-grid three">
                <label>Device name *<input required maxLength={120} value={form.name} onChange={(event) => setField('name', event.target.value)} placeholder="Nduruma Core Router" /></label>
                <label>Vendor *<input required maxLength={60} value={form.vendor} onChange={(event) => setField('vendor', event.target.value)} placeholder="MikroTik" /></label>
                <label>Model<input maxLength={80} value={form.model} onChange={(event) => setField('model', event.target.value)} placeholder="CCR2004-1G-12S+2XS" /></label>
                <label>IP address<input maxLength={45} value={form.ipAddress} onChange={(event) => setField('ipAddress', event.target.value)} placeholder="192.168.88.1" /></label>
                <label>MAC address<input maxLength={64} value={form.macAddress} onChange={(event) => setField('macAddress', event.target.value)} placeholder="AA:BB:CC:DD:EE:FF" /></label>
                <label>OS / firmware<input maxLength={80} value={form.osVersion} onChange={(event) => setField('osVersion', event.target.value)} placeholder="RouterOS 7" /></label>
              </div>
            </div>

            <div className="network-form-section">
              <div className="network-form-heading"><strong>Management</strong><span>How Jaslyn Net communicates with the device</span></div>
              <div className="network-form-grid three">
                <label>Management protocol<select value={form.managementProtocol} onChange={(event) => setField('managementProtocol', event.target.value)}>{MANAGEMENT_PROTOCOLS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label>Device API endpoint<input type="url" maxLength={300} value={form.apiEndpoint} onChange={(event) => setField('apiEndpoint', event.target.value)} placeholder="https://192.168.88.1/rest" /></label>
                <label>Controller endpoint<input type="url" maxLength={300} value={form.controllerEndpoint} onChange={(event) => setField('controllerEndpoint', event.target.value)} placeholder="https://controller.example.com" /></label>
                <label className="network-toggle-field"><span>Management enabled</span><input type="checkbox" checked={form.managementEnabled} onChange={(event) => setField('managementEnabled', event.target.checked)} /></label>
              </div>
            </div>

            <div className="network-form-section">
              <div className="network-form-heading"><strong>Credentials</strong><span>Optional · encrypted at rest by the API</span></div>
              <div className="network-form-grid three">
                <label>Username<input autoComplete="off" maxLength={160} value={form.username} onChange={(event) => setField('username', event.target.value)} placeholder="admin" /></label>
                <label>Password<input type="password" autoComplete="new-password" maxLength={500} value={form.password} onChange={(event) => setField('password', event.target.value)} placeholder="Device password" /></label>
                <label>API key<input type="password" autoComplete="off" maxLength={500} value={form.apiKey} onChange={(event) => setField('apiKey', event.target.value)} placeholder="API key" /></label>
                <label>Client ID<input autoComplete="off" maxLength={300} value={form.clientId} onChange={(event) => setField('clientId', event.target.value)} placeholder="Client ID" /></label>
                <label>Client secret<input type="password" autoComplete="new-password" maxLength={500} value={form.clientSecret} onChange={(event) => setField('clientSecret', event.target.value)} placeholder="Client secret" /></label>
                <label>Access token<input type="password" autoComplete="off" maxLength={2000} value={form.accessToken} onChange={(event) => setField('accessToken', event.target.value)} placeholder="Access token" /></label>
                <label>Refresh token<input type="password" autoComplete="off" maxLength={2000} value={form.refreshToken} onChange={(event) => setField('refreshToken', event.target.value)} placeholder="Refresh token" /></label>
              </div>
            </div>

            <div className="network-form-actions">
              <button type="button" className="network-button secondary" onClick={() => { setShowCreate(false); setError(null); }}>Cancel</button>
              <button type="submit" className="network-button primary" disabled={saving}>
                <Icon name="plus" />
                <span>{saving ? 'Registering…' : 'Register device'}</span>
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="network-surface">
        <div className="network-surface-head">
          <div>
            <span>DEVICE FLEET</span>
            <h2>Network devices</h2>
            <p>{offline} offline · management credentials remain hidden.</p>
          </div>
          <label className="network-search">
            <Icon name="search" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search devices" aria-label="Search devices" />
            {query ? <button type="button" onClick={() => setQuery('')} aria-label="Clear search">×</button> : null}
          </label>
        </div>

        <div className="network-table-wrap">
          <table className="network-table">
            <thead>
              <tr>
                <th>Device</th>
                <th>Vendor / model</th>
                <th>Address</th>
                <th>Users</th>
                <th>Management</th>
                <th>Last seen</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredRouters.map((router) => (
                <tr key={router.id} onDoubleClick={() => setExpanded(expanded === router.id ? null : router.id)}>
                  <td><button className="network-device-trigger" onClick={() => setExpanded(expanded === router.id ? null : router.id)} aria-expanded={expanded === router.id}><strong>{router.name}</strong><small>{router.id}</small></button></td>
                  <td>{router.vendor ?? 'Unknown'}{router.model ? ` · ${router.model}` : ''}</td>
                  <td>{router.ipAddress ?? '—'}</td>
                  <td>{Number(router.activeUsers ?? 0)}</td>
                  <td>{router.managementEnabled === false ? 'Disabled' : router.managementProtocol ?? 'Unspecified'}{router.managementCredentialsConfigured ? ' · configured' : ''}</td>
                  <td>{formatDate(router.lastSeenAt)}</td>
                  <td>
                    <span className={`network-status ${(router.status ?? 'UNKNOWN').toLowerCase()}`}><i />{router.status ?? 'UNKNOWN'}</span>
                    {router.syncError ? <small className="network-sync-error">{router.syncError}</small> : null}
                  </td>
                </tr>
                {expanded === router.id && <tr className="network-expanded-row"><td colSpan={7}><div className="network-device-detail">
                  <div><span>REACHABILITY</span><b>{router.status === 'OFFLINE' ? 'UNREACHABLE' : router.status}</b></div>
                  <div><span>ACTIVE SESSIONS</span><b>{operational[router.id]?.activeSessions ?? '—'}</b></div>
                  <div><span>UPTIME</span><b>{operational[router.id]?.telemetry.uptime ?? 'Not reported'}</b></div>
                  <div><span>CPU</span><b>{operational[router.id]?.telemetry.cpu == null ? 'Not reported' : operational[router.id]?.telemetry.cpu + '%'}</b></div>
                  <div><span>MEMORY</span><b>{operational[router.id]?.telemetry.memory == null ? 'Not reported' : operational[router.id]?.telemetry.memory + '%'}</b></div>
                  <div><span>LATENCY / LOSS</span><b>{operational[router.id]?.telemetry.latency == null ? 'Not reported' : operational[router.id]?.telemetry.latency + ' ms'} / {operational[router.id]?.telemetry.packetLoss == null ? 'Not reported' : operational[router.id]?.telemetry.packetLoss + '%'}</b></div>
                  <div><span>BANDWIDTH</span><b>{operational[router.id]?.telemetry.bandwidth == null ? 'Not reported' : String(operational[router.id]?.telemetry.bandwidth)}</b></div>
                  <div><span>INTERFACES</span><b>{operational[router.id]?.telemetry.interfaces == null ? 'Not reported' : String(operational[router.id]?.telemetry.interfaces.length)}</b></div>
                  <div className="network-device-history"><span>RECENT COMMANDS</span>{(operational[router.id]?.recentCommands ?? []).slice(0,5).map((command) => <small key={command.id}>{command.commandType} · {command.status}{command.error ? ' · ' + command.error : ''}</small>)}{!operational[router.id]?.recentCommands?.length && <small>No command records.</small>}</div>
                  <div className="network-device-history"><span>RECENT INCIDENTS</span>{(operational[router.id]?.recentIncidents ?? []).slice(0,5).map((incident) => <small key={incident.id}>{incident.severity} · {incident.title}</small>)}{!operational[router.id]?.recentIncidents?.length && <small>No linked incident records.</small>}</div>
                  <div className="network-telemetry-note">{operational[router.id]?.telemetry.source === 'NOT_REPORTED_BY_CURRENT_TELEMETRY_MODEL' ? 'CPU, memory, interfaces, bandwidth, latency, packet loss and uptime are not persisted by the current telemetry model. Jaslyn Net does not invent them.' : 'Telemetry reported by the configured source.'}</div>
                </div></td></tr>
              ))}
            </tbody>
          </table>

          {!loading && !filteredRouters.length ? (
            <div className="network-empty">
              <div className="network-empty-icon"><Icon name="router" /></div>
              <strong>{query ? 'No matching devices' : 'No network devices registered'}</strong>
              <span>{query ? 'Try a broader search term.' : 'Register your first router, gateway or managed network device.'}</span>
              {!query ? <button className="network-button primary" type="button" onClick={() => setShowCreate(true)}><Icon name="plus" /><span>Register first device</span></button> : null}
            </div>
          ) : null}

          {loading ? (
            <div className="network-empty">
              <div className="network-empty-icon"><Icon name="refresh" /></div>
              <strong>Loading network inventory…</strong>
              <span>Reading current device state.</span>
            </div>
          ) : null}
        </div>
      </section>

      <footer className="network-footer">
        <span>JASLYN NET · Network Operations</span>
        <span>Authenticated tenant inventory</span>
      </footer>
    </main>
  );
}
