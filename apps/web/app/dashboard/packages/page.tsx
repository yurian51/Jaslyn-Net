'use client';

import './packages.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch, ApiError } from '../../../lib/api';
import { getAccessToken } from '../../../lib/auth';

type Tier = {
  code: string; name: string; rank: number; tagline: string; price: number; currency: string;
  durationSeconds: number; dataLimitBytes: number | null; downloadBps: number; uploadBps: number;
  devicesPerCode: number; featureFlags: Record<string, boolean>; featured: boolean;
  configured: boolean; package: { id: string; isActive: boolean; showOnPortal: boolean } | null;
};

const money = (currency: string, value: number) => new Intl.NumberFormat('en-TZ').format(value) + ' ' + currency;
const bits = (value: number) => value >= 1_000_000_000 ? (value / 1_000_000_000).toFixed(0) + ' Gbps' : (value / 1_000_000).toFixed(0) + ' Mbps';
const data = (value: number | null) => value == null ? 'Unlimited' : value >= 1_000_000_000_000 ? (value / 1_000_000_000_000).toFixed(0) + ' TB' : (value / 1_000_000_000).toFixed(0) + ' GB';
const duration = (seconds: number) => seconds >= 86400 ? Math.round(seconds / 86400) + ' days' : Math.round(seconds / 3600) + ' hours';

export default function PackagesPage() {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) { setError('Authentication required.'); setLoading(false); return; }
    try {
      setLoading(true);
      const result = await apiFetch<{ data: Tier[] }>('/packages/tiers/availability', { headers: { Authorization: `Bearer ${token}` } });
      setTiers(result.data);
      setError(null);
    } catch (cause: unknown) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Unable to load package tiers.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const configured = useMemo(() => tiers.filter(t => t.configured).length, [tiers]);

  async function provision(code: string) {
    const token = getAccessToken();
    if (!token) return;
    try {
      setBusy(code); setError(null);
      await apiFetch(`/packages/tiers/${encodeURIComponent(code)}/provision`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: '{}',
      });
      await load();
    } catch (cause: unknown) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Unable to provision tier.');
    } finally { setBusy(null); }
  }

  return (
    <main className="packages-page">
      <header className="packages-header">
        <div><div className="packages-eyebrow">JASLYN NET / COMMERCE</div><h1>Package architecture</h1><p>Eight named service tiers connected to the real tenant package catalog. No decorative pricing fiction pretending to be a database.</p></div>
        <div className="packages-stats"><b>{configured}<span>/ {tiers.length || 8}</span></b><small>tiers configured</small></div>
      </header>
      {error && <div className="packages-error" role="alert">{error}</div>}
      <section className="tier-grid" aria-label="Jaslyn service tiers">
        {(loading ? Array.from({length: 8}) : tiers).map((tier, index) => loading ? (
          <article className="tier-card skeleton" key={index}><div /><div /><div /></article>
        ) : (
          <article className={`tier-card ${tier.featured ? 'featured' : ''} ${tier.configured ? 'configured' : 'unconfigured'}`} key={tier.code}>
            <div className="tier-top"><span>0{tier.rank}</span>{tier.featured && <b>FEATURED</b>}</div>
            <h2>{tier.name}</h2><p>{tier.tagline}</p>
            <div className="tier-price">{money(tier.currency, tier.price)}<small>/ {duration(tier.durationSeconds)}</small></div>
            <div className="tier-specs">
              <span><b>{data(tier.dataLimitBytes)}</b><small>data allowance</small></span>
              <span><b>{bits(tier.downloadBps)} / {bits(tier.uploadBps)}</b><small>down / up</small></span>
              <span><b>{tier.devicesPerCode}</b><small>devices</small></span>
            </div>
            <div className="tier-flags">{Object.entries(tier.featureFlags).filter(([, enabled]) => enabled).slice(0, 7).map(([key]) => <span key={key}>{key}</span>)}</div>
            <footer><span className={tier.configured ? 'state-live' : 'state-missing'}>{tier.configured ? 'Configured' : 'Not configured'}</span>{tier.configured ? <span>{tier.package?.showOnPortal ? 'Portal visible' : 'Hidden from portal'}</span> : <button type="button" onClick={() => void provision(tier.code)} disabled={busy === tier.code}>{busy === tier.code ? 'Provisioning…' : 'Provision tier'}</button>}</footer>
          </article>
        ))}
      </section>
    </main>
  );
}
