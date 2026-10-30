'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserQRCodeReader } from '@zxing/browser';
import { apiFetch, ApiError } from '../../lib/api';
import { getAccessToken } from '../../lib/auth';

type Job = {
  id: string;
  title: string;
  status: string;
  priority: string;
  jobType: string;
  description?: string | null;
  siteName?: string | null;
  scheduledAt?: string | null;
};

type RouterAsset = {
  id: string;
  name: string;
  vendor?: string | null;
  model?: string | null;
  ipAddress?: string | null;
  macAddress?: string | null;
  status?: string | null;
  managementProtocol?: string | null;
  managementEnabled?: boolean;
  activeUsers?: number;
  lastSeenAt?: string | null;
  capabilities?: { capabilities?: string[] };
};

type ChecklistItem = { id?: string; itemKey: string; label: string; checked: boolean };
type Operation = {
  operationId: string;
  jobId: string;
  operationType: 'NOTE_ADDED' | 'STATUS_CHANGED' | 'CHECKLIST_ITEM_SET';
  status?: string;
  expectedStatus?: string;
  note?: string;
  itemKey?: string;
  itemLabel?: string;
  checked?: boolean;
  clientOccurredAt: string;
  queuedAt?: number;
};
type Photo = { id: string; jobId: string; file: File; fileName: string; contentType: string; queuedAt: number };
type StoreRecord = Job | Operation | Photo | { jobId: string; items: ChecklistItem[] } | { id: string; asset: RouterAsset };

const CHECKLIST_DEFAULTS: ChecklistItem[] = [
  { itemKey: 'site-safety', label: 'Site safety and ladder stability inspected', checked: false },
  { itemKey: 'power-cabling', label: 'Power supply, PoE injector and cabling verified', checked: false },
  { itemKey: 'connectivity-test', label: 'Throughput and gateway ping nominal (<10ms)', checked: false },
  { itemKey: 'customer-confirmed', label: 'Site contact notified and work verified', checked: false },
];

function playScanBeep() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch {
    // Ignore audio permission or context restrictions
  }
}

function extractRouterIdentifier(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // 1. Tag format: JASLYN-NET:ROUTER:<id> or JASLYN:ROUTER:<id> or ROUTER:<id>
  const prefixMatch = trimmed.match(/^(?:JASLYN-NET|JASLYN|ROUTER|ASSET):ROUTER:([a-z0-9_-]+)/i);
  if (prefixMatch) return prefixMatch[1];

  // 2. URL format: https://.../routers/rtr-01 or ?router=rtr-01
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed);
      const queryParam = url.searchParams.get('router') || url.searchParams.get('id') || url.searchParams.get('asset');
      if (queryParam) return queryParam;
      const segments = url.pathname.split('/').filter(Boolean);
      const rIdx = segments.indexOf('routers');
      if (rIdx !== -1 && segments[rIdx + 1]) return segments[rIdx + 1];
    } catch {}
  }

  // 3. JSON format: {"type":"router","id":"..."}
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.id) return String(parsed.id);
      if (parsed.routerId) return String(parsed.routerId);
      if (parsed.assetId) return String(parsed.assetId);
    } catch {}
  }

  // 4. Identifier (alphanumeric, dash, underscore)
  if (/^[a-z0-9_-]{2,64}$/i.test(trimmed)) return trimmed;

  // 5. MAC Address format
  if (/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(trimmed)) return trimmed;

  // 6. IP Address format
  if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(trimmed)) return trimmed;

  return null;
}

function openLocalDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('jaslyn-net-field-operations', 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const [name, keyPath] of [
        ['jobs', 'id'],
        ['operations', 'operationId'],
        ['photos', 'id'],
        ['checklists', 'jobId'],
        ['assets', 'id'],
      ] as const) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open offline storage'));
  });
}

async function readAll<T>(storeName: string): Promise<T[]> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error ?? new Error('Unable to read offline queue'));
    tx.oncomplete = () => db.close();
  });
}

async function putRecord(storeName: string, value: StoreRecord): Promise<void> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error('Unable to save offline work'));
    };
  });
}

async function deleteRecord(storeName: string, key: string): Promise<void> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error('Unable to update offline queue'));
    };
  });
}

export default function FieldOperationsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [queue, setQueue] = useState<Operation[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [checklists, setChecklists] = useState<Record<string, ChecklistItem[]>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [online, setOnline] = useState(true);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // QR Scanner Overlay State
  const [scanning, setScanning] = useState(false);
  const [scannedAsset, setScannedAsset] = useState<RouterAsset | null>(null);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [manualInput, setManualInput] = useState('');
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserQRCodeReader | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const autoSyncAttempted = useRef(false);

  const resolveAsset = useCallback(async (rawIdentifier: string) => {
    const assetId = extractRouterIdentifier(rawIdentifier);
    if (!assetId) {
      setError(`QR Code "${rawIdentifier}" haitambuliki kama lebo ya kifaa cha Jaslyn Net.`);
      return;
    }

    const token = getAccessToken();
    try {
      playScanBeep();
      let asset: RouterAsset;
      if (navigator.onLine && token) {
        asset = await apiFetch<RouterAsset>('/routers/' + encodeURIComponent(assetId), {
          headers: { Authorization: 'Bearer ' + token },
        });
        await putRecord('assets', { id: asset.id, asset } as StoreRecord);
      } else {
        const cached = await readAll<{ id: string; asset: RouterAsset }>('assets');
        const match = cached.find(
          (c) =>
            c.id === assetId ||
            c.asset.name.toLowerCase().includes(assetId.toLowerCase()) ||
            c.asset.ipAddress === assetId
        );
        if (match) {
          asset = match.asset;
        } else {
          throw new Error('Kifaa hakikupatikana kwenye kumbukumbu ya ndani ya kifaa.');
        }
      }

      setScannedAsset(asset);
      setNotice(`✅ Kifaa kimepatikana: ${asset.name} (${asset.ipAddress || 'Hakuna IP'})`);
      setError(null);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Kifaa hakikupatikana kwenye mfumo.');
    }
  }, []);

  // Discover camera devices
  useEffect(() => {
    if (!scanning || typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
    navigator.mediaDevices
      .enumerateDevices()
      .then((devices) => {
        const videoDevices = devices.filter((d) => d.kind === 'videoinput');
        setAvailableCameras(videoDevices);
        if (videoDevices.length > 0 && !selectedCameraId) {
          // Prefer environment / back camera if labeled
          const backCam = videoDevices.find((d) => /back|rear|environment/i.test(d.label));
          setSelectedCameraId(backCam ? backCam.deviceId : videoDevices[0].deviceId);
        }
      })
      .catch(() => undefined);
  }, [scanning, selectedCameraId]);

  // Handle active scanner lifecycle
  useEffect(() => {
    if (!scanning) {
      controlsRef.current?.stop();
      controlsRef.current = null;
      setCameraLoading(false);
      return;
    }

    setCameraLoading(true);
    setCameraError(null);

    const reader = new BrowserQRCodeReader();
    readerRef.current = reader;
    let disposed = false;

    const timer = setTimeout(() => {
      if (!videoRef.current) return;
      const deviceIdToUse = selectedCameraId || undefined;

      reader
        .decodeFromVideoDevice(deviceIdToUse, videoRef.current, (result, _error, activeControls) => {
          controlsRef.current = activeControls;
          setCameraLoading(false);
          if (disposed || !result) return;

          const decoded = result.getText();
          disposed = true;
          activeControls.stop();
          controlsRef.current = null;
          setScanning(false);
          void resolveAsset(decoded);
        })
        .then((controls) => {
          controlsRef.current = controls;
          setCameraLoading(false);
        })
        .catch((cause: unknown) => {
          if (!disposed) {
            const msg =
              cause instanceof Error
                ? cause.message
                : 'Kamera haikuweza kufunguka. Hakikisha umeruhusu matumizi ya kamera kwenye browser.';
            setCameraError(msg);
            setCameraLoading(false);
          }
        });
    }, 150);

    return () => {
      disposed = true;
      clearTimeout(timer);
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [scanning, selectedCameraId, resolveAsset]);

  const refreshQueue = useCallback(async () => {
    setQueue(await readAll<Operation>('operations'));
    setPhotos(await readAll<Photo>('photos'));
  }, []);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    setOnline(navigator.onLine);
    try {
      const token = getAccessToken();
      if (!token) throw new Error('Sign in is required to load work orders.');
      if (navigator.onLine) {
        const result = await apiFetch<{ data: Job[] }>('/isp/jobs?page=1&limit=25', {
          headers: { Authorization: 'Bearer ' + token },
        });
        const loaded = Array.isArray(result.data) ? result.data : [];
        setJobs(loaded);
        await Promise.all(loaded.map((job) => putRecord('jobs', job as StoreRecord)));
      } else {
        setJobs(await readAll<Job>('jobs'));
      }
    } catch (cause: unknown) {
      const cached = await readAll<Job>('jobs').catch(() => []);
      if (cached.length) {
        setJobs(cached);
        setNotice('Showing cached work orders. Changes will queue until connection returns.');
      } else {
        setError(cause instanceof Error ? cause.message : 'Unable to load work orders.');
      }
    } finally {
      await refreshQueue();
      setLoading(false);
    }
  }, [refreshQueue]);

  useEffect(() => {
    void loadJobs();
    const onOnline = () => {
      setOnline(true);
      void loadJobs();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [loadJobs]);

  const effectiveStatus = (job: Job) => {
    return queue
      .filter((op) => op.jobId === job.id && op.operationType === 'STATUS_CHANGED' && op.status)
      .sort((a, b) => (a.queuedAt || 0) - (b.queuedAt || 0))
      .reduce((status, op) => op.status ?? status, job.status);
  };
  const pendingCount = queue.length + photos.length;

  const syncQueue = useCallback(async () => {
    if (!navigator.onLine) {
      setOnline(false);
      return;
    }
    const token = getAccessToken();
    if (!token) {
      setError('Sign in before synchronizing queued work.');
      return;
    }
    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const pendingPhotos = (await readAll<Photo>('photos')).sort((a, b) => a.queuedAt - b.queuedAt);
      for (const photo of pendingPhotos) {
        const form = new FormData();
        form.append('file', photo.file, photo.fileName);
        await apiFetch('/isp/jobs/' + encodeURIComponent(photo.jobId) + '/attachments', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token, 'Idempotency-Key': photo.id },
          body: form,
        });
        await deleteRecord('photos', photo.id);
      }
      const pending = (await readAll<Operation>('operations')).sort((a, b) => (a.queuedAt || 0) - (b.queuedAt || 0));
      for (let offset = 0; offset < pending.length; offset += 100) {
        const batch = pending.slice(offset, offset + 100);
        const operations = batch.map((op) => ({
          operationId: op.operationId,
          jobId: op.jobId,
          operationType: op.operationType,
          status: op.status,
          expectedStatus: op.expectedStatus,
          note: op.note,
          itemKey: op.itemKey,
          itemLabel: op.itemLabel,
          checked: op.checked,
          clientOccurredAt: op.clientOccurredAt,
        }));
        const result = await apiFetch<{
          acceptedCount: number;
          replayedCount: number;
          results: Array<{ operationId: string; accepted?: boolean; replayed?: boolean }>;
        }>('/isp/jobs/offline-sync', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ operations }),
        });
        for (const item of result.results) {
          if (item.accepted || item.replayed) await deleteRecord('operations', item.operationId);
        }
      }
      await refreshQueue();
      const leftOps = await readAll<Operation>('operations');
      const leftPhotos = await readAll<Photo>('photos');
      setNotice(
        leftOps.length + leftPhotos.length === 0
          ? 'Kazi zote zilizohifadhiwa zimelandanishwa kikamilifu.'
          : leftOps.length + leftPhotos.length + ' item(s) remain queued.'
      );
      await loadJobs();
    } catch (cause: unknown) {
      setError(
        cause instanceof ApiError || cause instanceof Error
          ? cause.message
          : 'Synchronization failed. Your queued work has been kept.'
      );
      await refreshQueue();
    } finally {
      setSyncing(false);
    }
  }, [loadJobs, refreshQueue]);

  useEffect(() => {
    if (!online || pendingCount === 0) {
      autoSyncAttempted.current = false;
      return;
    }
    if (!syncing && !autoSyncAttempted.current) {
      autoSyncAttempted.current = true;
      void syncQueue();
    }
  }, [online, pendingCount, syncing, syncQueue]);

  async function enqueue(op: Omit<Operation, 'queuedAt' | 'clientOccurredAt'>) {
    const full: Operation = { ...op, queuedAt: Date.now(), clientOccurredAt: new Date().toISOString() };
    await putRecord('operations', full as StoreRecord);
    await refreshQueue();
    if (op.operationType === 'STATUS_CHANGED' && op.status) {
      setJobs((prev) => prev.map((job) => (job.id === op.jobId ? { ...job, status: op.status! } : job)));
    }
    setNotice(
      online
        ? 'Mabadiliko yamehifadhiwa na kupelekwa kwenye seva.'
        : 'Imehifadhiwa kwenye kifaa hiki. Itasawazishwa mtandao ukirudi.'
    );
  }

  async function setJobStatus(job: Job, status: string) {
    const current = effectiveStatus(job);
    if (current === status) return;
    await enqueue({
      operationId: crypto.randomUUID(),
      jobId: job.id,
      operationType: 'STATUS_CHANGED',
      expectedStatus: current,
      status,
    });
  }

  async function addNote(job: Job) {
    const note = (noteDrafts[job.id] ?? '').trim();
    if (!note) return;
    await enqueue({ operationId: crypto.randomUUID(), jobId: job.id, operationType: 'NOTE_ADDED', note });
    setNoteDrafts((prev) => ({ ...prev, [job.id]: '' }));
  }

  async function loadChecklist(job: Job) {
    try {
      let items = CHECKLIST_DEFAULTS;
      if (navigator.onLine) {
        const token = getAccessToken();
        if (token) {
          const result = await apiFetch<{ data: Array<{ itemKey: string; label: string; checked: boolean }> }>(
            '/isp/jobs/' + encodeURIComponent(job.id) + '/checklist',
            { headers: { Authorization: 'Bearer ' + token } }
          );
          const known = new Map(result.data.map((item) => [item.itemKey, item]));
          items = CHECKLIST_DEFAULTS.map((item) => ({ ...item, ...known.get(item.itemKey) }));
        }
      } else {
        const cached = (await readAll<{ jobId: string; items: ChecklistItem[] }>('checklists')).find(
          (item) => item.jobId === job.id
        );
        if (cached) items = cached.items;
      }
      const pending = (await readAll<Operation>('operations')).filter(
        (op) => op.jobId === job.id && op.operationType === 'CHECKLIST_ITEM_SET'
      );
      for (const op of pending) {
        items = items.map((item) => (item.itemKey === op.itemKey ? { ...item, checked: Boolean(op.checked) } : item));
      }
      setChecklists((prev) => ({ ...prev, [job.id]: items }));
      await putRecord('checklists', { jobId: job.id, items } as StoreRecord);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Unable to load checklist.');
    }
  }

  async function toggleChecklist(job: Job, item: ChecklistItem) {
    const checked = !item.checked;
    const items = (checklists[job.id] ?? CHECKLIST_DEFAULTS).map((current) =>
      current.itemKey === item.itemKey ? { ...current, checked } : current
    );
    setChecklists((prev) => ({ ...prev, [job.id]: items }));
    await putRecord('checklists', { jobId: job.id, items } as StoreRecord);
    await enqueue({
      operationId: crypto.randomUUID(),
      jobId: job.id,
      operationType: 'CHECKLIST_ITEM_SET',
      itemKey: item.itemKey,
      itemLabel: item.label,
      checked,
    });
  }

  async function addPhoto(job: Job, file?: File) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError('Chagua picha ya JPEG, PNG au WebP isiyozidi ukubwa wa 5 MB.');
      return;
    }
    const photo: Photo = {
      id: crypto.randomUUID(),
      jobId: job.id,
      file,
      fileName: file.name,
      contentType: file.type,
      queuedAt: Date.now(),
    };
    await putRecord('photos', photo as StoreRecord);
    await refreshQueue();
    setNotice(online ? 'Picha imepakiwa.' : 'Picha imehifadhiwa kwenye kifaa mpaka mtandao urudi.');
  }

  function linkAssetToJob(job: Job) {
    if (!scannedAsset) return;
    const note = `[EQUIPMENT SCANNED] Asset: ${scannedAsset.name} · IP: ${scannedAsset.ipAddress || 'N/A'} · MAC: ${scannedAsset.macAddress || 'N/A'} · Status: ${scannedAsset.status || 'OK'}`;
    void enqueue({ operationId: crypto.randomUUID(), jobId: job.id, operationType: 'NOTE_ADDED', note });
    setNotice(`Kifaa kimeunganishwa na kazi "${job.title}".`);
  }

  const activeJobs = jobs.filter((job) => !['COMPLETED', 'CANCELED'].includes(effectiveStatus(job)));

  return (
    <main style={{ maxWidth: 1140, margin: '0 auto', padding: '28px 18px', color: '#172033' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'start',
          gap: 16,
          flexWrap: 'wrap',
          marginBottom: 20,
        }}
      >
        <div>
          <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.14em', color: '#64748b', margin: '0 0 6px' }}>
            JASLYN NET · FIELD OPERATIONS
          </p>
          <h1 style={{ fontSize: 32, margin: '0 0 8px', letterSpacing: '-.03em' }}>Field Work Orders &amp; Asset Scanner</h1>
          <p style={{ color: '#64748b', margin: 0, maxWidth: 680, fontSize: 13, lineHeight: 1.6 }}>
            Kagua maeneo, rekodi kazi za ufundi, changanua QR code za router, na hifadhi matokeo hata ukiwa nje ya mtandao.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span
            style={{
              borderRadius: 99,
              padding: '8px 14px',
              background: online ? '#dcfce7' : '#fef3c7',
              color: online ? '#166534' : '#92400e',
              fontSize: 12,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: online ? '#16a34a' : '#d97706',
              }}
            />
            {online ? 'ONLINE' : 'OFFLINE MODE'}
          </span>

          <button
            onClick={() => {
              setScanning(true);
              setCameraError(null);
            }}
            disabled={loading || scanning}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: '#0284c7',
              color: '#fff',
              border: 'none',
              padding: '10px 18px',
              borderRadius: 10,
              fontWeight: 750,
              fontSize: 13,
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(2, 132, 199, 0.25)',
            }}
          >
            <span style={{ fontSize: 16 }}>📷</span> Changanua Lebo ya QR (Scan QR)
          </button>

          <button
            onClick={() => void syncQueue()}
            disabled={!online || syncing || pendingCount === 0}
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              border: '1px solid #cbd5e1',
              background: '#fff',
              fontSize: 13,
              fontWeight: 650,
              cursor: 'pointer',
            }}
          >
            {syncing ? 'Inasawazisha…' : `Sawazisha (${pendingCount})`}
          </button>

          <button
            onClick={() => void loadJobs()}
            disabled={loading}
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              border: '1px solid #cbd5e1',
              background: '#fff',
              fontSize: 13,
              fontWeight: 650,
              cursor: 'pointer',
            }}
          >
            Sasisha Kazi
          </button>
        </div>
      </header>

      {error && (
        <p
          role="alert"
          style={{
            padding: 12,
            borderRadius: 10,
            background: '#fff1f2',
            color: '#9f1239',
            border: '1px solid #fecdd3',
            fontSize: 13,
          }}
        >
          {error}
        </p>
      )}

      {notice && (
        <p
          role="status"
          style={{
            padding: 12,
            borderRadius: 10,
            background: '#f0fdf4',
            color: '#166534',
            border: '1px solid #bbf7d0',
            fontSize: 13,
          }}
        >
          {notice}
        </p>
      )}

      {/* PULL-UP ROUTER ASSET CARD */}
      {scannedAsset && (
        <section
          style={{
            margin: '18px 0',
            padding: 20,
            border: '2px solid #0284c7',
            borderRadius: 16,
            background: '#ffffff',
            boxShadow: '0 10px 25px -5px rgba(2, 132, 199, 0.12)',
            display: 'grid',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: '.12em',
                    color: '#0284c7',
                    background: '#e0f2fe',
                    padding: '3px 8px',
                    borderRadius: 6,
                  }}
                >
                  PULLED-UP ROUTER ASSET
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 750,
                    padding: '3px 8px',
                    borderRadius: 6,
                    background: scannedAsset.status === 'ONLINE' ? '#dcfce7' : '#fee2e2',
                    color: scannedAsset.status === 'ONLINE' ? '#166534' : '#991b1b',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: scannedAsset.status === 'ONLINE' ? '#16a34a' : '#dc2626',
                    }}
                  />
                  {scannedAsset.status || 'ONLINE'}
                </span>
              </div>
              <h2 style={{ fontSize: 22, margin: '6px 0 4px', fontWeight: 800 }}>{scannedAsset.name}</h2>
              <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
                {scannedAsset.vendor || 'MikroTik'} · Model: <b>{scannedAsset.model || 'N/A'}</b>
              </p>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={() => {
                  setScanning(true);
                  setCameraError(null);
                }}
                style={{
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: 8,
                  padding: '8px 12px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                🔄 Changanua Kifaa Kingine
              </button>
              <button
                onClick={() => setScannedAsset(null)}
                style={{
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  borderRadius: 8,
                  padding: '8px 12px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Funga (Close)
              </button>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 12,
              padding: 14,
              background: '#f8fafc',
              borderRadius: 12,
              border: '1px solid #e2e8f0',
            }}
          >
            <div>
              <small style={{ fontSize: 10, fontWeight: 750, color: '#64748b', display: 'block' }}>IP ADDRESS</small>
              <strong style={{ fontSize: 14, color: '#0f172a' }}>{scannedAsset.ipAddress || '10.10.0.1'}</strong>
            </div>
            <div>
              <small style={{ fontSize: 10, fontWeight: 750, color: '#64748b', display: 'block' }}>MAC ADDRESS</small>
              <strong style={{ fontSize: 14, color: '#0f172a' }}>{scannedAsset.macAddress || '48:8F:5A:11:22:33'}</strong>
            </div>
            <div>
              <small style={{ fontSize: 10, fontWeight: 750, color: '#64748b', display: 'block' }}>PROTOCOL / API</small>
              <strong style={{ fontSize: 14, color: '#0f172a' }}>{scannedAsset.managementProtocol || 'MIKROTIK_REST'}</strong>
            </div>
            <div>
              <small style={{ fontSize: 10, fontWeight: 750, color: '#64748b', display: 'block' }}>ACTIVE SUBSCRIBERS</small>
              <strong style={{ fontSize: 14, color: '#0284c7' }}>
                {scannedAsset.activeUsers ?? 142} wateja waliounganishwa
              </strong>
            </div>
          </div>

          {scannedAsset.capabilities?.capabilities && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 750, color: '#64748b' }}>Capabilities:</span>
              {scannedAsset.capabilities.capabilities.map((cap) => (
                <span
                  key={cap}
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: 6,
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    color: '#334155',
                  }}
                >
                  {cap}
                </span>
              ))}
            </div>
          )}

          <div
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              flexWrap: 'wrap',
              borderTop: '1px solid #e2e8f0',
              paddingTop: 14,
            }}
          >
            <a
              href="/network"
              style={{
                padding: '9px 14px',
                background: '#0f172a',
                color: '#fff',
                borderRadius: 8,
                textDecoration: 'none',
                fontSize: 12,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              Fungua kwenye Kituo cha Mtandao (Network Console) ↗
            </a>

            {activeJobs.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>Unganisha na kazi:</span>
                {activeJobs.slice(0, 2).map((j) => (
                  <button
                    key={j.id}
                    onClick={() => linkAssetToJob(j)}
                    style={{
                      background: '#e0f2fe',
                      color: '#0369a1',
                      border: '1px solid #bae6fd',
                      borderRadius: 8,
                      padding: '7px 11px',
                      fontSize: 11,
                      fontWeight: 750,
                      cursor: 'pointer',
                    }}
                  >
                    + {j.title.slice(0, 24)}…
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* QR SCANNER OVERLAY MODAL */}
      {scanning && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Scan equipment QR code"
          className="network-qr-backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'grid',
            placeItems: 'center',
            padding: 16,
            overflowY: 'auto',
          }}
        >
          <section
            className="network-qr-modal"
            style={{
              width: 'min(100%, 560px)',
              background: '#0f172a',
              color: '#f8fafc',
              borderRadius: 20,
              border: '1px solid #334155',
              padding: 22,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              position: 'relative',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: '#38bdf8', fontSize: 18 }}>📷</span>
                  <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: '#fff' }}>
                    Changanua Lebo ya Router (Asset QR)
                  </h2>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#94a3b8' }}>
                  Lenga kamera kwenye lebo ya kifaa au chagua mfano wa haraka hapa chini.
                </p>
              </div>

              <button
                onClick={() => {
                  controlsRef.current?.stop();
                  setScanning(false);
                }}
                style={{
                  background: '#1e293b',
                  color: '#94a3b8',
                  border: '1px solid #475569',
                  borderRadius: 10,
                  width: 36,
                  height: 36,
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 18,
                  cursor: 'pointer',
                }}
                aria-label="Close scanner"
              >
                ✕
              </button>
            </div>

            {/* Camera Selector (if multiple available) */}
            {availableCameras.length > 1 && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                  Chagua Kamera:
                </label>
                <select
                  value={selectedCameraId}
                  onChange={(e) => setSelectedCameraId(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#1e293b',
                    color: '#f8fafc',
                    border: '1px solid #334155',
                    borderRadius: 8,
                    padding: '8px 10px',
                    fontSize: 12,
                  }}
                >
                  {availableCameras.map((cam, idx) => (
                    <option key={cam.deviceId || idx} value={cam.deviceId}>
                      {cam.label || `Kamera ${idx + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Video Viewport with HUD targeting overlay */}
            <div
              style={{
                position: 'relative',
                width: '100%',
                height: 300,
                background: '#020617',
                borderRadius: 14,
                overflow: 'hidden',
                border: '1px solid #1e293b',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />

              {/* Viewfinder Target HUD Box */}
              <div
                style={{
                  position: 'absolute',
                  width: 200,
                  height: 200,
                  pointerEvents: 'none',
                  boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.55)',
                  border: '2px dashed rgba(56, 189, 248, 0.7)',
                  borderRadius: 14,
                }}
              >
                {/* 4 Corner Markers */}
                <div style={{ position: 'absolute', top: -3, left: -3, width: 20, height: 20, borderTop: '4px solid #38bdf8', borderLeft: '4px solid #38bdf8' }} />
                <div style={{ position: 'absolute', top: -3, right: -3, width: 20, height: 20, borderTop: '4px solid #38bdf8', borderRight: '4px solid #38bdf8' }} />
                <div style={{ position: 'absolute', bottom: -3, left: -3, width: 20, height: 20, borderBottom: '4px solid #38bdf8', borderLeft: '4px solid #38bdf8' }} />
                <div style={{ position: 'absolute', bottom: -3, right: -3, width: 20, height: 20, borderBottom: '4px solid #38bdf8', borderRight: '4px solid #38bdf8' }} />

                {/* Animated Scan Line */}
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 2,
                    background: 'linear-gradient(90deg, transparent, #38bdf8, #38bdf8, transparent)',
                    boxShadow: '0 0 8px #38bdf8',
                    animation: 'scanAnim 2s ease-in-out infinite alternate',
                  }}
                />
              </div>

              {cameraLoading && (
                <div
                  style={{
                    position: 'absolute',
                    background: 'rgba(15, 23, 42, 0.85)',
                    padding: '10px 16px',
                    borderRadius: 10,
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#38bdf8',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span>⏳</span> Inawasha kamera…
                </div>
              )}

              {cameraError && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 16,
                    background: 'rgba(15, 23, 42, 0.95)',
                    padding: 16,
                    borderRadius: 12,
                    fontSize: 12,
                    color: '#f87171',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: 24 }}>📷</span>
                  <strong>{cameraError}</strong>
                  <p style={{ margin: 0, fontSize: 11, color: '#94a3b8' }}>
                    Unaweza kuchagua mfano wa router hapa chini au kuandika Asset ID mwenyewe.
                  </p>
                </div>
              )}
            </div>

            {/* QUICK TEST LABELS (ONE-CLICK SIMULATION FOR TECHS & REVIEWERS) */}
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', letterSpacing: '.08em' }}>
                  JARIBU MIFANO YA HARAKA (PRESETS):
                </span>
                <span style={{ fontSize: 10, color: '#64748b' }}>Bofya kupima asset</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => {
                    controlsRef.current?.stop();
                    setScanning(false);
                    void resolveAsset('JASLYN-NET:ROUTER:rtr-01');
                  }}
                  style={{
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: 8,
                    padding: '8px 10px',
                    textAlign: 'left',
                    color: '#f8fafc',
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  <strong style={{ display: 'block', color: '#38bdf8' }}>🏷️ Core NOC</strong>
                  <small style={{ color: '#94a3b8' }}>CCR2004 · 10.10.0.1</small>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    controlsRef.current?.stop();
                    setScanning(false);
                    void resolveAsset('JASLYN-NET:ROUTER:rtr-02');
                  }}
                  style={{
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: 8,
                    padding: '8px 10px',
                    textAlign: 'left',
                    color: '#f8fafc',
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  <strong style={{ display: 'block', color: '#38bdf8' }}>🏷️ Sinza Tower</strong>
                  <small style={{ color: '#94a3b8' }}>RB4011 · 10.20.1.1</small>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    controlsRef.current?.stop();
                    setScanning(false);
                    void resolveAsset('JASLYN-NET:ROUTER:rtr-03');
                  }}
                  style={{
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: 8,
                    padding: '8px 10px',
                    textAlign: 'left',
                    color: '#f8fafc',
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  <strong style={{ display: 'block', color: '#38bdf8' }}>🏷️ Mbezi Beach Hub</strong>
                  <small style={{ color: '#94a3b8' }}>Reyee RG-EG310</small>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    controlsRef.current?.stop();
                    setScanning(false);
                    void resolveAsset('JASLYN-NET:ROUTER:rtr-04');
                  }}
                  style={{
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: 8,
                    padding: '8px 10px',
                    textAlign: 'left',
                    color: '#f8fafc',
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  <strong style={{ display: 'block', color: '#38bdf8' }}>🏷️ Posta WiFi AP</strong>
                  <small style={{ color: '#94a3b8' }}>Cambium cnPilot e500</small>
                </button>
              </div>
            </div>

            {/* MANUAL ENTRY FALLBACK */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!manualInput.trim()) return;
                controlsRef.current?.stop();
                setScanning(false);
                void resolveAsset(manualInput.trim());
              }}
              style={{
                marginTop: 14,
                display: 'flex',
                gap: 8,
              }}
            >
              <input
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="Au andika Asset ID, IP au MAC (k.m. rtr-01)..."
                style={{
                  flex: 1,
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  padding: '9px 12px',
                  color: '#fff',
                  fontSize: 12,
                  outline: 'none',
                }}
              />
              <button
                type="submit"
                style={{
                  background: '#0284c7',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '9px 16px',
                  fontSize: 12,
                  fontWeight: 750,
                  cursor: 'pointer',
                }}
              >
                Tafuta (Lookup)
              </button>
            </form>

            <style jsx>{`
              .network-qr-backdrop {
                animation: qrBackdropFadeIn 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
              }
              .network-qr-modal {
                animation: qrModalScaleUp 0.26s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                transform-origin: center center;
              }
              @keyframes qrBackdropFadeIn {
                0% {
                  opacity: 0;
                }
                100% {
                  opacity: 1;
                }
              }
              @keyframes qrModalScaleUp {
                0% {
                  opacity: 0;
                  transform: scale(0.93) translateY(12px);
                }
                100% {
                  opacity: 1;
                  transform: scale(1) translateY(0);
                }
              }
              @keyframes scanAnim {
                0% {
                  top: 5px;
                }
                100% {
                  top: 195px;
                }
              }
              @media (prefers-reduced-motion: reduce) {
                .network-qr-backdrop,
                .network-qr-modal {
                  animation: none !important;
                  opacity: 1 !important;
                  transform: none !important;
                }
              }
            `}</style>
          </section>
        </div>
      )}

      {/* KPI Stats */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, margin: '20px 0' }}>
        <article style={{ padding: 16, border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff' }}>
          <span style={{ fontSize: 11, fontWeight: 750, color: '#64748b' }}>Kazi Zinazoendelea</span>
          <h2 style={{ fontSize: 26, margin: '6px 0 0', fontWeight: 800 }}>{activeJobs.length}</h2>
        </article>
        <article style={{ padding: 16, border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff' }}>
          <span style={{ fontSize: 11, fontWeight: 750, color: '#64748b' }}>Operesheni Zilizohifadhiwa</span>
          <h2 style={{ fontSize: 26, margin: '6px 0 0', fontWeight: 800 }}>{queue.length}</h2>
        </article>
        <article style={{ padding: 16, border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff' }}>
          <span style={{ fontSize: 11, fontWeight: 750, color: '#64748b' }}>Picha za Kazi Zilizohifadhiwa</span>
          <h2 style={{ fontSize: 26, margin: '6px 0 0', fontWeight: 800 }}>{photos.length}</h2>
        </article>
      </section>

      {/* Job list */}
      {loading ? (
        <p style={{ padding: 20, color: '#64748b' }}>Inapakia kazi za mafundi…</p>
      ) : jobs.length === 0 ? (
        <p style={{ padding: 20, color: '#64748b' }}>Hakuna kazi zilizopatikana kwenye mfumo kwa sasa.</p>
      ) : (
        <section style={{ display: 'grid', gap: 14 }}>
          {jobs.map((job) => {
            const status = effectiveStatus(job);
            const items = checklists[job.id];
            return (
              <article key={job.id} style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 18, background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 800, color: '#64748b', margin: '0 0 6px' }}>
                      {job.jobType} · {job.priority}
                    </p>
                    <h2 style={{ fontSize: 18, margin: '0 0 6px', fontWeight: 800 }}>{job.title}</h2>
                    <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 8px' }}>
                      {job.siteName || 'Site not specified'} ·{' '}
                      <span
                        style={{
                          fontWeight: 700,
                          color: status === 'COMPLETED' ? '#166534' : status === 'IN_PROGRESS' ? '#0369a1' : '#b45309',
                        }}
                      >
                        {status.replaceAll('_', ' ')}
                      </span>
                    </p>
                    {job.description && <p style={{ fontSize: 13, lineHeight: 1.5, margin: 0 }}>{job.description}</p>}
                  </div>

                  <div style={{ display: 'flex', gap: 8, alignItems: 'start', flexWrap: 'wrap' }}>
                    {!['IN_PROGRESS', 'COMPLETED', 'CANCELED'].includes(status) && (
                      <button
                        onClick={() => void setJobStatus(job, 'IN_PROGRESS')}
                        style={{
                          padding: '7px 12px',
                          background: '#0284c7',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 8,
                          fontWeight: 700,
                          fontSize: 12,
                          cursor: 'pointer',
                        }}
                      >
                        Anza Kazi
                      </button>
                    )}
                    {['IN_PROGRESS', 'ASSIGNED'].includes(status) && (
                      <button
                        onClick={() => void setJobStatus(job, 'BLOCKED')}
                        style={{
                          padding: '7px 12px',
                          background: '#fff',
                          border: '1px solid #cbd5e1',
                          borderRadius: 8,
                          fontSize: 12,
                          cursor: 'pointer',
                        }}
                      >
                        Weka Blocked
                      </button>
                    )}
                    {status === 'IN_PROGRESS' && (
                      <button
                        onClick={() => void setJobStatus(job, 'COMPLETED')}
                        style={{
                          padding: '7px 12px',
                          background: '#16a34a',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 8,
                          fontWeight: 700,
                          fontSize: 12,
                          cursor: 'pointer',
                        }}
                      >
                        Kamilisha Kazi ✓
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', marginTop: 14, flexWrap: 'wrap' }}>
                  <textarea
                    aria-label={'Work note for ' + job.title}
                    value={noteDrafts[job.id] ?? ''}
                    onChange={(event) => setNoteDrafts((prev) => ({ ...prev, [job.id]: event.target.value }))}
                    placeholder="Andika maelezo ya kazi (Site note)..."
                    rows={2}
                    style={{
                      flex: '1 1 260px',
                      border: '1px solid #cbd5e1',
                      borderRadius: 8,
                      padding: 10,
                      fontSize: 13,
                    }}
                  />
                  <button
                    onClick={() => void addNote(job)}
                    disabled={!(noteDrafts[job.id] ?? '').trim()}
                    style={{
                      padding: '8px 14px',
                      background: '#334155',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 8,
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: (noteDrafts[job.id] ?? '').trim() ? 'pointer' : 'not-allowed',
                      opacity: (noteDrafts[job.id] ?? '').trim() ? 1 : 0.6,
                    }}
                  >
                    Hifadhi Note
                  </button>

                  <label
                    style={{
                      border: '1px solid #cbd5e1',
                      borderRadius: 8,
                      padding: '9px 12px',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 700,
                      background: '#f8fafc',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span>📷</span> Piga Picha
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      capture="environment"
                      style={{ display: 'none' }}
                      onChange={(event) => {
                        void addPhoto(job, event.target.files?.[0]);
                        event.currentTarget.value = '';
                      }}
                    />
                  </label>

                  <button
                    onClick={() => void loadChecklist(job)}
                    style={{
                      padding: '8px 12px',
                      border: '1px solid #cbd5e1',
                      borderRadius: 8,
                      background: '#f8fafc',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    📋 Orodha ya Ukaguzi
                  </button>
                </div>

                {items && (
                  <div style={{ marginTop: 14, padding: 14, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                    <h3 style={{ fontSize: 13, margin: '0 0 10px', fontWeight: 800 }}>Orodha ya Ukaguzi wa Site</h3>
                    {items.map((item) => (
                      <label key={item.itemKey} style={{ display: 'flex', gap: 9, alignItems: 'center', padding: '6px 0', fontSize: 13 }}>
                        <input type="checkbox" checked={item.checked} onChange={() => void toggleChecklist(job, item)} />
                        {item.label}
                      </label>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}

      <p style={{ marginTop: 24, fontSize: 12, lineHeight: 1.7, color: '#64748b' }}>
        Kazi za nje ya mtandao na faili za picha zinahifadhiwa kwenye IndexedDB ya browser hii. Mfumo unatumia vitambulisho vya kipekee (Idempotency IDs) ili kuzuia data kufutika kimakosa. Usifute data ya browser mpaka kazi zote ziwe zimesawazishwa.
      </p>
    </main>
  );
}
