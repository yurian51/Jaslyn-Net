import Link from 'next/link';
import LandingNav from './landing-nav';
import SiteFooter from './site-footer';

const featureCards = [
  { number: '01', icon: '◎', title: 'Subscribers & access', text: 'Manage customer profiles, service status, packages and the journey from signup to connectivity.', href: '/product', tag: 'CUSTOMER LIFECYCLE' },
  { number: '02', icon: '↗', title: 'Billing & payments', text: 'Keep packages, invoices, payment events and reconciliation in one traceable workflow.', href: '/platform', tag: 'COMMERCIAL CONTROL' },
  { number: '03', icon: '⌁', title: 'Network operations', text: 'Bring routers, sessions, sites and incidents into a clearer operating picture.', href: '/operations', tag: 'NETWORK VISIBILITY' },
  { number: '04', icon: '⤳', title: 'Automation workflows', text: 'Plan event-driven workflows with triggers, approvals and execution history as integrations become available.', href: '/architecture', tag: 'CONTROLLED AUTOMATION' },
  { number: '05', icon: '⛓', title: 'Integrations', text: 'Understand vendor and service integrations, including which capabilities need setup and validation.', href: '/integrations', tag: 'CONNECTED SYSTEMS' },
  { number: '06', icon: '◈', title: 'Security & accountability', text: 'Design operations around permissions, auditable actions and clear ownership.', href: '/architecture', tag: 'GOVERNANCE' },
];

const steps = [
  { n: '01', title: 'Customer', text: 'A subscriber profile and service context.' },
  { n: '02', title: 'Package', text: 'A clear offer, plan or voucher.' },
  { n: '03', title: 'Payment', text: 'A payment event that can be verified.' },
  { n: '04', title: 'Access', text: 'Service access managed by configured policy.' },
];

const vendors = ['MikroTik', 'UniFi', 'TP-Link Omada', 'Cambium', 'Cisco', 'Aruba', 'Grandstream', 'Ruckus', 'FreeRADIUS'];

function Arrow() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M4 10h11M10 5l5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function NetworkPreview() {
  return (
    <div className="lp-visual" aria-label="Illustrative Jaslyn Net interface preview">
      <div className="lp-visual-top"><div className="lp-window-dots"><i /><i /><i /></div><span>JASLYN NET / OPERATIONS OVERVIEW</span><b>CONCEPT PREVIEW</b></div>
      <div className="lp-visual-body">
        <aside className="lp-preview-sidebar"><div className="lp-preview-brand"><span>J</span><b>JASLYN <em>NET</em></b></div><small>WORKSPACE</small><div className="is-active">◫ &nbsp; Overview</div><div>◎ &nbsp; Subscribers</div><div>▤ &nbsp; Packages & billing</div><div>⌁ &nbsp; Network</div><div>↔ &nbsp; Payments</div><div>◷ &nbsp; Activity & audit</div><div className="lp-sidebar-foot"><span /> Illustrative data only</div></aside>
        <div className="lp-preview-main">
          <div className="lp-preview-title"><div><small>OPERATOR WORKSPACE</small><h3>See the whole workflow.</h3><p>A connected view of the work behind reliable access.</p></div><span>DEMO</span></div>
          <div className="lp-preview-metrics"><div><small>SUBSCRIBERS</small><b>Customer records</b><span>Profiles · Service status</span></div><div><small>COMMERCE</small><b>Billing & payments</b><span>Orders · Reconciliation</span></div><div><small>CONNECTIVITY</small><b>Network operations</b><span>Routers · Sessions</span></div></div>
          <div className="lp-preview-flow"><div className="lp-flow-head"><div><small>CONNECTED JOURNEY</small><b>From purchase to access</b></div><span>EXAMPLE WORKFLOW</span></div><div className="lp-flow-nodes">{steps.map((step, i) => <div key={step.n} className="lp-flow-node"><i>{step.n}</i><b>{step.title}</b><small>{i === 0 ? 'Subscriber' : i === 1 ? 'Offer' : i === 2 ? 'Verified event' : 'Policy-based'}</small></div>)}</div></div>
          <div className="lp-preview-foot"><span><i /> Clear operational context</span><span>Not a live system status</span></div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="lp-page">
      <LandingNav />
      <section className="lp-hero">
        <div className="lp-hero-orb lp-orb-one" aria-hidden="true" /><div className="lp-hero-orb lp-orb-two" aria-hidden="true" />
        <div className="lp-hero-inner">
          <div className="lp-hero-copy">
            <div className="lp-kicker"><span /> CONNECTIVITY OPERATIONS, CONNECTED</div>
            <h1>Your network business.<br /><em>One clearer way to run it.</em></h1>
            <p>JASLYN NET brings Wi-Fi packages, subscriber access, billing, payments and network operations into one connected operating platform for ISPs, hotspot operators and managed networks.</p>
            <div className="lp-hero-actions"><Link href="/register" className="lp-button lp-button-primary">Explore getting started <Arrow /></Link><Link href="/platform" className="lp-button lp-button-quiet">Discover the platform</Link></div>
            <div className="lp-proofline"><span>BUILT FOR REAL OPERATIONS</span><i /> Customers <i /> Payments <i /> Access <i /> Network</div>
          </div>
          <div className="lp-hero-art"><NetworkPreview /><div className="lp-preview-caption"><span /> Illustrative product preview <span className="lp-caption-separator">—</span> no live customer data</div></div>
        </div>
        <div className="lp-hero-bottom"><span>FOR THE TEAMS THAT KEEP PEOPLE CONNECTED</span><div><b>Wi-Fi & hotspot operators</b><b>ISPs & WISPs</b><b>Managed networks</b><b>Multi-site teams</b></div></div>
      </section>

      <section className="lp-intro lp-wrap">
        <div><span className="lp-section-label">THE CHALLENGE</span><h2>Less tool-switching.<br /><em>More operational clarity.</em></h2></div>
        <div className="lp-intro-copy"><p>Running connectivity means more than keeping equipment online. Customer records, packages, payment events, access policy and network incidents all affect one another.</p><p>JASLYN NET is designed to bring those workflows into a shared operating picture—while making integration readiness and operational state explicit.</p><Link href="/architecture" className="lp-inline-link">Understand the approach <Arrow /></Link></div>
      </section>

      <section className="lp-features-section">
        <div className="lp-wrap">
          <div className="lp-section-heading"><div><span className="lp-section-label">ONE PLATFORM, CONNECTED WORKFLOWS</span><h2>The moving parts<br />belong together.</h2></div><p>Explore the core areas of the platform and how they support the work of running an ISP or Wi-Fi operation.</p></div>
          <div className="lp-feature-grid">{featureCards.map(card => <Link href={card.href} key={card.number} className="lp-feature-card"><div className="lp-feature-top"><span>{card.number}</span><i>{card.icon}</i></div><small>{card.tag}</small><h3>{card.title}</h3><p>{card.text}</p><span className="lp-feature-link">Explore capability <Arrow /></span></Link>)}</div>
        </div>
      </section>

      <section className="lp-journey">
        <div className="lp-wrap">
          <div className="lp-section-heading lp-journey-heading"><div><span className="lp-section-label">A CUSTOMER JOURNEY, NOT SILOS</span><h2>From first click<br />to connected customer.</h2></div><p>Make the relationship between customer, commerce and connectivity easier to follow. Actual service activation depends on configured integrations and policy.</p></div>
          <div className="lp-journey-track">{steps.map((step, i) => <div className="lp-journey-step" key={step.n}><span>{step.n}</span><div className="lp-journey-icon">{['◎', '▤', '↗', '⌁'][i]}</div><h3>{step.title}</h3><p>{step.text}</p>{i < steps.length - 1 && <span className="lp-journey-arrow"><Arrow /></span>}</div>)}</div>
          <div className="lp-journey-note"><span>01 / OPERATING PRINCIPLE</span><p>Each step should be traceable, with ownership and state clear enough for teams to act with confidence.</p><Link href="/operations">Explore operations <Arrow /></Link></div>
        </div>
      </section>

      <section className="lp-integrations lp-wrap">
        <div className="lp-integration-copy"><span className="lp-section-label">BUILT FOR MIXED-VENDOR NETWORKS</span><h2>Your infrastructure.<br /><em>Your integration path.</em></h2><p>Review the vendor landscape and confirm adapter-specific capabilities before a production rollout. A name in the ecosystem is not a blanket promise that every feature is ready out of the box.</p><Link href="/integrations" className="lp-button lp-button-dark">Explore integrations <Arrow /></Link></div>
        <div className="lp-vendor-panel"><div className="lp-vendor-panel-head"><span>NETWORK & AAA ECOSYSTEM</span><span>CAPABILITY VARIES BY ADAPTER</span></div><div className="lp-vendor-grid">{vendors.map((vendor, i) => <div key={vendor}><i>{String(i + 1).padStart(2, '0')}</i><b>{vendor}</b><span>Explore compatibility ↗</span></div>)}</div><p>Compatibility and available actions should be validated per vendor, model, firmware and deployment.</p></div>
      </section>

      <section className="lp-governance"><div className="lp-wrap lp-governance-inner"><div><span className="lp-section-label">BUILT AROUND CONTROL</span><h2>Automation should be<br /><em>clear, accountable and safe.</em></h2><p>Understand the architecture, operational boundaries and approval points before connecting state-changing actions to live infrastructure.</p><Link href="/architecture" className="lp-inline-link">Read the architecture <Arrow /></Link></div><div className="lp-governance-list"><div><span>01</span><div><b>Know what is configured</b><p>Separate supported actions from integrations that still need setup.</p></div></div><div><span>02</span><div><b>Keep an accountable trail</b><p>Make access, approvals and operational changes traceable.</p></div></div><div><span>03</span><div><b>Verify before you rely on it</b><p>Use real checks and evidence—not decorative green indicators.</p></div></div></div></div></section>

      <section className="lp-final-cta"><div className="lp-final-glow" aria-hidden="true" /><div className="lp-final-content"><span className="lp-section-label">JASLYN NET · CONNECT. CONTROL. GROW.</span><h2>Bring your operation<br />into clearer view.</h2><p>Explore the platform, review the integration approach and decide on the right next step for your network business.</p><div><Link href="/register" className="lp-button lp-button-primary">Get started <Arrow /></Link><Link href="/faq" className="lp-final-link">Read frequently asked questions ↗</Link></div></div></section>
      <SiteFooter />
    </main>
  );
}
