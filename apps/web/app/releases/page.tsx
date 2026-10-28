'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import './releases.css';

const releases = [
  { version: '2026.10.19', date: 'October 2026', title: 'Cambium cnMaestro model support', detail: 'Cambium is now prominently surfaced with cnMaestro-managed cnPilot Wi-Fi, cnWave, ePMP and cnMatrix coverage, including telemetry, client sessions and QoS readiness.', tags: ['Cambium', 'cnMaestro', 'Wi-Fi'], featured: true },
  { version: '2026.10.18', date: 'October 2026', title: 'Ruijie Reyee Cloud model support', detail: 'Ruijie/Reyee Cloud support is now surfaced with AP, gateway and cloud-managed Wi-Fi coverage, including device inventory, client telemetry, captive portal and QoS readiness.', tags: ['Ruijie', 'Reyee', 'Cloud'], featured: true },
  { version: '2026.10.17', date: 'October 2026', title: 'Barracuda CloudGen model support', detail: 'Barracuda support covers CloudGen Firewall, CloudGen WAN and Cloud Control with model-aware telemetry readiness.', tags: ['Barracuda', 'CloudGen'], featured: true },
  { version: '2026.10.16', date: 'October 2026', title: 'SonicWall SonicOS model support', detail: 'SonicWall support covers TZ, NSa and NSsp firewall families with secure API onboarding and live firmware validation.', tags: ['SonicWall', 'SonicOS'], featured: true },
  { version: '2026.10.15', date: 'October 2026', title: 'Palo Alto PAN-OS model support', detail: 'Palo Alto support covers PA-Series, VM-Series, Panorama and Prisma Access readiness through PAN-OS API validation.', tags: ['Palo Alto', 'PAN-OS'], featured: true },
  { version: '2026.10.14', date: 'October 2026', title: 'WatchGuard Firebox model support', detail: 'WatchGuard support covers Firebox appliances and WatchGuard Cloud readiness with secure management and live validation.', tags: ['WatchGuard', 'Firebox'], featured: true },
  { version: '2026.10.13', date: 'October 2026', title: 'Ruckus SmartZone model support', detail: 'Ruckus support covers SmartZone, Virtual SmartZone, ICX switching and current WLAN model families.', tags: ['Ruckus', 'SmartZone'], featured: true },
  { version: '2026.10.12', date: 'October 2026', title: 'ExtremeCloud IQ model support', detail: 'Extreme support covers Cloud IQ, ExtremeXOS switching and universal access points with controller-aware readiness.', tags: ['Extreme', 'Cloud IQ'], featured: true },
  { version: '2026.10.11', date: 'October 2026', title: 'Huawei CloudCampus model support', detail: 'Huawei CloudCampus support covers campus controllers, CloudEngine switching, AirEngine WLAN and AR gateways.', tags: ['Huawei', 'CloudCampus'], featured: true },
  { version: '2026.10.10', date: 'October 2026', title: 'Zyxel Nebula model support', detail: 'Zyxel support covers Nebula gateways, switches and access points with cloud-controller discovery and model-aware readiness checks.', tags: ['Zyxel', 'Nebula'], featured: true },
  { version: '2026.10.9', date: 'October 2026', title: 'Netgear Insight model support', detail: 'Netgear Insight-managed switches, access points and gateways now have vendor-aware onboarding and telemetry readiness.', tags: ['Netgear', 'Insight'], featured: true },
  { version: '2026.10.8', date: 'October 2026', title: 'Dell PowerSwitch model support', detail: 'Dell OS10 and OS9 PowerSwitch families are now represented with NETCONF, telemetry and model compatibility metadata.', tags: ['Dell', 'PowerSwitch'], featured: true },
  { version: '2026.10.7', date: 'October 2026', title: 'Fortinet FortiGate model support', detail: 'FortiGate, FortiSwitch and FortiAP families now have secure API onboarding, telemetry capabilities and live validation requirements.', tags: ['Fortinet', 'FortiGate'], featured: true },
  { version: '2026.10.6', date: 'October 2026', title: 'Juniper Junos and Mist model support', detail: 'Juniper support now covers Junos routers, EX and QFX switching, SRX security, MX edge platforms and Mist-managed WLAN through NETCONF and controller-aware discovery.', tags: ['Juniper', 'Junos', 'Mist'], featured: true },
  { version: '2026.10.5', date: 'October 2026', title: 'TP-Link Omada model support', detail: 'Omada support now covers cloud and local controllers, gateways, switches and access points across ER, SG, EAP, OC and SDN-managed device families.', tags: ['TP-Link', 'Omada', 'SDN'], featured: true },
  { version: '2026.10.4', date: 'October 2026', title: 'Aruba Central and AOS-CX model support', detail: 'Aruba support now covers Central-managed gateways and WLAN, Instant On families, CX switching and AOS-CX devices through controller API and NETCONF discovery.', tags: ['Aruba', 'Central', 'AOS-CX'], featured: true },
  { version: '2026.10.3', date: 'October 2026', title: 'Huawei VRP and AirEngine model support', detail: 'Huawei support now covers VRP routers, AR and NE platforms, CloudEngine and S-series switching, AC controllers and AirEngine WLAN through NETCONF/RESTCONF and controller-aware discovery.', tags: ['Huawei', 'VRP', 'AirEngine'], featured: true },
  { version: '2026.10.2', date: 'October 2026', title: 'Cisco IOS and IOS-XE model support', detail: 'Cisco support now covers IOS and IOS-XE routers, ISR, ASR, CSR, Catalyst switching, C9800 wireless controllers and NCS platforms through vendor-aware capability discovery.', tags: ['Cisco', 'IOS-XE', 'Network'], featured: true },
  { version: '2026.10.1', date: 'October 2026', title: 'Ubiquiti UniFi network support', detail: 'UniFi Network API support is now available for vendor-aware onboarding, controller connectivity, capability discovery and audited network operations.', tags: ['Ubiquiti', 'UniFi', 'Network'] },
  { version: '2026.10', date: 'October 2026', title: 'UpesiLipa workspace rollout', detail: 'A single operator workspace now brings network operations, payments, customers, vouchers, captive portal, finance and automation together.', tags: ['Workspace', 'Operations'] },
  { version: '2026.09', date: 'September 2026', title: 'Payment gateway readiness', detail: 'Gateway configuration and payment activity are now surfaced in the Jaslyn Net control centre, with tenant-scoped status and audit visibility.', tags: ['Payments', 'Integrations'] },
  { version: '2026.08', date: 'August 2026', title: 'Customer experience toolkit', detail: 'Branded captive portal management, customer portal workflows, promotions and package discovery are available from the feature hub.', tags: ['Portal', 'Customers'] },
  { version: '2026.07', date: 'July 2026', title: 'Router and access operations', detail: 'MikroTik onboarding, RADIUS workflows, live sessions, voucher operations and site health are connected to network operations.', tags: ['Network', 'Access'] },
];

export default function ReleasesPage() {
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState('All');
  const tags = ['All', ...Array.from(new Set(releases.flatMap((release) => release.tags)))];
  const visibleReleases = useMemo(() => releases.filter((release) => {
    const haystack = `${release.title} ${release.detail} ${release.tags.join(' ')}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase()) && (activeTag === 'All' || release.tags.includes(activeTag));
  }), [activeTag, query]);

  return <main className="releases-page">
    <header className="releases-header">
      <div><Link className="releases-back" href="/upesilipa">← UpesiLipa workspace</Link><span className="releases-kicker">JASLYN NET · LATEST RELEASES</span><h1>Product updates, in one place.</h1><p>Track the capabilities added to Jaslyn Net as UpesiLipa evolves from a billing tool into a complete WiFi business operating system.</p></div>
      <Link className="releases-action" href="/dashboard">Open dashboard ↗</Link>
    </header>
    <section className="release-overview" aria-label="Release overview">
      <div><span className="release-overline">OPERATIONS CHANGELOG</span><strong>{releases.length} shipped updates</strong><span>Multi-vendor network coverage, controller readiness and operator tooling.</span></div>
      <div className="release-overview-metrics"><span><b>{new Set(releases.flatMap((release) => release.tags)).size}</b> domains</span><span><b>{releases.filter((release) => release.featured).length}</b> latest</span></div>
    </section>
    <section className="release-controls" aria-label="Filter releases">
      <label className="release-search"><span className="sr-only">Search releases</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search releases" /></label>
      <div className="release-filters" role="group" aria-label="Release tags">{tags.map((tag) => <button type="button" className={activeTag === tag ? 'is-active' : ''} aria-pressed={activeTag === tag} key={tag} onClick={() => setActiveTag(tag)}>{tag}</button>)}</div>
    </section>
    <section className="releases-list" aria-label="Latest releases">
      <p className="release-result-count" aria-live="polite">Showing {visibleReleases.length} of {releases.length} releases</p>
      {visibleReleases.length ? visibleReleases.map((release) => <article className={`release-card${release.featured ? ' release-card-featured' : ''}`} key={release.version}>
        <div className="release-meta"><strong>{release.version}</strong><span>{release.date}</span>{release.featured && <span className="release-status">Latest</span>}</div>
        <div><h2>{release.title}</h2><p>{release.detail}</p><div className="release-tags">{release.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></div>
      </article>) : <div className="release-empty"><strong>No releases match this filter.</strong><span>Try another tag or clear your search.</span><button type="button" onClick={() => { setQuery(''); setActiveTag('All'); }}>Clear filters</button></div>}
    </section>
    <footer className="releases-footer"><span>More updates will appear here as features ship.</span><Link href="/upesilipa">View all capabilities →</Link></footer>
  </main>;
}
