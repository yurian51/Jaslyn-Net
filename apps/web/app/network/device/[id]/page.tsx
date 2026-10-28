'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { apiFetch, ApiError } from '../../../../lib/api';
import { getAccessToken } from '../../../../lib/auth';

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
  lastSeenAt?: string | null;
  managementCredentialsConfigured?: boolean;
};

export default function NetworkDeviceStatusPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [device, setDevice] = useState<RouterAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadDevice() {
      const token = getAccessToken();
      if (!token) {
        setError('Sign in to view this device status.');
        setLoading(false);
        return;
      }
      try {
        const result = await apiFetch<RouterAsset>('/routers/' + encodeURIComponent(id), {
          headers: { Authorization: 'Bearer ' + token },
        });
        if (!cancelled) setDevice(result);
      } catch (cause: unknown) {
        if (!cancelled) setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Unable to load device status.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadDevice();
    return () => { cancelled = true; };
  }, [id]);

  const status = (device?.status || 'UNKNOWN').toUpperCase();
  const statusColor = status === 'ONLINE' ? '#166534' : status === 'DEGRADED' ? '#92400e' : status === 'OFFLINE' ? '#9f1239' : '#475569';
  const statusBackground = status === 'ONLINE' ? '#dcfce7' : status === 'DEGRADED' ? '#fef3c7' : status === 'OFFLINE' ? '#ffe4e6' : '#f1f5f9';

  return (
    <main style={{ maxWidth: 1000, margin: '0 auto', padding: '28px 18px', color: '#172033' }}>
      <nav style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 24, fontSize: 13 }}>
        <Link href="/network" style={{ color: '#1d4ed8' }}>Network console</Link>
        <span aria-hidden="true">/</span><span>Device status</span>
      </nav>
      <header style={{ marginBottom: 22 }}>
        <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.14em', color: '#64748b' }}>JASLYN NET / NETWORK CONSOLE</p>
        <h1 style={{ fontSize: 32, margin: '8px 0' }}>Device status</h1>
        <p style={{ color: '#64748b', margin: 0 }}>Authenticated, tenant-scoped status for the scanned router.</p>
      </header>
      {loading && <p role="status">Loading device status…</p>}
      {error && <p role="alert" style={{ padding: 14, borderRadius: 10, background: '#fff1f2', color: '#9f1239' }}>{error}</p>}
      {device && !loading && (
        <section style={{ border: '1px solid #e2e8f0', borderRadius: 16, padding: 22, background: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontSize: 11, color: '#64748b', fontWeight: 800, margin: '0 0 6px' }}>ROUTER ASSET</p>
              <h2 style={{ fontSize: 24, margin: '0 0 8px' }}>{device.name}</h2>
              <p style={{ fontSize: 12, color: '#64748b', overflowWrap: 'anywhere', margin: 0 }}>{device.id}</p>
            </div>
            <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 999, padding: '8px 12px', color: statusColor, background: statusBackground, fontSize: 12, fontWeight: 800 }}>{status.replaceAll('_', ' ')}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12, marginTop: 22 }}>
            {[
              ['Vendor', device.vendor || 'Unknown'],
              ['Model', device.model || 'Not specified'],
              ['IP address', device.ipAddress || 'Not specified'],
              ['MAC address', device.macAddress || 'Not specified'],
              ['Management protocol', device.managementProtocol || 'Not configured'],
              ['Management enabled', device.managementEnabled ? 'Enabled' : 'Disabled'],
              ['Credentials configured', device.managementCredentialsConfigured ? 'Yes' : 'No'],
              ['Last seen', device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : 'Never'],
            ].map(([label, value]) => (
              <article key={label} style={{ padding: 14, borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 7px' }}>{label}</p>
                <strong style={{ fontSize: 14, overflowWrap: 'anywhere' }}>{value}</strong>
              </article>
            ))}
          </div>
          <p style={{ margin: '18px 0 0', fontSize: 12, color: '#64748b' }}>Live status reflects the latest data returned by the authenticated network API. Management credentials are never displayed here.</p>
        </section>
      )}
    </main>
  );
}
