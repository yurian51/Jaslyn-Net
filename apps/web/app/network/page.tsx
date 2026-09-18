'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../../lib/api';
import { getAccessToken } from '../../lib/auth';

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
  name: '', vendor: '', model: '', ipAddress: '', macAddress: '', osVersion: '',
  apiEndpoint: '', managementProtocol: 'MIKROTIK_REST', managementEnabled: true,
  controllerEndpoint: '', username: '', password: '', apiKey: '', clientId: '', clientSecret: '', accessToken: '', refreshToken: '',
};

type DeviceForm = typeof INITIAL_FORM;

function formatDate(value?: string) {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Invalid timestamp' : date.toLocaleString();
}

export default function NetworkPage() {
  const [routers, setRouters] = useState<Router[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<DeviceForm>(INITIAL_FORM);

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

  function setField<K extends keyof DeviceForm>(key: K, value: DeviceForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function createDevice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getAccessToken();
    if (!token) { setError('Authentication required.'); return; }
    if (!form.name.trim()) { setError('Device name is required.'); return; }
    if (!form.vendor.trim()) { setError('Vendor is required so Jaslyn Net can select the correct management integration.'); return; }
    setSaving(true); setError(null);
    const credentials = Object.fromEntries(
      Object.entries({
        apiKey: form.apiKey, username: form.username, password: form.password,
        clientId: form.clientId, clientSecret: form.clientSecret, accessToken: form.accessToken, refreshToken: form.refreshToken,
      }).filter(([, value]) => value.trim()),
    );
    const body = {
      name: form.name.trim(), vendor: form.vendor.trim(), model: form.model.trim() || undefined,
      ipAddress: form.ipAddress.trim() || undefined, macAddress: form.macAddress.trim() || undefined,
      osVersion: form.osVersion.trim() || undefined, apiEndpoint: form.apiEndpoint.trim() || undefined,
      managementProtocol: form.managementProtocol || undefined, managementEnabled: form.managementEnabled,
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
    } finally { setSaving(false); }
  }

  const online = routers.filter((router) => router.status === 'ONLINE').length;
  const degraded = routers.filter((router) => router.status === 'DEGRADED').length;
  const offline = routers.filter((router) => router.status === 'OFFLINE').length;
  const users = routers.reduce((sum, router) => sum + Number(router.activeUsers ?? 0), 0);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><img src="/brand/file_000000006450821195473e1e14153e8a.svg" alt="" /></div><div><span>JASLYN NET</span><small>Network operations platform</small></div></div>
        <div className="workspace-switch"><span className="workspace-dot"/> Global Workspace <span>⌄</span></div>
        <nav className="nav"><p className="nav-section">OPERATIONS</p>
          <a className="nav-item" href="/dashboard"><span className="nav-icon">⌂</span>Overview</a>
          <a className="nav-item" href="/customers"><span className="nav-icon">◉</span>Customers</a>
          <a className="nav-item" href="/sessions"><span className="nav-icon">◌</span>Sessions</a>
          <a className="nav-item active" href="/network" aria-current="page"><span className="nav-icon">⌁</span>Network</a>
          <a className="nav-item" href="/ipam"><span className="nav-icon">#</span>IPAM</a>
          <a className="nav-item" href="/purchases"><span className="nav-icon">₮</span>Purchases</a>
          <a className="nav-item" href="/packages"><span className="nav-icon">▣</span>Plans &amp; Products</a>
          <a className="nav-item" href="/audit"><span className="nav-icon">◈</span>Security &amp; Audit</a>
        </nav>
        <div className="sidebar-status"><span className="pulse"/><div><strong>{error ? 'API unavailable' : 'Network monitor'}</strong><small>{error ?? `${routers.length} devices loaded`}</small></div></div>
        <div className="profile"><div className="avatar"><img src="/brand/file_000000006450821195473e1e14153e8a.svg" alt="" /></div><div><strong>JASLYN NET</strong><small>Tenant workspace</small></div></div>
      </aside>
      <section className="content">
        <header className="topbar"><div><div className="eyebrow">JASLYN NET / NETWORK</div><h1>Network operations</h1><p className="context">Register routers, gateways and managed network devices, then monitor their operational state.</p></div><div className="top-actions"><button className="selector primary-action" onClick={() => { setError(null); setShowCreate(true); }}>+ Add device</button><button className="selector" onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh devices'}</button></div></header>
        {error && <div className="error-banner" role="alert">{error}</div>}

        {showCreate && <section className="panel device-provisioning" aria-label="Add network device">
          <div className="panel-head"><div><div className="panel-kicker">DEVICE PROVISIONING</div><h2>Add network device</h2><p>Register the device in this tenant. Credentials are encrypted by the API and never returned to the browser.</p></div><button className="close-button" type="button" onClick={() => { setShowCreate(false); setError(null); }}>Close</button></div>
          <div className="device-presets" aria-label="Device type presets">
  <span>Quick setup</span>
  <button type="button" onClick={() => setForm({ ...INITIAL_FORM, name: 'MikroTik Router', vendor: 'MikroTik', managementProtocol: 'MIKROTIK_REST', apiEndpoint: '' })}>MikroTik</button>
  <button type="button" onClick={() => setForm({ ...INITIAL_FORM, name: 'Omada EAP', vendor: 'TP-Link Omada', managementProtocol: 'OMADA_CONTROLLER_API' })}>Omada EAP</button>
  <button type="button" onClick={() => setForm({ ...INITIAL_FORM, name: 'RADIUS AP', vendor: 'RADIUS NAS', managementProtocol: 'RADIUS_NAS' })}>RADIUS AP</button>
  <a href="/isp">My sites →</a>
</div>
<form className="device-form" onSubmit={createDevice}>
            <div className="form-section"><div className="form-section-title">Identity</div><div className="form-grid">
              <label>Device name *<input required maxLength={120} value={form.name} onChange={(e) => setField('name', e.target.value)} placeholder="Nduruma Core Router"/></label>
              <label>Vendor *<input required maxLength={60} value={form.vendor} onChange={(e) => setField('vendor', e.target.value)} placeholder="MikroTik"/></label>
              <label>Model<input maxLength={80} value={form.model} onChange={(e) => setField('model', e.target.value)} placeholder="CCR2004-1G-12S+2XS"/></label>
              <label>IP address<input maxLength={45} value={form.ipAddress} onChange={(e) => setField('ipAddress', e.target.value)} placeholder="192.168.88.1"/></label>
              <label>MAC address<input maxLength={64} value={form.macAddress} onChange={(e) => setField('macAddress', e.target.value)} placeholder="AA:BB:CC:DD:EE:FF"/></label>
              <label>OS / firmware<input maxLength={80} value={form.osVersion} onChange={(e) => setField('osVersion', e.target.value)} placeholder="RouterOS 7"/></label>
            </div></div>
            <div className="form-section"><div className="form-section-title">Management</div><div className="form-grid">
              <label>Management protocol<select value={form.managementProtocol} onChange={(e) => setField('managementProtocol', e.target.value)}>{MANAGEMENT_PROTOCOLS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>Device API endpoint<input type="url" maxLength={300} value={form.apiEndpoint} onChange={(e) => setField('apiEndpoint', e.target.value)} placeholder="https://192.168.88.1/rest"/></label>
              <label>Controller endpoint<input type="url" maxLength={300} value={form.controllerEndpoint} onChange={(e) => setField('controllerEndpoint', e.target.value)} placeholder="https://controller.example.com"/></label>
              <label className="toggle-label"><span>Management enabled</span><input type="checkbox" checked={form.managementEnabled} onChange={(e) => setField('managementEnabled', e.target.checked)}/></label>
            </div></div>
            <div className="form-section"><div className="form-section-title">Credentials <small>optional, encrypted at rest</small></div><div className="form-grid">
              <label>Username<input autoComplete="off" maxLength={160} value={form.username} onChange={(e) => setField('username', e.target.value)} placeholder="admin"/></label>
              <label>Password<input type="password" autoComplete="new-password" maxLength={500} value={form.password} onChange={(e) => setField('password', e.target.value)} placeholder="Device password"/></label>
              <label>API key<input type="password" autoComplete="off" maxLength={500} value={form.apiKey} onChange={(e) => setField('apiKey', e.target.value)} placeholder="API key"/></label>
              <label>Client ID<input autoComplete="off" maxLength={300} value={form.clientId} onChange={(e) => setField('clientId', e.target.value)} placeholder="Client ID"/></label>
              <label>Client secret<input type="password" autoComplete="new-password" maxLength={500} value={form.clientSecret} onChange={(e) => setField('clientSecret', e.target.value)} placeholder="Client secret"/></label>
              <label>Access token<input type="password" autoComplete="off" maxLength={2000} value={form.accessToken} onChange={(e) => setField('accessToken', e.target.value)} placeholder="Access token"/></label>
              <label>Refresh token<input type="password" autoComplete="off" maxLength={2000} value={form.refreshToken} onChange={(e) => setField('refreshToken', e.target.value)} placeholder="Refresh token"/></label>
            </div></div>
            <div className="form-actions"><button type="button" className="secondary-button" onClick={() => { setShowCreate(false); setError(null); }}>Cancel</button><button type="submit" className="primary-button" disabled={saving}>{saving ? 'Registering…' : 'Register device'}</button></div>
          </form>
        </section>}

        <section className="kpi-grid">
          <article className="kpi"><div className="kpi-label"><span>Registered devices</span></div><strong>{routers.length}</strong><div className="kpi-foot"><span>INVENTORY</span><small>tenant scoped</small></div></article>
          <article className="kpi"><div className="kpi-label"><span>Operational</span></div><strong>{online}</strong><div className="kpi-foot"><span>ONLINE</span><small>last reported state</small></div></article>
          <article className="kpi"><div className="kpi-label"><span>Attention</span></div><strong>{degraded}</strong><div className="kpi-foot"><span>DEGRADED</span><small>requires review</small></div></article>
          <article className="kpi"><div className="kpi-label"><span>Connected users</span></div><strong>{users}</strong><div className="kpi-foot"><span>LIVE</span><small>reported by routers</small></div></article>
        </section>
        <section className="panel sessions-panel"><div className="panel-head"><div><div className="panel-kicker">DEVICE FLEET</div><h2>Network devices</h2><p>{offline} offline · management credentials are never displayed.</p></div><button className="secondary-button" type="button" onClick={() => setShowCreate(true)}>Add device</button></div>
          <div className="table-wrap"><table><thead><tr><th>DEVICE</th><th>VENDOR / MODEL</th><th>ADDRESS</th><th>USERS</th><th>MANAGEMENT</th><th>LAST SEEN</th><th>STATUS</th></tr></thead><tbody>
            {routers.map((router) => <tr key={router.id}><td><strong>{router.name}</strong><br/><small>{router.id}</small></td><td>{router.vendor ?? 'Unknown'}{router.model ? ` · ${router.model}` : ''}</td><td>{router.ipAddress ?? '—'}</td><td>{Number(router.activeUsers ?? 0)}</td><td>{router.managementEnabled === false ? 'Disabled' : router.managementProtocol ?? 'Unspecified'}{router.managementCredentialsConfigured ? ' · configured' : ''}</td><td>{formatDate(router.lastSeenAt)}</td><td><span className={`status ${(router.status ?? 'UNKNOWN').toLowerCase()}`}><i/>{router.status ?? 'UNKNOWN'}</span>{router.syncError && <small> {router.syncError}</small>}</td></tr>)}
          </tbody></table>{!loading && !routers.length && <div className="empty-state"><strong>No network devices registered.</strong><span>Add your first router, gateway or managed device above.</span><button className="primary-button" type="button" onClick={() => setShowCreate(true)}>+ Register first device</button></div>}{loading && <div className="empty-state">Loading network inventory…</div>}</div>
        </section>
        <footer className="footer"><span>JASLYN NET · Network Operations</span><span>Authenticated tenant inventory</span></footer>
      </section>
      <style jsx>{`
        .primary-action{background:#172033!important;color:#fff!important;border-color:#172033!important}
        .device-presets{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin:12px 0;padding:10px;border:1px solid #e8ebf0;border-radius:8px;background:#f8fafc}.device-presets span{font-size:8px;font-weight:800;color:#7d899a;margin-right:2px}.device-presets button,.device-presets a{border:1px solid #dfe4eb;background:#fff;border-radius:6px;padding:7px 9px;font-size:8px;color:#334155;text-decoration:none}.device-presets button:hover,.device-presets a:hover{border-color:#b9c7da;background:#f2f6fb}.device-provisioning{margin-bottom:12px}
        .device-provisioning .panel-head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px}
        .device-provisioning h2{font-size:18px;margin:6px 0 4px}
        .device-provisioning p{margin:0;color:#7d899a;font-size:10px;max-width:700px}
        .close-button,.secondary-button{border:1px solid #dfe4eb;background:#fff;border-radius:7px;padding:8px 11px;font-size:9px;font-weight:700;color:#4f5c70;cursor:pointer}
        .device-form{margin-top:20px}
        .form-section{border-top:1px solid #edf0f4;padding:16px 0 2px}
        .form-section-title{font-size:9px;font-weight:800;letter-spacing:.08em;color:#263247;text-transform:uppercase;margin-bottom:12px}
        .form-section-title small{font-size:8px;letter-spacing:0;text-transform:none;color:#8a95a4;font-weight:500;margin-left:6px}
        .form-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
        .form-grid label{font-size:8px;font-weight:750;color:#69768a}
        .form-grid input,.form-grid select{display:block;width:100%;height:37px;margin-top:5px;border:1px solid #dfe4eb;border-radius:7px;padding:0 10px;outline:0;background:#fff;font-size:9px;color:#172033}
        .form-grid input:focus,.form-grid select:focus{border-color:#7b91df;box-shadow:0 0 0 3px rgba(79,112,220,.08)}
        .toggle-label{display:flex;align-items:center;justify-content:space-between;border:1px solid #e4e8ee;border-radius:7px;padding:9px 11px;height:37px;margin-top:20px}
        .toggle-label input{width:15px;height:15px;margin:0}
        .form-actions{display:flex;justify-content:flex-end;gap:8px;border-top:1px solid #edf0f4;margin-top:16px;padding-top:14px}
        .primary-button{height:37px;padding:0 15px;border:0;border-radius:7px;background:#4f70dc;color:#fff;font-size:9px;font-weight:800;cursor:pointer}
        .primary-button:disabled{opacity:.55;cursor:not-allowed}
        .empty-state{display:flex;flex-direction:column;align-items:center;gap:8px;padding:55px 20px;color:#8a95a4;font-size:10px;text-align:center}
        .empty-state strong{font-size:13px;color:#4d5a6f}
        .empty-state .primary-button{margin-top:4px}
        @media(max-width:900px){.form-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:620px){.device-provisioning .panel-head{flex-direction:column}.form-grid{grid-template-columns:1fr}.top-actions{flex-wrap:wrap}.top-actions .selector{flex:1}.form-actions{position:sticky;bottom:76px;background:#fff;padding-bottom:4px;z-index:4}}
      `}</style>
    </main>
  );
}
