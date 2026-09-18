'use client';

import Link from 'next/link';

const pillars = [
  ['01','Sell internet','Packages, vouchers and customer access in one commercial workflow.'],
  ['02','Run the network','Locations, routers, hotspots and live sessions from one control plane.'],
  ['03','Get paid','Billing, payments, verification and operational records together.'],
  ['04','Scale operations','Multi-location customers, services and network operations without fragmented tools.'],
];

const modules = [
  ['Billing','Packages, subscriptions, invoices and revenue workflows.'],
  ['Customers','Accounts, devices and service lifecycle.'],
  ['Hotspot','Captive portal and access policies.'],
  ['Vouchers','Prepaid access creation and control.'],
  ['Sessions','Live connections, usage and history.'],
  ['Network','Routers, sites and connectivity operations.'],
  ['Payments','Transactions, verification and reconciliation.'],
  ['RADIUS / AAA','Authentication and network access workflows.'],
];

export default function Home() {
  return <main className="landing">
    <nav className="landing-nav">
      <Link href="/" className="landing-logo"><span><img src="/brand/file_000000006450821195473e1e14153e8a.svg" alt="" /></span><b>JASLYN NET</b></Link>
      <div className="landing-links"><a href="#platform">Platform</a><a href="#workflow">How it works</a><a href="#network">Network</a><a href="#modules">Modules</a></div>
      <div className="landing-actions"><Link href="/login" className="landing-signin">Sign in</Link><Link href="/login" className="landing-cta">Open console ↗</Link></div>
    </nav>

    <section className="landing-hero">
      <div className="landing-hero-copy">
        <div className="landing-eyebrow"><i /> WIFI • BILLING • NETWORK OPERATIONS</div>
        <h1>Run your WiFi business<br /><em>from one control plane.</em></h1>
        <p>JASLYN NET brings customers, packages, vouchers, payments, sessions, routers and locations together so you can sell internet and operate the network without stitching together separate systems.</p>
        <div className="landing-hero-actions"><Link href="/login" className="landing-primary">Enter JASLYN NET →</Link><a href="#platform" className="landing-secondary">Explore the platform</a></div>
        <div className="landing-trust"><span>WiFi operators</span><i/><span>Hotspot & ISP workflows</span><i/><span>Multi-location ready</span></div>
      </div>

      <div className="landing-product">
        <div className="landing-window-bar"><span className="landing-dots"><i/><i/><i/></span><b>JASLYN NET / OPERATIONS</b><span>SECURE CONTROL PLANE</span></div>
        <div className="landing-product-shell">
          <aside><div className="landing-side-brand"><span><img src="/brand/file_000000006450821195473e1e14153e8a.svg" alt="" /></span><div><b>JASLYN NET</b><small>OPERATIONS</small></div></div><small className="landing-side-label">CONTROL PLANE</small><span className="active">▦ Overview</span><span>◉ Customers</span><span>◌ Sessions</span><span>⌁ Network</span><span>₮ Payments</span><small className="landing-side-label">ACCESS</small><span>◎ Hotspots</span><span>▣ Packages</span><span>◈ Vouchers</span></aside>
          <div className="landing-product-main">
            <div className="landing-preview-head"><div><small>NETWORK OPERATIONS</small><h3>Business overview</h3></div><span>● SYSTEM READY</span></div>
            <div className="landing-preview-kpis"><div><small>ACTIVE SESSIONS</small><strong>Live</strong><em>Customer access</em></div><div><small>PAYMENTS</small><strong>Verified</strong><em>Transaction flow</em></div><div><small>ROUTERS</small><strong>Connected</strong><em>Network access</em></div></div>
            <div className="landing-preview-grid"><div className="landing-preview-panel"><small>OPERATING FLOW</small><h4>Customer → Payment → Access</h4><div className="landing-flow"><span>Customer</span><b>→</b><span>Package</span><b>→</b><span>Payment</span><b>→</b><span>Internet</span></div></div><div className="landing-preview-panel"><small>LOCATIONS</small><h4>Sites under management</h4><div className="landing-site-row"><span><i/>Location A</span><b>Online</b></div><div className="landing-site-row"><span><i/>Location B</span><b>Online</b></div><div className="landing-site-row attention"><span><i/>Location C</span><b>Attention</b></div></div></div>
            <div className="landing-preview-note"><span>PRODUCT PREVIEW</span><b>Connect actual network and data after sign-in.</b></div>
          </div>
        </div>
      </div>
    </section>

    <section id="platform" className="landing-section"><div className="landing-label">01 / THE PLATFORM</div><div className="landing-section-head"><h2>From the first customer<br/><span>to the whole network.</span></h2><p>The commercial side and network side live in the same operational system, with shared customer, tenant and access foundations.</p></div><div className="landing-pillar-grid">{pillars.map(([n,t,d])=><article key={n}><small>{n}</small><h3>{t}</h3><p>{d}</p></article>)}</div></section>

    <section id="workflow" className="landing-section landing-workflow"><div className="landing-label">02 / HOW IT WORKS</div><div className="landing-section-head"><h2>A simple operating loop.<br/><span>A serious network underneath.</span></h2><p>Connect infrastructure, configure services, sell access and operate the resulting network from the same place.</p></div><div className="landing-workflow-line">{[['01','Connect','Add locations, routers and access infrastructure.'],['02','Configure','Create packages, rules and vouchers.'],['03','Sell','Customers purchase the configured service.'],['04','Operate','Track sessions, payments and network state.']].map(([n,t,d],i)=><div key={n} className="landing-step"><span>{n}</span><b>{t}</b><p>{d}</p></div>)}</div></section>

    <section id="network" className="landing-network"><div><div className="landing-label">03 / NETWORK + BILLING</div><h2>Your network is infrastructure.<br/><span>Your billing is operations.</span></h2></div><div><p>JASLYN NET connects customer access to the infrastructure that delivers it while keeping operational data in one control plane.</p><div className="landing-checks"><span>✓ Customers & service lifecycle</span><span>✓ Packages & prepaid access</span><span>✓ Sessions & usage</span><span>✓ Routers & locations</span><span>✓ Payment records</span><span>✓ RADIUS / AAA workflows</span></div></div></section>

    <section id="modules" className="landing-section"><div className="landing-label">04 / OPERATING MODULES</div><div className="landing-section-head"><h2>One product language.<br/><span>Every operational domain.</span></h2><p>Each module follows the same visual and operational language instead of becoming another isolated mini-application.</p></div><div className="landing-module-grid">{modules.map(([t,d],i)=><article key={t}><small>{String(i+1).padStart(2,'0')}</small><h3>{t}</h3><p>{d}</p></article>)}</div></section>

    <section className="landing-final"><div className="landing-label">05 / START OPERATING</div><h2>Your network is already complex.<br/><em>Your software should not be.</em></h2><p>Move billing, customers, payments and network operations into one source of operational truth.</p><Link href="/login" className="landing-primary">Open JASLYN NET Console ↗</Link></section>

    <footer className="landing-footer"><Link href="/" className="landing-logo"><span><img src="/brand/file_000000006450821195473e1e14153e8a.svg" alt="" /></span><b>JASLYN NET</b></Link><p>The operating platform for connected businesses.</p><small>© 2026 JASLYN NET. Built for connected operations.</small></footer>
  </main>;
}
