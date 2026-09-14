'use client';

import { useMemo, useState } from 'react';

type Overview = {
  kpis?: {
    monthlyRevenue?: number;
    activeCustomers?: number;
    onlineSessions?: number;
    networkAvailability?: number | null;
    paymentFailures?: number;
  };
  network?: { totalRouters?: number; online?: number; degraded?: number; offline?: number };
  locations?: Array<{ name?: string; routers?: number; activeUsers?: number; onlineRouters?: number; revenue?: number }>;
};

type Insight = { title: string; detail: string; tone: 'positive' | 'warning' | 'neutral' };

function buildInsights(data: Overview | null): Insight[] {
  if (!data) {
    return [{ title: 'Waiting for live telemetry', detail: 'Connect to a tenant workspace to let Jaslyn analyze current network and business signals.', tone: 'neutral' }];
  }

  const insights: Insight[] = [];
  const network = data.network ?? {};
  const failures = data.kpis?.paymentFailures ?? 0;
  const availability = data.kpis?.networkAvailability;
  const degraded = network.degraded ?? 0;
  const offline = network.offline ?? 0;

  if (offline > 0) {
    insights.push({ title: `${offline} router${offline === 1 ? '' : 's'} offline`, detail: 'Network availability needs attention. Open Network Operations to inspect affected devices before applying changes.', tone: 'warning' });
  } else if (degraded > 0) {
    insights.push({ title: `${degraded} router${degraded === 1 ? '' : 's'} degraded`, detail: 'Jaslyn detected registered infrastructure that is not fully operational. Review device health and recent events.', tone: 'warning' });
  } else if (availability != null) {
    insights.push({ title: `Network availability ${availability}%`, detail: 'All registered routers are currently reported operational. Continue watching live telemetry for changes.', tone: 'positive' });
  }

  if (failures > 0) {
    insights.push({ title: `${failures} payment failure${failures === 1 ? '' : 's'}`, detail: 'Review failed payment attempts and provider responses. Do not activate access from an unverified client-side payment state.', tone: 'warning' });
  } else {
    insights.push({ title: 'No payment failures reported', detail: 'The current overview contains no failed payment attempts for the reporting period.', tone: 'positive' });
  }

  const locations = data.locations ?? [];
  if (locations.length) {
    const busiest = [...locations].sort((a, b) => (b.activeUsers ?? 0) - (a.activeUsers ?? 0))[0];
    if (busiest?.name) {
      insights.push({ title: `${busiest.name} has the highest active load`, detail: `${busiest.activeUsers ?? 0} active subscriber${(busiest.activeUsers ?? 0) === 1 ? '' : 's'} reported at this location. Compare router capacity before changing policies.`, tone: 'neutral' });
    }
  }

  return insights.slice(0, 3);
}

export function JaslynPanel({ overview }: { overview: Overview | null }) {
  const insights = useMemo(() => buildInsights(overview), [overview]);
  const [selected, setSelected] = useState(0);
  const active = insights[selected] ?? insights[0];

  return (
    <section className="jaslyn-panel" aria-labelledby="jaslyn-title">
      <div className="jaslyn-head">
        <div>
          <div className="panel-kicker">JASLYN · NETWORK INTELLIGENCE</div>
          <h2 id="jaslyn-title">Your AI operations copilot</h2>
          <p>Jaslyn turns the telemetry already available to this tenant into operational observations and safe next actions.</p>
        </div>
        <span className="jaslyn-status"><i /> {overview ? 'LIVE TELEMETRY' : 'AWAITING DATA'}</span>
      </div>

      <div className="jaslyn-grid">
        <div className="jaslyn-insight">
          <div className={`jaslyn-signal ${active?.tone ?? 'neutral'}`}><span>{active?.tone === 'warning' ? '!' : active?.tone === 'positive' ? '✓' : 'i'}</span></div>
          <div>
            <strong>{active?.title ?? 'No insight available'}</strong>
            <p>{active?.detail ?? 'Jaslyn needs live tenant data before it can analyze the network.'}</p>
          </div>
        </div>
        <div className="jaslyn-actions">
          <a href="/network">Inspect network <span>→</span></a>
          <a href="/purchases">Review payments <span>→</span></a>
          <a href="/sessions">Inspect sessions <span>→</span></a>
        </div>
      </div>

      <div className="jaslyn-footer">
        <div className="jaslyn-prompts" aria-label="Jaslyn analysis topics">
          {['Network health', 'Revenue signals', 'Payment risk'].map((label, index) => (
            <button key={label} type="button" onClick={() => setSelected(Math.min(index, insights.length - 1))} aria-pressed={selected === Math.min(index, insights.length - 1)}>
              {label}
            </button>
          ))}
        </div>
        <span className="jaslyn-safety">Advisory mode · destructive network actions require authorization</span>
      </div>
    </section>
  );
}
