'use client';

import Link from 'next/link';

const pillars = [
  ['01','Sell internet','Packages, vouchers and customer access in one commercial workflow.'],
  ['02','Run the network','Locations, routers, hotspots and live sessions from one control plane.'],
  ['03','Get paid','Billing, payments, verification and operational records together.'],
  ['04','Scale operations','Multi-location customers, services and network operations without fragmented tools.'],
];


const hardware = [
  ['MikroTik','RouterOS REST + RADIUS','Native API'], ['Ubiquiti UniFi','Network API + RADIUS','Native API'],
  ['TP-Link Omada','Controller API + RADIUS','Native API'], ['Cambium Networks','cnMaestro + RADIUS','Native API'],
  ['Cisco Meraki','Dashboard API + RADIUS','Native API'], ['Aruba Networks','Central API + RADIUS','Native API'],
  ['Grandstream','GWN API + RADIUS','Native API'], ['Ruijie / Reyee','Cloud API + RADIUS','Native API'],
  ['Ruckus Networks','SmartZone API + RADIUS','Native API'], ['OpenWrt','ubus + RADIUS','Native API'],
  ['Teltonika Networks','RMS API + RADIUS','Native API'], ['Peplink','InControl API + RADIUS','Native API'],
  ['pfSense / OPNsense','Gateway API + RADIUS','Gateway'], ['FreeRADIUS','Vendor-neutral AAA','RADIUS'],
];
const packages = [
  ['1 Hour','Short access window','Create and price your own hourly package.'],
  ['Full Day','Day-pass access','Set duration, speed and access policy from Packages.'],
  ['1 Week','Longer prepaid access','Combine duration, bandwidth and customer rules.'],
];
const pricing: Array<[string, string, string, string[]]> = [
  ['Free','For a single router / evaluation','Core control-plane workflows.',['Customers & packages','Vouchers & sessions','RADIUS / AAA foundations','Network operations']],
  ['Operator','For growing WiFi operations','Multi-site operational workflows.',['Everything in Free','More routers and locations','Advanced billing operations','Load balancing & network controls']],
  ['ISP / Enterprise','For larger deployments','Scale around your infrastructure.',['Everything in Operator','Multi-location operations','Advanced integrations','Enterprise support & controls']],
];
const faqs = [
  ['Can I use JASLYN NET with MikroTik?','Yes. The current capability layer includes a native MikroTik RouterOS REST adapter and a standard RADIUS path.'],
  ['Can I use hardware from different vendors?','Yes, through native controller/API integrations where implemented and vendor-neutral RADIUS where appropriate.'],
  ['Do I need a payment gateway to sell vouchers?','No. Voucher and access workflows can operate independently. Payment providers are enabled only after the organization has the required provider configuration.'],
  ['Does JASLYN NET hold my customers’ money?','JASLYN NET records and verifies payment events around your configured payment flows. Provider credentials and settlement remain provider-specific.'],
  ['What happens when a customer payment succeeds?','A successful payment can move a pending purchase to paid access, create or update its access grant and synchronize customer service state.'],
  ['Can I manage multiple locations?','Yes. Locations, routers, customers, sessions and operational modules are designed around tenant and multi-site management.'],
];

const modules: Array<[string, string]> = [
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
      <Link href="/" className="landing-logo"><span><img src="/brand/jaslyn-net-mark.svg" alt="" /></span><b>JASLYN NET</b></Link>
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
          <aside><div className="landing-side-brand"><span><img src="/brand/jaslyn-net-mark.svg" alt="" /></span><div><b>JASLYN NET</b><small>OPERATIONS</small></div></div><small className="landing-side-label">CONTROL PLANE</small><span className="active">▦ Overview</span><span>◉ Customers</span><span>◌ Sessions</span><span>⌁ Network</span><span>₮ Payments</span><small className="landing-side-label">ACCESS</small><span>◎ Hotspots</span><span>▣ Packages</span><span>◈ Vouchers</span></aside>
          <div className="landing-product-main">
            <div className="landing-preview-head"><div><small>CONTROL PLANE PREVIEW</small><h3>Operational context</h3></div><span>LIVE DATA AFTER SIGN-IN</span></div>
            <div className="landing-preview-kpis"><div><small>SESSION STATE</small><strong>Observed</strong><em>Live customer access</em></div><div><small>PAYMENT STATE</small><strong>Verified</strong><em>Provider transaction flow</em></div><div><small>NETWORK STATE</small><strong>Observed</strong><em>Router connectivity</em></div></div>
            <div className="landing-preview-grid"><div className="landing-preview-panel"><small>OPERATING FLOW</small><h4>Customer → Payment → Access</h4><div className="landing-flow"><span>Customer</span><b>→</b><span>Package</span><b>→</b><span>Payment</span><b>→</b><span>Internet</span></div></div><div className="landing-preview-panel"><small>OPERATIONAL EVIDENCE</small><h4>One lifecycle, one trace</h4><div className="landing-site-row"><span><i/>Customer identity</span><b>Domain state</b></div><div className="landing-site-row"><span><i/>Payment verification</span><b>Financial state</b></div><div className="landing-site-row attention"><span><i/>Network session</span><b>Runtime state</b></div></div></div>
            <div className="landing-preview-note"><span>PRODUCT PREVIEW</span><b>Connect actual network and data after sign-in.</b></div>
          </div>
        </div>
      </div>
    </section>

    <section id="platform" className="landing-section"><div className="landing-label">01 / THE PLATFORM</div><div className="landing-section-head"><h2>From the first customer<br/><span>to the whole network.</span></h2><p>The commercial side and network side live in the same operational system, with shared customer, tenant and access foundations.</p></div><div className="landing-pillar-grid">{pillars.map(([n,t,d])=><article key={n}><small>{n}</small><h3>{t}</h3><p>{d}</p></article>)}</div></section>

    <section id="packages" className="landing-package-section"><div className="landing-section-inner"><div className="landing-label">02 / ACCESS PACKAGES</div><div className="landing-section-head"><h2>Let customers choose.<br/><span>Let your rules decide.</span></h2><p>Build hourly, daily, weekly or custom access packages. Prices, duration, bandwidth and policies remain under your control.</p></div><div className="landing-package-card"><div className="landing-package-head"><div><small>JASLYN NET ACCESS</small><h3>Choose a package</h3></div><span>CONFIGURABLE</span></div><div className="landing-package-options">{packages.map(([name,sub,desc],i)=><Link href="/packages" className={i===0?'selected':''} key={name}><span><b>{name}</b><small>{sub}</small></span><em>{desc}</em><strong>Configure →</strong></Link>)}</div><div className="landing-package-pay"><div><span>Selected service</span><b>Customer access package</b></div><Link href="/purchases">Continue to payment →</Link></div></div></div></section>

<section id="workflow" className="landing-section landing-workflow"><div className="landing-label">02 / HOW IT WORKS</div><div className="landing-section-head"><h2>A simple operating loop.<br/><span>A serious network underneath.</span></h2><p>Connect infrastructure, configure services, sell access and operate the resulting network from the same place.</p></div><div className="landing-workflow-line">{[['01','Connect','Add locations, routers and access infrastructure.'],['02','Configure','Create packages, rules and vouchers.'],['03','Sell','Customers purchase the configured service.'],['04','Operate','Track sessions, payments and network state.']].map(([n,t,d],i)=><div key={n} className="landing-step"><span>{n}</span><b>{t}</b><p>{d}</p></div>)}</div></section>

    <section id="network" className="landing-network"><div><div className="landing-label">03 / NETWORK + BILLING</div><h2>Your network is infrastructure.<br/><span>Your billing is operations.</span></h2></div><div><p>JASLYN NET connects customer access to the infrastructure that delivers it while keeping operational data in one control plane.</p><div className="landing-checks"><span>✓ Customers & service lifecycle</span><span>✓ Packages & prepaid access</span><span>✓ Sessions & usage</span><span>✓ Routers & locations</span><span>✓ Payment records</span><span>✓ RADIUS / AAA workflows</span></div></div></section>

    <section className="landing-hardware"><div className="landing-section-inner"><div className="landing-label">05 / HARDWARE & AAA</div><div className="landing-section-head"><h2>Use the infrastructure<br/><span>you already have.</span></h2><p>JASLYN NET combines native controller/API paths with standard RADIUS so the network layer can remain vendor-aware without becoming vendor-locked.</p></div><div className="landing-hardware-grid">{hardware.map(([vendor,protocol,mode])=><article key={vendor}><div className="landing-hardware-mark">{vendor.split(/[ /]/)[0].slice(0,2).toUpperCase()}</div><div><h3>{vendor}</h3><p>{protocol}</p></div><span>{mode}</span></article>)}</div><div className="landing-hardware-note"><b>Integration model</b><span>Native API/controller</span><i>+</i><span>RADIUS / AAA</span><i>+</i><span>Gateway operations</span></div></div></section><section className="landing-proof"><div className="landing-section-inner"><div className="landing-proof-grid"><article><strong>01</strong><b>One control plane</b><span>Customers, packages, sessions, routers and payments share the same operational context.</span></article><article><strong>02</strong><b>Payment-aware access</b><span>Verified payment events can synchronize purchases, grants and customer service state.</span></article><article><strong>03</strong><b>Vendor-aware networking</b><span>Native integrations and standard RADIUS work together around your network.</span></article><article><strong>04</strong><b>Operational visibility</b><span>Sessions, incidents, audit events and network health remain part of the same product.</span></article></div></div></section>
<section id="modules" className="landing-section"><div className="landing-label">04 / OPERATING MODULES</div><div className="landing-section-head"><h2>One product language.<br/><span>Every operational domain.</span></h2><p>Each module follows the same visual and operational language instead of becoming another isolated mini-application.</p></div><div className="landing-module-grid">{modules.map(([t,d],i)=><article key={t}><small>{String(i+1).padStart(2,'0')}</small><h3>{t}</h3><p>{d}</p></article>)}</div></section>

    <section id="pricing" className="landing-pricing"><div className="landing-section-inner"><div className="landing-label">07 / PRICING</div><div className="landing-section-head"><h2>A plan that grows<br/><span>with the network.</span></h2><p>Keep commercial terms configurable instead of hard-coding a fixed pricing model into the product.</p></div><div className="landing-pricing-grid">{pricing.map(([name,sub,desc,features],i)=><article className={i===1?'featured':''} key={name}>{i===1&&<span className="landing-pricing-badge">OPERATOR</span>}<small>{sub}</small><h3>{name}</h3><p>{desc}</p><div>{(features as string[]).map(f=><span key={f}>✓ {f}</span>)}</div><Link href="/login">{i===0?'Start in console':'Configure plan'} →</Link></article>)}</div></div></section><section className="landing-why"><div className="landing-section-inner"><div className="landing-label">08 / WHY JASLYN NET</div><div className="landing-why-grid"><div><h2>Keep the network and its commercial state in <span>one operational view.</span></h2><p>JASLYN NET is a WiFi billing and network operations platform. Payment providers remain provider-specific while purchases, access, accounting and network state stay visible in the control plane.</p></div><div className="landing-why-list"><article><b>🔒</b><div><h3>Provider-specific payment flows</h3><p>Provider configuration and webhook verification stay separate from the catalog.</p></div></article><article><b>▥</b><div><h3>Access follows verified state</h3><p>Payment success can synchronize purchase status, access grants and service state.</p></div></article><article><b>◌</b><div><h3>Operations remain visible</h3><p>Sessions, network state, incidents and audit records stay in the same control plane.</p></div></article></div></div></div></section><section id="faq" className="landing-faq"><div className="landing-section-inner"><div className="landing-label">09 / FAQ</div><h2>Questions operators<br/><span>actually ask.</span></h2><div className="landing-faq-list">{faqs.map(([q,a])=><details key={q}><summary>{q}<b>+</b></summary><p>{a}</p></details>)}</div></div></section><section id="contact" className="landing-contact"><div className="landing-section-inner"><div className="landing-contact-card"><div><div className="landing-label">10 / CONTACT</div><h2>Get your network<br/><span>into the control plane.</span></h2><p>Questions about routers, RADIUS, billing, payments or deployment? Start from the console and keep the operational context in one place.</p><div className="landing-contact-actions"><a href="mailto:support@jaslyn.net">Email support</a><Link href="/login">Open console →</Link></div></div><div className="landing-contact-form"><label>Name<input placeholder="Your name"/></label><label>Email<input type="email" placeholder="Your email"/></label><label>How can we help?<textarea rows={4} placeholder="Tell us what you are running and what you need."/></label><a href="mailto:support@jaslyn.net?subject=JASLYN%20NET%20Support">Send message</a></div></div></div></section>
<section className="landing-final"><div className="landing-label">05 / START OPERATING</div><h2>Your network is already complex.<br/><em>Your software should not be.</em></h2><p>Move billing, customers, payments and network operations into one source of operational truth.</p><Link href="/login" className="landing-primary">Open JASLYN NET Console ↗</Link></section>

    <footer className="landing-footer"><Link href="/" className="landing-logo"><span><img src="/brand/jaslyn-net-mark.svg" alt="" /></span><b>JASLYN NET</b></Link><p>The operating platform for connected businesses.</p><small>© 2026 JASLYN NET. Built for connected operations.</small></footer>
  </main>;
}
