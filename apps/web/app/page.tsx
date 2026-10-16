import Link from 'next/link';
import LandingNav from './landing-nav';
import SiteFooter from './site-footer';

const features = [
  ['◎','Subscribers & access','Manage customer profiles, packages and service status.','/product'],
  ['↗','Billing & payments','Follow package sales, payment events and reconciliation workflows.','/payments'],
  ['▤','Packages & vouchers','Organise prepaid offers and voucher workflows for your operation.','/packages'],
  ['⌁','Network operations','Bring sites, routers, sessions and incidents into one view.','/operations'],
  ['⛓','Vendor integrations','Review supported paths and validate device-specific capabilities.','/integrations'],
  ['◈','Security & audit','Make permissions, ownership and operational actions traceable.','/architecture'],
];
const vendors=['MikroTik','TP-Link Omada','Ubiquiti UniFi','Cambium','Ruijie','Cudy','Ruckus','Cisco','Aruba','FreeRADIUS'];
const steps=[
  ['01','Create your workspace','Set up your organisation and service context.'],
  ['02','Map your network','Record sites, devices and integration requirements.'],
  ['03','Configure services','Organise packages, billing rules and voucher workflows.'],
  ['04','Operate with context','Review customer, payment and network events together.'],
];
function Arrow(){return <svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M4 10h11M10 5l5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>}
function DashboardPreview(){return <div className="jup-dashboard" aria-label="Illustrative Jaslyn Net dashboard preview">
  <div className="jup-dash-top"><span className="jup-dots"><i/><i/><i/></span><b>JASLYN NET</b><small>WORKSPACE PREVIEW</small></div>
  <div className="jup-dash-body"><aside className="jup-dash-side"><b className="jup-mark">J<span>·</span></b><small>WORKSPACE</small><span className="active">◫ Overview</span><span>◎ Subscribers</span><span>▤ Packages</span><span>↗ Payments</span><span>⌁ Network</span><span>⛓ Integrations</span><small className="jup-company">YURIAN TECH LTD</small></aside>
  <div className="jup-dash-content"><div className="jup-dash-heading"><div><small>OPERATIONS / OVERVIEW</small><h3>Your network at a glance</h3><p>Customer, commercial and network workflows</p></div><b>Concept view</b></div>
  <div className="jup-dash-kpis"><div><small>SUBSCRIBERS</small><b>Customer lifecycle</b><span>Profiles · access · status</span></div><div><small>COMMERCIAL</small><b>Billing workflows</b><span>Packages · payment events</span></div><div><small>NETWORK</small><b>Sites & devices</b><span>Routers · incidents · links</span></div></div>
  <div className="jup-dash-panel"><small>CONNECTED WORKFLOW</small><b>From subscriber to service access</b><div className="jup-flow"><span>Subscriber</span><i>→</i><span>Package</span><i>→</i><span>Payment</span><i>→</i><span>Access policy</span></div><p>Illustrative preview — no live customer records or network telemetry shown.</p></div>
  <div className="jup-dash-bottom"><span>● Customer operations</span><span>Billing & reconciliation</span><span>Network visibility</span></div></div></div></div>}
export default function Home(){return <main className="jup-page">
  <LandingNav/>
  <section className="jup-hero"><div className="jup-hero-grid"/><div className="jup-container jup-hero-inner">
    <div className="jup-hero-copy"><span className="jup-eyebrow"><i/> ISP BILLING · WI-FI · NETWORK OPERATIONS</span><h1>Run your network business.<br/><em>From one connected workspace.</em></h1><p>Jaslyn Net connects subscriber management, Wi-Fi packages, billing workflows, network visibility and vendor integrations for ISPs, hotspot operators and managed networks.</p><div className="jup-actions"><Link href="/register" className="jup-btn jup-btn-primary">Get started <Arrow/></Link><Link href="/platform" className="jup-btn jup-btn-outline">Explore the platform</Link></div><div className="jup-trustline"><b>BUILT FOR NETWORK OPERATIONS</b><i/> Subscribers <i/> Billing <i/> Network visibility</div></div>
    <div className="jup-hero-art"><DashboardPreview/></div></div><div className="jup-hero-bottom"><span>CONNECT. CONTROL. GROW.</span><span>BY YURIAN TECH LTD</span></div></section>
  <section className="jup-hardware"><div className="jup-container jup-hardware-inner"><div><small>DESIGNED FOR MIXED-VENDOR NETWORKS</small><h2>Your infrastructure. Your integration path.</h2></div><div className="jup-vendors">{vendors.map(v=><span key={v}>{v}</span>)}</div><p>Support depends on device, model, firmware and configuration. Verify each capability before enabling production actions.</p></div></section>
  <section className="jup-section jup-container"><div className="jup-section-head"><div><span className="jup-label">ONE OPERATING PLATFORM</span><h2>Everything important, easier to manage.</h2></div><p>Bring commercial and network workflows into a clearer operating picture. Actual automation depends on configured services and integrations.</p></div><div className="jup-features">{features.map((f,i)=><article className="jup-feature" key={f[1]}><div className="jup-feature-top"><span>{f[0]}</span><small>0{i+1}</small></div><h3>{f[1]}</h3><p>{f[2]}</p><Link href={f[3]}>Explore capability <Arrow/></Link></article>)}</div></section>
  <section className="jup-process"><div className="jup-container"><div className="jup-section-head"><div><span className="jup-label">HOW IT WORKS</span><h2>A practical path from setup to operations.</h2></div><p>Start with your service model, then configure only the workflows and integrations available in your environment.</p></div><div className="jup-steps">{steps.map((s,i)=><article key={s[0]}><b className="jup-step-n">{s[0]}</b><div className="jup-step-icon">{['◎','⌁','▤','↗'][i]}</div><h3>{s[1]}</h3><p>{s[2]}</p></article>)}</div></div></section>
  <section className="jup-cta-section"><div className="jup-container jup-cta"><div><span className="jup-label">YOUR NETWORK. YOUR OPERATING MODEL.</span><h2>Make customer, payment and network events easier to follow.</h2><p>Explore Jaslyn Net or create a workspace to review available workflows.</p></div><div className="jup-cta-actions"><Link href="/register" className="jup-btn jup-btn-primary">Create a workspace <Arrow/></Link><Link href="/integrations" className="jup-text-link">Review integrations <Arrow/></Link></div></div></section>
  <section className="jup-faq jup-container"><div><span className="jup-label">BEFORE YOU START</span><h2>Clear answers. No inflated promises.</h2><p>Review current capabilities and integration requirements before making production changes.</p><Link href="/faq" className="jup-text-link">Visit the FAQ <Arrow/></Link></div><div className="jup-faq-list"><details><summary>Which network vendors can Jaslyn Net work with?</summary><p>Integration options are documented for multiple vendor and AAA environments. Actual capabilities depend on the adapter, device model, firmware and configuration.</p></details><details><summary>Does this preview show live network data?</summary><p>No. This landing-page dashboard is illustrative. Live data requires the relevant backend services, device connections and permissions to be configured.</p></details><details><summary>Can I manage packages, billing and subscribers?</summary><p>Jaslyn Net has dedicated product surfaces for these workflows. Review each module and its setup requirements before production use.</p></details><details><summary>Where are API and integration details?</summary><p>Use the integrations and architecture pages for the documented technical paths.</p></details></div></section>
  <SiteFooter/>
</main>}
