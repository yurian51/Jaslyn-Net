'use client';

import { useEffect, useState } from 'react';
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

type Capability = { hardware: Array<{ vendor: string; mode: string; protocol: string }>; gateways: string[] };

export default function UpesiLipaPage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [capabilities, setCapabilities] = useState<Capability | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const token = getAccessToken();
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [d, c] = await Promise.all([
        apiFetch<Dashboard>('/upesilipa/dashboard', { headers }),
        apiFetch<Capability>('/upesilipa/capabilities', { headers }),
      ]);
      setDashboard(d);
      setCapabilities(c);
    } catch (e: any) {
      setError(e?.message || 'UpesiLipa operator data could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const money = (value: string | number) => new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(Number(value || 0));

  return (
    <main className="upesilipa-page">
      <header className="upesilipa-head">
        <div>
          <span className="upesilipa-kicker">WIFI OPERATOR CONTROL</span>
          <h1>UpesiLipa Operations</h1>
          <p>Live hotspot billing, sites, sessions, vouchers and network health using Jaslyn Net's canonical data.</p>
        </div>
        <button onClick={load} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
      </header>

      {error && <div className="upesilipa-error">{error}</div>}

      <section className="upesilipa-stats">
        <article><small>Today sales</small><strong>{money(dashboard?.data.todaySales.amount || 0)}</strong><span>{dashboard?.data.todaySales.count || 0} paid purchases</span></article>
        <article><small>Customers online</small><strong>{dashboard?.data.activeSessions || 0}</strong><span>active sessions</span></article>
        <article><small>Routers</small><strong>{dashboard?.data.routers.online || 0}/{dashboard?.data.routers.total || 0}</strong><span>{dashboard?.data.routers.degraded || 0} degraded</span></article>
        <article><small>Sites</small><strong>{dashboard?.data.locations.count || 0}</strong><span>canonical locations</span></article>
      </section>

      <section className="upesilipa-grid">
        <article className="upesilipa-card">
          <h2>Voucher inventory</h2>
          <div className="upesilipa-list">
            <span>Unused <b>{dashboard?.data.vouchers.unused || 0}</b></span>
            <span>Used <b>{dashboard?.data.vouchers.used || 0}</b></span>
            <span>Expired <b>{dashboard?.data.vouchers.expired || 0}</b></span>
            <span>Total <b>{dashboard?.data.vouchers.total || 0}</b></span>
          </div>
        </article>

        <article className="upesilipa-card">
          <h2>Payment gateways</h2>
          <div className="upesilipa-chips">{capabilities?.gateways.map(g => <span key={g}>{g}</span>)}</div>
          <small>Gateway names are catalogue references. They are not treated as connected until a real provider configuration exists.</small>
        </article>

        <article className="upesilipa-card wide">
          <h2>Hardware integration boundary</h2>
          <div className="upesilipa-hardware">{capabilities?.hardware.map(item => (
            <div key={item.vendor}><strong>{item.vendor}</strong><span className={item.mode === 'NATIVE' ? 'native' : item.mode === 'RADIUS' ? 'radius' : 'catalog'}>{item.mode}</span><small>{item.protocol}</small></div>
          ))}</div>
        </article>
      </section>
    </main>
  );
}
