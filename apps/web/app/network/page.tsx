'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch, ApiError } from '../../lib/api';
import { getAccessToken } from '../../lib/auth';
import QRCode from 'qrcode';
import './network.css';
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
type FirmwareLive = {
  routerId: string;
  vendor: string;
  model?: string;
  identity: { model: string; architecture: string; version: string; factoryFirmware: string };
  update: { status: string; installedVersion: string; latestVersion: string; channel: string; mode: string; checkCertificate: string };
  inventoryStatus: string;
};
type FirmwareJob = {
  id: string;
  status: string;
  targetVersion: string;
  preview?: { safeToExecute?: boolean; blockers?: string[]; backupReceiptId?: string; message?: string };
  errorMessage?: string;
  observedVersionAfter?: string;
};
type FirmwareJobResponse = { data: FirmwareJob[] };
type MerakiFirmwareLive = {
  networkId: string;
  productType: string;
  currentVersion: { id: string; firmware?: string; shortName?: string } | null;
  availableVersions: Array<{ id: string; firmware?: string; shortName?: string; releaseType?: string }>;
  isUpgradeAvailable: boolean;
  nextUpgrade: { time?: string; toVersion?: { id?: string; firmware?: string } } | null;
  timezone?: string;
  upgradeWindow?: unknown;
};
type MerakiFirmwareSchedule = { status: string; targetVersion: string; scheduledAt: string; verification: string };
type MerakiFirmwareVerification = {
  status: 'COMPLETED' | 'SCHEDULED' | 'PENDING_VERIFICATION' | 'NEEDS_ATTENTION' | string;
  targetVersion: string;
  installedVersion?: string | null;
  scheduledTarget?: string | null;
  scheduledAt?: string | null;
  verifiedAt: string;
  evidence: string;
};

function toLocalDateTimeInput(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

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
  networkId: '',
  productType: 'wireless',
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
  const [routersLoaded, setRoutersLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<DeviceForm>(INITIAL_FORM);
  const [qrRouter, setQrRouter] = useState<Router | null>(null);
  const [qrData, setQrData] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [firmwareRouter, setFirmwareRouter] = useState<Router | null>(null);
  const [firmwareLive, setFirmwareLive] = useState<FirmwareLive | null>(null);
  const [merakiLive, setMerakiLive] = useState<MerakiFirmwareLive | null>(null);
  const [merakiTarget, setMerakiTarget] = useState('');
  const [merakiScheduledAt, setMerakiScheduledAt] = useState('');
  const [merakiTimezone, setMerakiTimezone] = useState('Africa/Dar_es_Salaam');
  const [merakiScheduleResult, setMerakiScheduleResult] = useState<MerakiFirmwareSchedule | null>(null);\n  const [merakiVerification, setMerakiVerification] = useState<MerakiFirmwareVerification | null>(null);
  const [firmwareJob, setFirmwareJob] = useState<FirmwareJob | null>(null);
  const [firmwareBusy, setFirmwareBusy] = useState(false);
  const [firmwareError, setFirmwareError] = useState<string | null>(null);
  const [maintenanceStart, setMaintenanceStart] = useState('');
  const [maintenanceEnd, setMaintenanceEnd] = useState('');

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
      setRoutersLoaded(true);
    } catch (cause: unknown) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Unable to load network devices.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!qrRouter) { setQrData(null); setQrError(null); return; }
    let cancelled = false;
    setQrData(null); setQrError(null);
    void QRCode.toDataURL('JASLYN-NET:ROUTER:' + qrRouter.id, { errorCorrectionLevel: 'M', margin: 2, width: 360 })
      .then((data) => { if (!cancelled) setQrData(data); })
      .catch(() => { if (!cancelled) setQrError('Unable to generate this asset QR code.'); });
    return () => { cancelled = true; };
  }, [qrRouter]);

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

    if (form.managementProtocol === 'MERAKI_DASHBOARD_API' && (!form.apiKey.trim() || !form.networkId.trim() || !form.productType.trim())) {
      setError('Cisco Meraki registration requires a Dashboard API key, network ID and product type.');
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
        networkId: form.managementProtocol === 'MERAKI_DASHBOARD_API' ? form.networkId : '',
        productType: form.managementProtocol === 'MERAKI_DASHBOARD_API' ? form.productType : '',
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

  function openFirmware(router: Router) {
    setFirmwareRouter(router);
    setFirmwareLive(null);
    setMerakiLive(null);
    setMerakiTarget('');
    setMerakiScheduleResult(null);
    setMerakiScheduledAt(toLocalDateTimeInput(new Date(Date.now() + 24 * 60 * 60 * 1000)));
    setMerakiTimezone('Africa/Dar_es_Salaam');
    setFirmwareJob(null);
    setFirmwareError(null);
    setMaintenanceStart(toLocalDateTimeInput(new Date(Date.now() + 60 * 60 * 1000)));
    setMaintenanceEnd(toLocalDateTimeInput(new Date(Date.now() + 2 * 60 * 60 * 1000)));
    if (router.managementProtocol === 'MIKROTIK_REST') void loadExistingFirmwareJob(router);
  }

  async function firmwareRequest<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const token = getAccessToken();
    if (!token) throw new Error('Authentication required.');
    return apiFetch<T>(path, {
      method,
      headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }

  async function loadExistingFirmwareJob(router: Router) {
    try {
      const result = await firmwareRequest<FirmwareJobResponse>('/routers/' + router.id + '/firmware/upgrades');
      const existing = result.data.find((item) => !['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(item.status)) ?? result.data[0];
      if (existing) setFirmwareJob(existing);
    } catch (cause: unknown) {
      setFirmwareError(cause instanceof Error ? cause.message : 'Unable to load firmware job history.');
    }
  }

  async function inspectFirmware() {
    if (!firmwareRouter) return;
    setFirmwareBusy(true); setFirmwareError(null);
    try {
      const result = await firmwareRequest<FirmwareLive>('/routers/' + firmwareRouter.id + '/firmware/live');
      setFirmwareLive(result);
    } catch (cause: unknown) {
      setFirmwareError(cause instanceof Error ? cause.message : 'Live firmware inspection failed.');
    } finally { setFirmwareBusy(false); }
  }

  async function inspectMerakiFirmware() {
    if (!firmwareRouter) return;
    setFirmwareBusy(true); setFirmwareError(null); setMerakiScheduleResult(null); setMerakiVerification(null);
    try {
      const result = await firmwareRequest<MerakiFirmwareLive>('/routers/' + firmwareRouter.id + '/firmware/meraki/live');
      setMerakiLive(result);
      setMerakiTimezone(result.timezone || 'Africa/Dar_es_Salaam');
      setMerakiTarget(result.nextUpgrade?.toVersion?.id ?? result.availableVersions[0]?.id ?? '');
    } catch (cause: unknown) {
      setFirmwareError(cause instanceof Error ? cause.message : 'Meraki firmware inspection failed.');
    } finally { setFirmwareBusy(false); }
  }

  async function scheduleMerakiFirmware() {
    if (!firmwareRouter || !merakiLive || !merakiTarget || !merakiScheduledAt) return;
    if (!window.confirm('Schedule the selected Meraki firmware for the entire configured network product? This changes the vendor Dashboard schedule.')) return;
    setFirmwareBusy(true); setFirmwareError(null);
    try {
      const result = await firmwareRequest<MerakiFirmwareSchedule>('/routers/' + firmwareRouter.id + '/firmware/meraki/schedule', 'POST', {
        targetVersion: merakiTarget,
        scheduledAt: new Date(merakiScheduledAt).toISOString(),
        timezone: merakiTimezone,
        approved: true,
      });
      setMerakiScheduleResult(result);
    } catch (cause: unknown) {
      setFirmwareError(cause instanceof Error ? cause.message : 'Meraki firmware scheduling failed.');
    } finally { setFirmwareBusy(false); }
  }

  async function verifyMerakiFirmware() {
    if (!firmwareRouter || !merakiLive) return;
    const targetVersion = merakiScheduleResult?.targetVersion || merakiLive.nextUpgrade?.toVersion?.id || merakiTarget;
    const scheduledAt = merakiScheduleResult?.scheduledAt || merakiLive.nextUpgrade?.time || merakiScheduledAt;
    if (!targetVersion || !scheduledAt) {
      setFirmwareError('Choose or schedule a target version before checking completion.');
      return;
    }
    setFirmwareBusy(true); setFirmwareError(null);
    try {
      const result = await firmwareRequest<MerakiFirmwareVerification>(
        '/routers/' + firmwareRouter.id + '/firmware/meraki/verify', 'POST',
        { targetVersion, scheduledAt: new Date(scheduledAt).toISOString() },
      );
      setMerakiVerification(result);
      const live = await firmwareRequest<MerakiFirmwareLive>('/routers/' + firmwareRouter.id + '/firmware/meraki/live');
      setMerakiLive(live);
    } catch (cause: unknown) {
      setFirmwareError(cause instanceof Error ? cause.message : 'Meraki firmware completion verification failed.');
    } finally { setFirmwareBusy(false); }
  }

  async function previewFirmware() {
    if (!firmwareRouter || !firmwareLive) return;
    setFirmwareBusy(true); setFirmwareError(null);
    try {
      const result = await firmwareRequest<FirmwareJob>('/routers/' + firmwareRouter.id + '/firmware/upgrades/preview', 'POST', {
        targetVersion: firmwareLive.update.latestVersion,
        releaseSourceUrl: 'https://mikrotik.com/download',
        idempotencyKey: 'firmware-' + firmwareRouter.id + '-' + Date.now() + '-' + crypto.randomUUID(),
        maintenanceWindowStart: new Date(maintenanceStart).toISOString(),
        maintenanceWindowEnd: new Date(maintenanceEnd).toISOString(),
      });
      setFirmwareJob(result);
    } catch (cause: unknown) {
      setFirmwareError(cause instanceof Error ? cause.message : 'Firmware preflight failed.');
    } finally { setFirmwareBusy(false); }
  }

  async function prepareFirmwareBackup() {
    if (!firmwareRouter || !firmwareJob) return;
    setFirmwareBusy(true); setFirmwareError(null);
    try {
      await firmwareRequest('/routers/' + firmwareRouter.id + '/firmware/upgrades/' + firmwareJob.id + '/backup', 'POST');
      setFirmwareJob((current) => current ? { ...current, status: 'AWAITING_APPROVAL', preview: { ...current.preview, safeToExecute: true, blockers: [] } } : current);
    } catch (cause: unknown) {
      setFirmwareError(cause instanceof Error ? cause.message : 'Encrypted backup preparation failed.');
    } finally { setFirmwareBusy(false); }
  }

  async function approveFirmware() {
    if (!firmwareRouter || !firmwareJob) return;
    setFirmwareBusy(true); setFirmwareError(null);
    try {
      const result = await firmwareRequest<{ status: string }>('/routers/' + firmwareRouter.id + '/firmware/upgrades/' + firmwareJob.id + '/approve', 'POST');
      setFirmwareJob((current) => current ? { ...current, status: result.status } : current);
    } catch (cause: unknown) {
      setFirmwareError(cause instanceof Error ? cause.message : 'Firmware approval or installation failed.');
    } finally { setFirmwareBusy(false); }
  }

  async function refreshFirmwareJob() {
    if (!firmwareRouter || !firmwareJob) return;
    setFirmwareBusy(true); setFirmwareError(null);
    try {
      const result = await firmwareRequest<FirmwareJobResponse>('/routers/' + firmwareRouter.id + '/firmware/upgrades');
      const updated = result.data.find((item) => item.id === firmwareJob.id);
      if (updated) setFirmwareJob(updated);
    } catch (cause: unknown) {
      setFirmwareError(cause instanceof Error ? cause.message : 'Unable to refresh firmware job.');
    } finally { setFirmwareBusy(false); }
  }

  async function verifyFirmwareNow() {
    if (!firmwareRouter || !firmwareJob) return;
    setFirmwareBusy(true); setFirmwareError(null);
    try {
      const result = await firmwareRequest<{ status: string; observedVersionAfter?: string; installedVersion?: string }>(
        '/routers/' + firmwareRouter.id + '/firmware/upgrades/' + firmwareJob.id + '/verify', 'POST',
      );
      setFirmwareJob((current) => current ? { ...current, status: result.status, observedVersionAfter: result.installedVersion ?? result.observedVersionAfter } : current);
    } catch (cause: unknown) {
      setFirmwareError(cause instanceof Error ? cause.message : 'Post-upgrade verification failed.');
    } finally { setFirmwareBusy(false); }
  }

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
          <Link className="network-button secondary" href="/fiber-ops">Fiber GIS</Link>
          <Link className="network-button secondary" href="/network-auto-healing">Auto-healing</Link>
          <Link className="network-button secondary" href="/enterprise-capabilities">Enterprise</Link>
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
            <strong>{routersLoaded ? routers.length.toLocaleString() : '—'}</strong><span>Registered devices</span><small>tenant inventory</small>
          </article>
          <article className="network-stat online">
            <div className="network-stat-icon"><Icon name="network" /></div>
            <strong>{routersLoaded ? online.toLocaleString() : '—'}</strong><span>Operational</span><small>online state</small>
          </article>
          <article className="network-stat degraded">
            <div className="network-stat-icon"><Icon name="alert" /></div>
            <strong>{routersLoaded ? degraded.toLocaleString() : '—'}</strong><span>Attention</span><small>degraded state</small>
          </article>
          <article className="network-stat offline">
            <div className="network-stat-icon"><Icon name="offline" /></div>
            <strong>{routersLoaded ? offline.toLocaleString() : '—'}</strong><span>Offline</span><small>not reporting</small>
          </article>
          <article className="network-stat users">
            <div className="network-stat-icon"><Icon name="users" /></div>
            <strong>{routersLoaded ? users.toLocaleString() : '—'}</strong><span>Connected users</span><small>reported active users</small>
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
            <button type="button" onClick={() => setForm({ ...INITIAL_FORM, name: 'Cisco Meraki Network', vendor: 'Cisco Meraki', managementProtocol: 'MERAKI_DASHBOARD_API' })}>Cisco Meraki</button>
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
                {form.managementProtocol === 'MERAKI_DASHBOARD_API' ? <>
                  <label>Meraki network ID<input maxLength={160} value={form.networkId} onChange={(event) => setField('networkId', event.target.value)} placeholder="Network ID from Dashboard" /></label>
                  <label>Meraki product type<select value={form.productType} onChange={(event) => setField('productType', event.target.value)}>{['wireless','appliance','switch','camera','cellularGateway','sensor','wirelessController','campusGateway','secureConnect','switchCatalyst'].map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                </> : null}
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
                <th>Firmware</th>
                <th>Asset QR</th>
              </tr>
            </thead>
            <tbody>
              {filteredRouters.map((router) => (
                <tr key={router.id}>
                  <td><strong>{router.name}</strong><small>{router.id}</small></td>
                  <td>{router.vendor ?? 'Unknown'}{router.model ? ` · ${router.model}` : ''}</td>
                  <td>{router.ipAddress ?? '—'}</td>
                  <td>{Number(router.activeUsers ?? 0)}</td>
                  <td>{router.managementEnabled === false ? 'Disabled' : router.managementProtocol ?? 'Unspecified'}{router.managementCredentialsConfigured ? ' · configured' : ''}</td>
                  <td>{formatDate(router.lastSeenAt)}</td>
                  <td>
                    <span className={`network-status ${(router.status ?? 'UNKNOWN').toLowerCase()}`}><i />{router.status ?? 'UNKNOWN'}</span>
                    {router.syncError ? <small className="network-sync-error">{router.syncError}</small> : null}
                  </td>
                  <td>{router.managementProtocol === 'MIKROTIK_REST' && /mikrotik/i.test(router.vendor ?? '')
                    ? <button type="button" className="network-button secondary network-qr-button" onClick={() => openFirmware(router)}>Firmware</button>
                    : router.managementProtocol === 'MERAKI_DASHBOARD_API' && /meraki|cisco/i.test(router.vendor ?? '')
                      ? <button type="button" className="network-button secondary network-qr-button" onClick={() => openFirmware(router)}>Firmware</button>
                      : <span className="network-firmware-unavailable">Not enabled</span>}</td>
                  <td><button type="button" className="network-button secondary network-qr-button" onClick={() => setQrRouter(router)}>QR / Print</button></td>
                </tr>
              ))}
            </tbody>
          </table>

          {!loading && routersLoaded && !filteredRouters.length ? (
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

      {firmwareRouter ? (
        <div className="network-qr-backdrop" role="dialog" aria-modal="true" aria-labelledby="network-firmware-title">
          <section className="network-firmware-card">
            <button type="button" className="network-qr-close" onClick={() => setFirmwareRouter(null)} aria-label="Close firmware dialog">×</button>
            <span className="network-qr-kicker">JASLYN NET · FIRMWARE LIFECYCLE</span>
            <h2 id="network-firmware-title">{firmwareRouter.name}</h2>
            <p>{firmwareRouter.vendor} · {firmwareRouter.model ?? 'Model not set'} · {firmwareRouter.managementProtocol === 'MERAKI_DASHBOARD_API' ? 'Meraki Dashboard-managed firmware' : 'MikroTik RouterOS'}</p>
            {firmwareError ? <div className="network-error" role="alert">{firmwareError}</div> : null}
            <div className="network-firmware-actions">
              <button type="button" className="network-button primary" onClick={() => firmwareRouter.managementProtocol === 'MERAKI_DASHBOARD_API' ? void inspectMerakiFirmware() : void inspectFirmware()} disabled={firmwareBusy}>
                {firmwareBusy ? 'Working…' : 'Inspect live firmware'}
              </button>
            </div>
            {firmwareRouter.managementProtocol === 'MERAKI_DASHBOARD_API' ? (
              merakiLive ? <div className="network-firmware-details">
                <div><span>Network ID</span><strong>{merakiLive.networkId}</strong></div>
                <div><span>Product type</span><strong>{merakiLive.productType}</strong></div>
                <div><span>Installed version</span><strong>{merakiLive.currentVersion?.firmware ?? merakiLive.currentVersion?.id ?? 'Unknown'}</strong></div>
                <div><span>Scheduled target</span><strong>{merakiLive.nextUpgrade?.toVersion?.firmware ?? merakiLive.nextUpgrade?.toVersion?.id ?? 'None'}</strong></div>
                <div><span>Scheduled time</span><strong>{merakiLive.nextUpgrade?.time ? formatDate(merakiLive.nextUpgrade.time) : 'Not scheduled'}</strong></div>
                <div><span>Compatible versions</span><strong>{merakiLive.availableVersions.length}</strong></div>
              </div> : <p className="network-firmware-note">Read current firmware and compatible versions from the official Meraki Dashboard API. This does not trigger an upgrade.</p>
            ) : firmwareLive ? (
              <div className="network-firmware-details">
                <div><span>Device model</span><strong>{firmwareLive.identity.model || firmwareLive.model || 'Unknown'}</strong></div>
                <div><span>Architecture</span><strong>{firmwareLive.identity.architecture || 'Unknown'}</strong></div>
                <div><span>Installed version</span><strong>{firmwareLive.update.installedVersion}</strong></div>
                <div><span>Official latest version</span><strong>{firmwareLive.update.latestVersion}</strong></div>
                <div><span>Channel</span><strong>{firmwareLive.update.channel}</strong></div>
                <div><span>Update status</span><strong>{firmwareLive.update.status}</strong></div>
              </div>
            ) : firmwareRouter.managementProtocol === 'MERAKI_DASHBOARD_API' ? null : <p className="network-firmware-note">Inspect the router over authenticated HTTPS to read its live model and official MikroTik update-channel version.</p>}
            {firmwareRouter.managementProtocol === 'MERAKI_DASHBOARD_API' && merakiLive ? (
              <div className="network-firmware-plan">
                <h3>Schedule Meraki network firmware</h3>
                <p>This schedules the selected product type for the configured Meraki network in Dashboard. It is not proof the devices have completed the upgrade. Other product schedules are preserved.</p>
                <label>Target version<select value={merakiTarget} onChange={(event) => setMerakiTarget(event.target.value)}><option value="">Choose a compatible version</option>{merakiLive.availableVersions.map((version) => <option key={version.id} value={version.id}>{version.shortName || version.firmware || version.id}{version.releaseType ? ' · '+version.releaseType : ''}</option>)}</select></label>
                <label>Schedule at<input type="datetime-local" value={merakiScheduledAt} onChange={(event) => setMerakiScheduledAt(event.target.value)} /></label>
                <label>Meraki network timezone<input value={merakiTimezone} readOnly aria-readonly="true" /></label><p className="network-firmware-note">Enter the time in this browser’s timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown'}); Jaslyn Net converts it to an absolute timestamp. The existing Meraki network timezone is shown for reference and preserved.</p>
                <button type="button" className="network-button primary" onClick={() => void scheduleMerakiFirmware()} disabled={firmwareBusy || !merakiTarget || !merakiScheduledAt || !merakiTimezone}>Confirm and schedule</button>
                {merakiScheduleResult ? <p role="status">Scheduled {merakiScheduleResult.targetVersion} for {formatDate(merakiScheduleResult.scheduledAt)}. Confirmed by Meraki Dashboard; completion still requires post-upgrade verification.</p> : null}
                {(merakiScheduleResult || merakiLive.nextUpgrade?.toVersion?.id) ? <button type="button" className="network-button secondary" onClick={() => void verifyMerakiFirmware()} disabled={firmwareBusy}>Verify upgrade completion</button> : null}
                {merakiVerification ? <div className="network-firmware-details" role="status">
                  <div><span>Completion status</span><strong>{merakiVerification.status}</strong></div>
                  <div><span>Target version</span><strong>{merakiVerification.targetVersion}</strong></div>
                  <div><span>Live installed version</span><strong>{merakiVerification.installedVersion ?? 'Not confirmed'}</strong></div>
                  <div><span>Checked at</span><strong>{formatDate(merakiVerification.verifiedAt)}</strong></div>
                  <p>{merakiVerification.evidence}</p>
                </div> : null}
              </div>
            ) : null}
            {firmwareRouter.managementProtocol === 'MIKROTIK_REST' && firmwareLive && firmwareLive.update.installedVersion !== firmwareLive.update.latestVersion ? (
              <div className="network-firmware-plan">
                <h3>Plan one-device upgrade</h3>
                <p>Choose a maintenance window. Jaslyn Net will export and encrypt a configuration backup before asking for approval.</p>
                <label>Maintenance starts<input type="datetime-local" value={maintenanceStart} onChange={(event) => setMaintenanceStart(event.target.value)} /></label>
                <label>Maintenance ends<input type="datetime-local" value={maintenanceEnd} onChange={(event) => setMaintenanceEnd(event.target.value)} /></label>
                <button type="button" className="network-button primary" onClick={() => void previewFirmware()} disabled={firmwareBusy || !maintenanceStart || !maintenanceEnd}>
                  {firmwareBusy ? 'Checking…' : 'Create upgrade preview'}
                </button>
              </div>
            ) : null}
            {firmwareJob ? (
              <div className="network-firmware-job">
                <div className="network-firmware-job-head"><span>Upgrade job</span><strong>{firmwareJob.status}</strong></div>
                <p>Target: {firmwareJob.targetVersion}</p>
                {firmwareJob.preview?.blockers?.length ? <p>Preflight notes: {firmwareJob.preview.blockers.join(', ')}</p> : null}
                {firmwareJob.errorMessage ? <p role="alert">{firmwareJob.errorMessage}</p> : null}
                <div className="network-firmware-actions">
                  {firmwareJob.status === 'BLOCKED' ? <button type="button" className="network-button secondary" onClick={() => void prepareFirmwareBackup()} disabled={firmwareBusy}>Create encrypted backup</button> : null}
                  {firmwareJob.status === 'AWAITING_APPROVAL' ? <button type="button" className="network-button primary" onClick={() => void approveFirmware()} disabled={firmwareBusy}>Approve & install</button> : null}
                  {['VERIFYING', 'RECOVERY_REQUIRED', 'SUCCEEDED', 'FAILED'].includes(firmwareJob.status) ? (
                    <>
                      <button type="button" className="network-button secondary" onClick={() => void refreshFirmwareJob()} disabled={firmwareBusy}>Refresh status</button>
                      {['VERIFYING', 'RECOVERY_REQUIRED'].includes(firmwareJob.status) ? <button type="button" className="network-button secondary" onClick={() => void verifyFirmwareNow()} disabled={firmwareBusy}>Verify now</button> : null}
                    </>
                  ) : null}
                </div>
                {firmwareJob.observedVersionAfter ? <p>Observed after upgrade: {firmwareJob.observedVersionAfter}</p> : null}
              </div>
            ) : null}
            <p className="network-firmware-note">Firmware updates can interrupt connectivity. MikroTik installs require an approved maintenance window and encrypted backup. Meraki scheduling changes the Dashboard network schedule; inspect the live version again after the scheduled upgrade. Other vendors remain disabled until their executors are verified.</p>
          </section>
        </div>
      ) : null}

      {qrRouter ? (
        <div className="network-qr-backdrop" role="dialog" aria-modal="true" aria-labelledby="network-qr-title">
          <section className="network-qr-card">
            <button type="button" className="network-qr-close" onClick={() => setQrRouter(null)} aria-label="Close QR dialog">×</button>
            <span className="network-qr-kicker">JASLYN NET · ASSET IDENTIFICATION</span>
            <h2 id="network-qr-title">{qrRouter.name}</h2>
            <p>{qrRouter.vendor ?? 'Unknown vendor'}{qrRouter.model ? ' · '+qrRouter.model : ''}</p>
            {qrError ? <p role="alert">{qrError}</p> : qrData ? <img className="network-qr-image" src={qrData} alt={'QR code for '+qrRouter.name} /> : <p>Generating QR code…</p>}
            <code>{qrRouter.id}</code>
            <p className="network-qr-note">Scan with Jaslyn-Net Field Operations to identify this router. The QR contains only the asset type and UUID, never credentials.</p>
            <div className="network-qr-actions">
              <button type="button" className="network-button primary" onClick={() => window.print()} disabled={!qrData}>Print QR</button>
              {qrData ? <a className="network-button secondary" href={qrData} download={'jaslyn-router-'+qrRouter.id+'.png'}>Download PNG</a> : null}
            </div>
          </section>
        </div>
      ) : null}

      <footer className="network-footer">
        <span>JASLYN NET · Network Operations</span>
        <span>Authenticated tenant inventory</span>
      </footer>
    </main>
  );
}
