'use client';

import { Fragment, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

function toLocalDateTimeInput(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function playScanChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
  } catch {
    // audio fallback
  }
}

function resolveRouter(text: string, list: Router[]): Router | null {
  const clean = text.trim();
  if (!clean) return null;

  let targetId = clean;
  if (clean.startsWith('JASLYN-NET:ROUTER:')) {
    targetId = clean.slice('JASLYN-NET:ROUTER:'.length).trim();
  } else if (clean.startsWith('ROUTER:')) {
    targetId = clean.slice('ROUTER:'.length).trim();
  } else if (clean.includes('/routers/')) {
    const parts = clean.split('/routers/');
    targetId = parts[parts.length - 1].split(/[?#/]/)[0].trim();
  } else if (clean.includes('id=')) {
    const match = clean.match(/[?&]id=([^&#]+)/);
    if (match) targetId = match[1].trim();
  }

  // Match by id (case insensitive)
  const byId = list.find((r) => r.id === targetId || r.id.toLowerCase() === targetId.toLowerCase());
  if (byId) return byId;

  // Match by MAC address
  const normTarget = clean.toLowerCase().replace(/[:-]/g, '');
  if (normTarget.length >= 8) {
    const byMac = list.find((r) => r.macAddress && r.macAddress.toLowerCase().replace(/[:-]/g, '') === normTarget);
    if (byMac) return byMac;
  }

  // Match by IP address
  const byIp = list.find((r) => r.ipAddress && r.ipAddress.trim() === clean);
  if (byIp) return byIp;

  // Match by device Name
  const byName = list.find((r) => r.name.toLowerCase() === clean.toLowerCase());
  if (byName) return byName;

  return null;
}

const MANAGEMENT_PROTOCOLS = [
  ['MIKROTIK_REST', 'MikroTik RouterOS REST'],
  ['UNIFI_NETWORK_API', 'Ubiquiti UniFi Network API'],
  ['CAMBIUM_CNMAESTRO', 'Cambium cnMaestro'],
  ['OMADA_CONTROLLER_API', 'TP-Link Omada Controller API'],
  ['OMADA_LOCAL_CONTROLLER_API', 'TP-Link Omada Local Controller'],
  ['CISCO_NETCONF_RESTCONF', 'Cisco IOS/IOS-XE NETCONF/RESTCONF'],
  ['CISCO_IOS_XE_API', 'Cisco IOS-XE API'],
  ['MERAKI_DASHBOARD_API', 'Cisco Meraki Dashboard API'],
  ['HUAWEI_NETCONF_RESTCONF', 'Huawei VRP NETCONF/RESTCONF'],
  ['HUAWEI_IMASTER_NCE_API', 'Huawei iMaster NCE API'],
  ['HUAWEI_CLOUDCAMPUS_API', 'Huawei CloudCampus API'],
  ['ARUBA_CENTRAL_API', 'Aruba Central API'],
  ['ARUBA_AOS_CX_NETCONF', 'Aruba AOS-CX NETCONF'],
  ['JUNIPER_JUNOS_NETCONF', 'Juniper Junos NETCONF'],
  ['JUNIPER_MIST_API', 'Juniper Mist API'],
  ['FORTINET_FORTIGATE_API', 'Fortinet FortiGate API'],
  ['DELL_OS10_NETCONF', 'Dell PowerSwitch OS10 NETCONF'],
  ['NETGEAR_INSIGHT_API', 'Netgear Insight API'],
  ['ZYXEL_NEBULA_API', 'Zyxel Nebula API'],
  ['PALOALTO_PANOS_API', 'Palo Alto PAN-OS API'],
  ['SONICWALL_SONICOS_API', 'SonicWall SonicOS API'],
  ['BARRACUDA_CLOUDGEN_API', 'Barracuda CloudGen API'],
  ['EXTREME_CLOUD_IQ_API', 'ExtremeCloud IQ API'],
  ['RUCKUS_SMARTZONE_API', 'Ruckus SmartZone API'],
  ['WATCHGUARD_FIREBOX_API', 'WatchGuard Firebox API'],
  ['GRANDSTREAM_GWN_API', 'Grandstream GWN API'],
  ['RUIJIE_REYEE_CLOUD_API', 'Ruijie/Reyee Cloud API'],
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

function Icon({ name }: { name: 'network' | 'plus' | 'refresh' | 'router' | 'users' | 'alert' | 'offline' | 'close' | 'search' | 'scan' | 'camera' | 'check' | 'upload' | 'link' }) {
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
    scan: <><path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" /><line x1="7" y1="12" x2="17" y2="12" /></>,
    camera: <><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></>,
    check: <polyline points="20 6 9 17 4 12" />,
    upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></>,
    link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></>,
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
  const [firmwareJob, setFirmwareJob] = useState<FirmwareJob | null>(null);
  const [firmwareBusy, setFirmwareBusy] = useState(false);
  const [firmwareError, setFirmwareError] = useState<string | null>(null);
  const [maintenanceStart, setMaintenanceStart] = useState('');
  const [maintenanceEnd, setMaintenanceEnd] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [operational, setOperational] = useState<Record<string, any>>({});

  // Scanner Overlay State
  const [showScanner, setShowScanner] = useState(false);
  const [scannerCameraActive, setScannerCameraActive] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [scannedPayload, setScannedPayload] = useState<string | null>(null);
  const [matchedRouter, setMatchedRouter] = useState<Router | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [isProcessingScan, setIsProcessingScan] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stopScannerCamera = useCallback(() => {
    if (controlsRef.current) {
      try {
        controlsRef.current.stop();
      } catch {
        // ignore
      }
      controlsRef.current = null;
    }
    if (videoRef.current && videoRef.current.srcObject) {
      try {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
        videoRef.current.srcObject = null;
      } catch {
        // ignore
      }
    }
    setScannerCameraActive(false);
  }, []);

  const handleScanPayload = useCallback((raw: string) => {
    const text = raw.trim();
    if (!text) return;
    setScannedPayload(text);
    setScannerError(null);

    const found = resolveRouter(text, routers);
    if (found) {
      playScanChime();
      setMatchedRouter(found);
      stopScannerCamera();
    } else {
      setMatchedRouter(null);
      setScannerError(`No matching device in current inventory for "${text}".`);
    }
  }, [routers, stopScannerCamera]);

  const startScannerCamera = useCallback(async () => {
    setScannerError(null);
    stopScannerCamera();
    try {
      const { BrowserQRCodeReader } = await import('@zxing/browser');
      const reader = new BrowserQRCodeReader();

      if (!videoRef.current) return;

      setScannerCameraActive(true);
      const controls = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current,
        (result) => {
          if (result) {
            handleScanPayload(result.getText());
          }
        }
      );
      controlsRef.current = controls;
    } catch (err: unknown) {
      setScannerCameraActive(false);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('NotAllowedError') || msg.includes('Permission')) {
        setScannerError('Camera access was blocked. Please grant camera permissions or upload an image.');
      } else if (msg.includes('NotFoundError') || msg.includes('DevicesNotFoundError')) {
        setScannerError('No camera found on this device. You can upload a photo of the QR code or enter the tag manually.');
      } else {
        setScannerError(`Camera error: ${msg}. You can upload an image or enter the tag manually.`);
      }
    }
  }, [handleScanPayload, stopScannerCamera]);

  const openScanner = useCallback(() => {
    setMatchedRouter(null);
    setScannedPayload(null);
    setScannerError(null);
    setManualCode('');
    setShowScanner(true);
  }, []);

  const closeScanner = useCallback(() => {
    stopScannerCamera();
    setShowScanner(false);
    setMatchedRouter(null);
    setScannedPayload(null);
    setScannerError(null);
  }, [stopScannerCamera]);

  useEffect(() => {
    if (showScanner) {
      void startScannerCamera();
    } else {
      stopScannerCamera();
    }
    return () => {
      stopScannerCamera();
    };
  }, [showScanner, startScannerCamera, stopScannerCamera]);

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScannerError(null);
    setIsProcessingScan(true);
    try {
      const { BrowserQRCodeReader } = await import('@zxing/browser');
      const reader = new BrowserQRCodeReader();
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = async () => {
        try {
          const result = await reader.decodeFromImageElement(img);
          handleScanPayload(result.getText());
        } catch {
          setScannerError('No QR code detected in the uploaded image. Ensure the code is clear and well lit.');
        } finally {
          URL.revokeObjectURL(objectUrl);
          setIsProcessingScan(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      };
      img.onerror = () => {
        setScannerError('Failed to load selected image file.');
        URL.revokeObjectURL(objectUrl);
        setIsProcessingScan(false);
      };
      img.src = objectUrl;
    } catch {
      setIsProcessingScan(false);
      setScannerError('Unable to initialize QR image decoder.');
    }
  }, [handleScanPayload]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    handleScanPayload(manualCode.trim());
  };

  const handleTestSample = (sample: Router) => {
    handleScanPayload('JASLYN-NET:ROUTER:' + sample.id);
  };

  const focusMatchedRouter = (router: Router) => {
    closeScanner();
    setQuery('');
    setExpanded(router.id);
    setTimeout(() => {
      const el = document.getElementById('router-row-' + router.id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('network-row-highlight');
        setTimeout(() => el.classList.remove('network-row-highlight'), 2400);
      }
    }, 150);
  };

  const handleRegisterUnmatched = () => {
    const tag = scannedPayload ?? '';
    closeScanner();
    setShowCreate(true);
    let target = tag;
    if (tag.startsWith('JASLYN-NET:ROUTER:')) target = tag.slice('JASLYN-NET:ROUTER:'.length);
    else if (tag.startsWith('ROUTER:')) target = tag.slice('ROUTER:'.length);

    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(target)) {
      setForm((prev) => ({ ...prev, ipAddress: target, name: 'Router ' + target }));
    } else if (/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(target)) {
      setForm((prev) => ({ ...prev, macAddress: target, name: 'Device ' + target }));
    } else {
      setForm((prev) => ({ ...prev, name: 'Asset ' + target }));
    }
  };

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

  function openFirmware(router: Router) {
    setFirmwareRouter(router);
    setFirmwareLive(null);
    setFirmwareJob(null);
    setFirmwareError(null);
    setMaintenanceStart(toLocalDateTimeInput(new Date(Date.now() + 60 * 60 * 1000)));
    setMaintenanceEnd(toLocalDateTimeInput(new Date(Date.now() + 2 * 60 * 60 * 1000)));
    void loadExistingFirmwareJob(router);
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
          <button className="network-button secondary network-scan-btn" type="button" onClick={openScanner}>
            <Icon name="scan" />
            <span>Scan hardware QR</span>
          </button>
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
            <button type="button" className="network-search-scan" onClick={openScanner} title="Scan hardware label QR" aria-label="Scan hardware QR">
              <Icon name="scan" />
            </button>
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
                <Fragment key={router.id}>
                <tr id={'router-row-' + router.id} onDoubleClick={() => setExpanded(expanded === router.id ? null : router.id)}>
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
                  <td>{router.managementProtocol === 'MIKROTIK_REST' && /mikrotik/i.test(router.vendor ?? '')
                    ? <button type="button" className="network-button secondary network-qr-button" onClick={() => openFirmware(router)}>Firmware</button>
                    : <span className="network-firmware-unavailable">Not enabled</span>}</td>
                  <td><button type="button" className="network-button secondary network-qr-button" onClick={() => setQrRouter(router)}>QR / Print</button></td>
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
                  <div className="network-device-history"><span>RECENT COMMANDS</span>{(operational[router.id]?.recentCommands ?? []).slice(0,5).map((command: any) => <small key={command.id}>{command.commandType} · {command.status}{command.error ? ' · ' + command.error : ''}</small>)}{!operational[router.id]?.recentCommands?.length && <small>No command records.</small>}</div>
                  <div className="network-device-history"><span>RECENT INCIDENTS</span>{(operational[router.id]?.recentIncidents ?? []).slice(0,5).map((incident: any) => <small key={incident.id}>{incident.severity} · {incident.title}</small>)}{!operational[router.id]?.recentIncidents?.length && <small>No linked incident records.</small>}</div>
                  <div className="network-telemetry-note">{operational[router.id]?.telemetry.source === 'NOT_REPORTED_BY_CURRENT_TELEMETRY_MODEL' ? 'CPU, memory, interfaces, bandwidth, latency, packet loss and uptime are not persisted by the current telemetry model. Jaslyn Net does not invent them.' : 'Telemetry reported by the configured source.'}</div>
                </div></td></tr>}
                </Fragment>
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
            <p>{firmwareRouter.vendor} · {firmwareRouter.model ?? 'Model not set'} · MikroTik RouterOS</p>
            {firmwareError ? <div className="network-error" role="alert">{firmwareError}</div> : null}
            <div className="network-firmware-actions">
              <button type="button" className="network-button primary" onClick={() => void inspectFirmware()} disabled={firmwareBusy}>
                {firmwareBusy ? 'Working…' : 'Inspect live firmware'}
              </button>
            </div>
            {firmwareLive ? (
              <div className="network-firmware-details">
                <div><span>Device model</span><strong>{firmwareLive.identity.model || firmwareLive.model || 'Unknown'}</strong></div>
                <div><span>Architecture</span><strong>{firmwareLive.identity.architecture || 'Unknown'}</strong></div>
                <div><span>Installed version</span><strong>{firmwareLive.update.installedVersion}</strong></div>
                <div><span>Official latest version</span><strong>{firmwareLive.update.latestVersion}</strong></div>
                <div><span>Channel</span><strong>{firmwareLive.update.channel}</strong></div>
                <div><span>Update status</span><strong>{firmwareLive.update.status}</strong></div>
              </div>
            ) : <p className="network-firmware-note">Inspect the router over authenticated HTTPS to read its live model and official MikroTik update-channel version.</p>}
            {firmwareLive && firmwareLive.update.installedVersion !== firmwareLive.update.latestVersion ? (
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
            <p className="network-firmware-note">Firmware updates can interrupt connectivity. Approve only inside the maintenance window. Other vendors remain disabled until their executors are verified.</p>
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

      {showScanner ? (
        <div className="network-qr-backdrop" role="dialog" aria-modal="true" aria-labelledby="network-scanner-title">
          <section className="network-scanner-card">
            <button type="button" className="network-qr-close" onClick={closeScanner} aria-label="Close QR scanner">×</button>
            <div className="network-scanner-head">
              <span className="network-qr-kicker">JASLYN NET · HARDWARE ASSET SCANNER</span>
              <h2 id="network-scanner-title">Scan router hardware QR</h2>
              <p>Point camera at the QR code tag on the router chassis or rack faceplate to immediately identify and inspect device status.</p>
            </div>

            <div className="network-scanner-viewport">
              <video ref={videoRef} className="network-scanner-video" playsInline muted autoPlay />
              {scannerCameraActive ? (
                <div className="network-scanner-reticle">
                  <div className="network-scanner-laser" />
                  <span className="network-scanner-tip">Align QR code inside frame</span>
                </div>
              ) : (
                <div className="network-scanner-fallback">
                  <Icon name="camera" />
                  <strong>Camera standby</strong>
                  <span>{scannerError || 'Camera is paused or unavailable. You can upload a photo or use manual lookup below.'}</span>
                  <button type="button" className="network-button secondary" onClick={() => void startScannerCamera()}>
                    <Icon name="refresh" />
                    <span>Try camera again</span>
                  </button>
                </div>
              )}
            </div>

            <div className="network-scanner-actions-bar">
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {scannerCameraActive ? (
                  <button type="button" className="network-button secondary" onClick={stopScannerCamera}>
                    <span>Pause camera</span>
                  </button>
                ) : (
                  <button type="button" className="network-button primary" onClick={() => void startScannerCamera()}>
                    <Icon name="camera" />
                    <span>Start camera</span>
                  </button>
                )}
                <label className="network-scanner-file-btn">
                  <Icon name="upload" />
                  <span>{isProcessingScan ? 'Decoding…' : 'Upload QR photo'}</span>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} disabled={isProcessingScan} />
                </label>
              </div>
              {matchedRouter ? (
                <button type="button" className="network-button secondary" onClick={() => { setMatchedRouter(null); setScannedPayload(null); void startScannerCamera(); }}>
                  <span>Scan another</span>
                </button>
              ) : null}
            </div>

            {matchedRouter ? (
              <div className="network-matched-card">
                <div className="network-matched-head">
                  <div>
                    <span className="network-qr-kicker">MATCHED FLEET ASSET</span>
                    <strong>{matchedRouter.name}</strong>
                    <small>{matchedRouter.vendor ?? 'Unknown vendor'}{matchedRouter.model ? ` · ${matchedRouter.model}` : ''}</small>
                  </div>
                  <span className={`network-status ${(matchedRouter.status ?? 'UNKNOWN').toLowerCase()}`}>
                    <i />{matchedRouter.status ?? 'UNKNOWN'}
                  </span>
                </div>

                <div className="network-matched-meta">
                  <div><span>DEVICE ID</span><b>{matchedRouter.id}</b></div>
                  <div><span>MANAGEMENT</span><b>{matchedRouter.managementProtocol ?? 'Unspecified'}</b></div>
                  <div><span>IP ADDRESS</span><b>{matchedRouter.ipAddress || '—'}</b></div>
                  <div><span>MAC ADDRESS</span><b>{matchedRouter.macAddress || '—'}</b></div>
                  <div><span>CONNECTED USERS</span><b>{matchedRouter.activeUsers ?? 0} active</b></div>
                  <div><span>LAST SEEN</span><b>{formatDate(matchedRouter.lastSeenAt)}</b></div>
                </div>

                <div className="network-matched-actions">
                  <button type="button" className="network-button primary" onClick={() => focusMatchedRouter(matchedRouter)}>
                    <Icon name="router" />
                    <span>Inspect in Fleet Table</span>
                  </button>
                  {matchedRouter.managementProtocol === 'MIKROTIK_REST' && /mikrotik/i.test(matchedRouter.vendor ?? '') ? (
                    <button type="button" className="network-button secondary" onClick={() => { closeScanner(); openFirmware(matchedRouter); }}>
                      <span>Inspect Firmware</span>
                    </button>
                  ) : null}
                  <button type="button" className="network-button secondary" onClick={() => { closeScanner(); setQrRouter(matchedRouter); }}>
                    <span>Print QR label</span>
                  </button>
                </div>
              </div>
            ) : null}

            {!matchedRouter && scannedPayload ? (
              <div className="network-unmatched-card" role="alert">
                <strong>Device Not Found in Current Fleet</strong>
                <span>Scanned tag payload:</span>
                <code>{scannedPayload}</code>
                <p style={{ margin: '8px 0', fontSize: '11px', color: '#92400e' }}>
                  This asset tag is not associated with any registered router or gateway in this tenant account.
                </p>
                <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
                  <button type="button" className="network-button primary" onClick={handleRegisterUnmatched}>
                    <Icon name="plus" />
                    <span>Register device with this tag</span>
                  </button>
                  <button type="button" className="network-button secondary" onClick={() => { setScannedPayload(null); setScannerError(null); void startScannerCamera(); }}>
                    <span>Clear</span>
                  </button>
                </div>
              </div>
            ) : null}

            {routers.length > 0 ? (
              <div className="network-scanner-samples">
                <div className="network-scanner-samples-head">
                  <span>QUICK TEST FLEET DEVICES</span>
                  <span>{routers.length} registered</span>
                </div>
                <div className="network-scanner-chips">
                  {routers.slice(0, 5).map((r) => (
                    <button key={r.id} type="button" className="network-sample-chip" onClick={() => handleTestSample(r)}>
                      {r.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <form onSubmit={handleManualSubmit} style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <input
                type="text"
                placeholder="Or paste asset tag, UUID, IP, or MAC…"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                style={{ flex: 1, padding: '8px 12px', fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '8px', background: '#f8fafc', color: '#17273d' }}
              />
              <button type="submit" className="network-button secondary" disabled={!manualCode.trim()}>
                <span>Lookup</span>
              </button>
            </form>
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
