'use client';

import { useEffect, useMemo, useState } from 'react';
import { getAccessToken } from '../../lib/auth';
import { apiFetch } from '../../lib/api';

type Overview = {
  kpis?: { monthlyRevenue?: number; activeCustomers?: number; onlineSessions?: number; networkAvailability?: number | null; paymentFailures?: number };
  network?: { totalRouters?: number; online?: number; degraded?: number; offline?: number };
  locations?: Array<{ name?: string; activeUsers?: number }>;
};

type Insight = { title: string; detail: string; tone: 'positive' | 'warning' | 'neutral'; href: string };

function buildInsights(data: Overview | null): Insight[] {
  if (!data) return [{ title: 'Waiting for live tenant telemetry', detail: 'Jaslyn will analyze the current network after authenticated tenant data is available.', tone: 'neutral', href: '/dashboard' }];
  const network = data.network ?? {};
  const failures = data.kpis?.paymentFailures ?? 0;
  const availability = data.kpis?.networkAvailability;
  const insights: Insight[] = [];
  if ((network.offline ?? 0) > 0) insights.push({ title: `${network.offline} router${network.offline === 1 ? '' : 's'} offline`, detail: 'Inspect affected infrastructure before applying network changes.', tone: 'warning', href: '/network' });
  else if ((network.degraded ?? 0) > 0) insights.push({ title: `${network.degraded} router${network.degraded === 1 ? '' : 's'} degraded`, detail: 'Review device health and recent network events.', tone: 'warning', href: '/network' });
  else if (availability != null) insights.push({ title: `Network availability ${availability}%`, detail: 'Registered infrastructure is currently reporting healthy availability.', tone: 'positive', href: '/network' });
  if (failures > 0) insights.push({ title: `${failures} payment failure${failures === 1 ? '' : 's'}`, detail: 'Review provider responses and verified transaction state before activating access.', tone: 'warning', href: '/purchases' });
  else insights.push({ title: 'Payment flow is clear', detail: 'No failed payment attempts were returned by the current overview period.', tone: 'positive', href: '/purchases' });
  const busiest = [...(data.locations ?? [])].sort((a, b) => (b.activeUsers ?? 0) - (a.activeUsers ?? 0))[0];
  if (busiest?.name) insights.push({ title: `${busiest.name} has the highest active load`, detail: `${busiest.activeUsers ?? 0} active subscriber${(busiest.activeUsers ?? 0) === 1 ? '' : 's'} reported at this location.`, tone: 'neutral', href: '/network' });
  return insights.slice(0, 3);
}

export default function JaslynCopilot() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(true);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    apiFetch<Overview>('/overview', { headers: { Authorization: `Bearer ${token}` } })
      .then(setOverview)
      .catch(() => setError(true));
  }, []);

  const insights = useMemo(() => buildInsights(overview), [overview]);
  const insight = insights[Math.min(selected, insights.length - 1)] ?? insights[0];

  return (
    <aside className={open ? 'jaslyn-copilot open' : 'jaslyn-copilot'} aria-label="Jaslyn network copilot">
      <button className="jaslyn-orb" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label="Toggle Jaslyn copilot">J</button>
      {open && (
        <div className="jaslyn-card">
          <div className="jaslyn-card-head">
            <div><span className="jaslyn-eyebrow">JASLYN AI · NETWORK COPILOT</span><strong>Operational intelligence</strong></div>
            <span className={overview ? 'jaslyn-live' : 'jaslyn-live muted'}><i /> {overview ? 'LIVE' : error ? 'OFFLINE' : 'CONNECTING'}</span>
          </div>
          <p className="jaslyn-question">What needs attention right now?</p>
          <div className="jaslyn-insight-card">
            <span className={`jaslyn-tone ${insight?.tone ?? 'neutral'}`}>{insight?.tone === 'warning' ? '!' : insight?.tone === 'positive' ? '✓' : 'i'}</span>
            <div><strong>{insight?.title}</strong><p>{insight?.detail}</p></div>
          </div>
          <div className="jaslyn-tabs">
            {['Network', 'Payments', 'Load'].map((label, index) => <button key={label} type="button" onClick={() => setSelected(Math.min(index, insights.length - 1))} aria-pressed={selected === Math.min(index, insights.length - 1)}>{label}</button>)}
          </div>
          <a className="jaslyn-action" href={insight?.href ?? '/network'}>Inspect with Jaslyn <span>→</span></a>
          <small className="jaslyn-safety">Advisory mode · destructive network actions require authorization.</small>
        </div>
      )}
      <style jsx>{`
        .jaslyn-copilot{position:fixed;right:22px;bottom:22px;z-index:50;font-family:Arial,Helvetica,sans-serif}.jaslyn-orb{width:46px;height:46px;border-radius:14px;border:1px solid rgba(113,188,255,.35);background:#0b1b2e;color:#79c2ff;font-weight:900;box-shadow:0 14px 35px rgba(0,0,0,.3);cursor:pointer}.jaslyn-card{width:min(360px,calc(100vw - 44px));margin-bottom:10px;border:1px solid rgba(113,188,255,.2);border-radius:16px;background:rgba(8,20,35,.96);backdrop-filter:blur(18px);box-shadow:0 28px 80px rgba(0,0,0,.42);padding:18px;color:#edf5ff}.jaslyn-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:15px}.jaslyn-card-head strong{display:block;font-size:14px;margin-top:5px}.jaslyn-eyebrow{font-size:7px;letter-spacing:.14em;color:#69b9ff;font-weight:800}.jaslyn-live{font-size:7px;color:#66d3a1;white-space:nowrap}.jaslyn-live.muted{color:#8090a4}.jaslyn-live i{display:inline-block;width:6px;height:6px;border-radius:50%;background:currentColor;margin-right:5px}.jaslyn-question{color:#8194aa;font-size:10px;margin:20px 0 9px}.jaslyn-insight-card{display:flex;gap:11px;border:1px solid rgba(255,255,255,.07);background:#0c1b2c;border-radius:10px;padding:12px}.jaslyn-tone{width:25px;height:25px;border-radius:8px;display:grid;place-items:center;background:#18324d;color:#75c1ff;font-size:11px;font-weight:800;flex:none}.jaslyn-tone.warning{background:#39251b;color:#ffb47d}.jaslyn-tone.positive{background:#15352c;color:#71d4ac}.jaslyn-insight-card strong{font-size:11px}.jaslyn-insight-card p{color:#8ea0b5;font-size:9px;line-height:1.55;margin:5px 0 0}.jaslyn-tabs{display:flex;gap:6px;margin:11px 0}.jaslyn-tabs button{border:1px solid rgba(255,255,255,.08);background:transparent;color:#8194aa;border-radius:7px;padding:6px 9px;font-size:8px;cursor:pointer}.jaslyn-tabs button[aria-pressed=true]{background:#122a44;color:#dceeff;border-color:rgba(113,188,255,.25)}.jaslyn-action{display:flex;justify-content:space-between;text-decoration:none;background:#eef6ff;color:#07101f;border-radius:8px;padding:10px 12px;font-size:9px;font-weight:800}.jaslyn-safety{display:block;color:#5f7288;font-size:7px;line-height:1.5;margin-top:9px}@media(max-width:600px){.jaslyn-copilot{right:12px;bottom:12px}.jaslyn-card{width:calc(100vw - 24px)}}
      `}</style>
    </aside>
  );
}
