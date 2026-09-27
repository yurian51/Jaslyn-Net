'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '../../lib/api';
import { getAccessToken } from '../../lib/auth';
import './upesilipa.css';

type Dashboard = {
  data: {
    locations: { count: number };
    routers: { total: number; online: number; degraded: number };
    activeSessions: number;
    todaySales: { amount: string; count: number };
    vouchers: { total: number; unused: number; used: number; expired: number };
  };
};

type HealthOverview = {
  summary: { sites: number; healthy: number; degraded: number; offline: number; noDevices: number };
};

export default function JaslynWifiOperationsPage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [health, setHealth] = useState<HealthOverview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const token = getAccessToken();
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [d, h] = await Promise.all([
        apiFetch<Dashboard>('/upesilipa/dashboard', { headers }),
        apiFetch<HealthOverview>('/upesilipa/health', { headers }),
      ]);
      setDashboard(d);
      setHealth(h);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Jaslyn Net WiFi operations could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const money = (value: string | number) =>
    new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(Number(value || 0));

  const actions = [
    ['/network', 'Network', 'Routers, sites, gateways and device health'],
    ['/sessions', 'Sessions', 'Live subscriber connections and accounting'],
    ['/customers', 'Customers', 'Subscriber accounts and service state'],
    ['/packages', 'Plans & Products', 'WiFi packages, speed and access policy'],
    ['/vouchers', 'Vouchers', 'Voucher inventory, batches and redemption'],
    ['/payments', 'Payments', 'Transactions, verification and reconciliation'],
    ['/purchases', 'Purchases & Access', 'Purchase lifecycle and entitlement'],
    ['/communication', 'Communication', 'Customer messages and operator commands'],
  ] as const;

  return (
    <main className="jaslyn-wifi-page">
      <header className="jaslyn-wifi-head">
        <div>
          <span className="jaslyn-wifi-kicker">JASLYN NET · WIFI OPERATIONS</span>
          <h1>WiFi Operations</h1>
          <p>One Jaslyn Net control surface for WiFi operations. Each capability stays in its canonical module instead of creating a second system.</p>
        </div>
        <button onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
      </header>

      {error && <div className="jaslyn-wifi-error" role="alert">{error}</div>}

      <section className="jaslyn-wifi-stats" aria-label="WiFi operational summary">
        <article><small>Today sales</small><strong>{money(dashboard?.data.todaySales.amount || 0)}</strong><span>{dashboard?.data.todaySales.count || 0} purchases</span></article>
        <article><small>Active sessions</small><strong>{dashboard?.data.activeSessions || 0}</strong><span>live connections</span></article>
        <article><small>Routers online</small><strong>{dashboard?.data.routers.online || 0}/{dashboard?.data.routers.total || 0}</strong><span>{dashboard?.data.routers.degraded || 0} degraded</span></article>
        <article><small>Sites</small><strong>{dashboard?.data.locations.count || 0}</strong><span>tenant locations</span></article>
      </section>

      <section className="jaslyn-wifi-card">
        <div className="jaslyn-wifi-card-head">
          <div><span className="jaslyn-wifi-kicker">NETWORK HEALTH</span><h2>Operational health</h2></div>
          <Link href="/network">Open Network →</Link>
        </div>
        <div className="jaslyn-wifi-health">
          <span><b>{health?.summary.healthy || 0}</b> Healthy</span>
          <span><b>{health?.summary.degraded || 0}</b> Degraded</span>
          <span><b>{health?.summary.offline || 0}</b> Offline</span>
          <span><b>{health?.summary.noDevices || 0}</b> No devices</span>
        </div>
      </section>

      <section className="jaslyn-wifi-card">
        <div className="jaslyn-wifi-card-head">
          <div><span className="jaslyn-wifi-kicker">CANONICAL CONTROL SURFACES</span><h2>Operate WiFi from the right Jaslyn Net module</h2></div>
        </div>
        <div className="jaslyn-wifi-actions">
          {actions.map(([href, title, description]) => (
            <Link href={href} key={href}>
              <strong>{title}</strong>
              <span>{description}</span>
              <b>Open →</b>
            </Link>
          ))}
        </div>
      </section>

      <section className="jaslyn-wifi-card">
        <div className="jaslyn-wifi-card-head">
          <div><span className="jaslyn-wifi-kicker">BOUNDARY RULE</span><h2>Jaslyn Net is the product</h2></div>
        </div>
        <p className="jaslyn-wifi-note">
          This surface does not present a separate WiFi brand, payment brand, hardware brand, or parallel dashboard.
          Provider integrations remain adapters underneath Jaslyn Net, while customers, sessions, packages, payments,
          vouchers and network commands remain owned by their canonical Jaslyn Net modules.
        </p>
      </section>
    </main>
  );
}
