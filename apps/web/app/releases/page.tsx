'use client';

import Link from 'next/link';
import './releases.css';

const releases = [
  { version: '2026.10.3', date: 'October 2026', title: 'Huawei VRP and AirEngine model support', detail: 'Huawei support now covers VRP routers, AR and NE platforms, CloudEngine and S-series switching, AC controllers and AirEngine WLAN through NETCONF/RESTCONF and controller-aware discovery.', tags: ['Huawei', 'VRP', 'AirEngine'], featured: true },
  { version: '2026.10.2', date: 'October 2026', title: 'Cisco IOS and IOS-XE model support', detail: 'Cisco support now covers IOS and IOS-XE routers, ISR, ASR, CSR, Catalyst switching, C9800 wireless controllers and NCS platforms through vendor-aware capability discovery.', tags: ['Cisco', 'IOS-XE', 'Network'], featured: true },
  { version: '2026.10.1', date: 'October 2026', title: 'Ubiquiti UniFi network support', detail: 'UniFi Network API support is now available for vendor-aware onboarding, controller connectivity, capability discovery and audited network operations.', tags: ['Ubiquiti', 'UniFi', 'Network'] },
  { version: '2026.10', date: 'October 2026', title: 'UpesiLipa workspace rollout', detail: 'A single operator workspace now brings network operations, payments, customers, vouchers, captive portal, finance and automation together.', tags: ['Workspace', 'Operations'] },
  { version: '2026.09', date: 'September 2026', title: 'Payment gateway readiness', detail: 'Gateway configuration and payment activity are now surfaced in the Jaslyn Net control centre, with tenant-scoped status and audit visibility.', tags: ['Payments', 'Integrations'] },
  { version: '2026.08', date: 'August 2026', title: 'Customer experience toolkit', detail: 'Branded captive portal management, customer portal workflows, promotions and package discovery are available from the feature hub.', tags: ['Portal', 'Customers'] },
  { version: '2026.07', date: 'July 2026', title: 'Router and access operations', detail: 'MikroTik onboarding, RADIUS workflows, live sessions, voucher operations and site health are connected to network operations.', tags: ['Network', 'Access'] },
];

export default function ReleasesPage() {
  return <main className="releases-page">
    <header className="releases-header">
      <div><Link className="releases-back" href="/upesilipa">← UpesiLipa workspace</Link><span className="releases-kicker">JASLYN NET · LATEST RELEASES</span><h1>Product updates, in one place.</h1><p>Track the capabilities added to Jaslyn Net as UpesiLipa evolves from a billing tool into a complete WiFi business operating system.</p></div>
      <Link className="releases-action" href="/dashboard">Open dashboard ↗</Link>
    </header>
    <section className="releases-list" aria-label="Latest releases">
      {releases.map((release) => <article className={`release-card${release.featured ? ' release-card-featured' : ''}`} key={release.version}>
        <div className="release-meta"><strong>{release.version}</strong><span>{release.date}</span>{release.featured && <span className="release-status">Latest</span>}</div>
        <div><h2>{release.title}</h2><p>{release.detail}</p><div className="release-tags">{release.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></div>
      </article>)}
    </section>
    <footer className="releases-footer"><span>More updates will appear here as features ship.</span><Link href="/upesilipa">View all capabilities →</Link></footer>
  </main>;
}
