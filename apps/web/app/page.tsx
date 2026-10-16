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
    <div className="lp-visual lp-topology-visual" aria-label="Illustrative Jaslyn Net network topology and operations preview">
      <div className="lp-visual-top"><div className="lp-window-dots"><i /><i /><i /></div><span>JASLYN NET / NETWORK INTELLIGENCE</span><b>ILLUSTRATIVE VIEW</b></div>
      <div className="lp-topology-shell">
        <div className="lp-topology-rail">
          <div className="lp-topology-mark">J<span>·</span></div>
          <span className="active">⌘</span><span>⌁</span><span>◎</span><span>⇄</span><span>◷</span>
          <div className="lp-topology-avatar">JN</div>
        </div>
        <div className="lp-topology-main">
          <div className="lp-topology-header"><div><small>NETWORK CONTROL PLANE <span> / CONCEPT</span></small><h3>One view. Connected decisions.</h3></div><span className="lp-topology-filter">ALL SITES <b>⌄</b></span></div>
          <div className="lp-topology-summary">
            <div><span>NETWORK SITES</span><b>Multi-site view</b><small>Sites · uplinks · edge devices</small></div>
            <div><span>SERVICE DELIVERY</span><b>Customer to access</b><small>Plans · AAA · policy</small></div>
            <div><span>OPERATIONS</span><b>Events with context</b><small>Changes · incidents · audit</small></div>
          </div>
          <div className="lp-topology-map">
            <div className="lp-map-title"><div><small>ILLUSTRATIVE TOPOLOGY</small><b>How the pieces relate</b></div><span><i /> Conceptual connections</span></div>
            <svg className="lp-network-svg" viewBox="0 0 620 245" role="img" aria-label="Conceptual network map connecting internet, core, sites, access points and subscribers">
              <defs><linearGradient id="lpLine" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#91a7ff"/><stop offset="100%" stopColor="#8ee7db"/></linearGradient></defs>
              <g fill="none" stroke="url(#lpLine)" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="4 5">
                <path d="M310 43 V82"/><path d="M310 112 L155 151"/><path d="M310 112 L465 151"/><path d="M155 181 L70 213"/><path d="M155 181 L220 213"/><path d="M465 181 L400 213"/><path d="M465 181 L550 213"/>
              </g>
              <g fill="#fff" stroke="#d6e0ef" strokeWidth="1.2">
                <rect x="250" y="9" width="120" height="34" rx="8"/><rect x="244" y="82" width="132" height="32" rx="8"/><rect x="92" y="151" width="126" height="30" rx="8"/><rect x="402" y="151" width="126" height="30" rx="8"/>
                <rect x="24" y="213" width="92" height="25" rx="6"/><rect x="174" y="213" width="92" height="25" rx="6"/><rect x="354" y="213" width="92" height="25" rx="6"/><rect x="504" y="213" width="92" height="25" rx="6"/>
              </g>
              <g fill="#243b5a" fontSize="10" fontWeight="700" textAnchor="middle">
                <text x="310" y="30">Internet / upstream</text><text x="310" y="102">Core &amp; policy</text><text x="155" y="169">Site / region A</text><text x="465" y="169">Site / region B</text>
                <text x="70" y="229">Access point</text><text x="220" y="229">Subscribers</text><text x="400" y="229">Router / CPE</text><text x="550" y="229">Subscribers</text>
              </g>
              <g fill="#4e6cff" stroke="#fff" strokeWidth="2"><circle cx="310" cy="60" r="4"/><circle cx="310" cy="130" r="4"/><circle cx="155" cy="195" r="4"/><circle cx="465" cy="195" r="4"/></g>
            </svg>
          </div>
          <div className="lp-topology-bottom"><span><i /> CUSTOMER</span><span>PAYMENT</span><span>ACCESS POLICY</span><span>NETWORK</span><b>Trace the relationship →</b></div>
        </div>
      </div>
      <div className="lp-topology-disclaimer"><span>CONCEPTUAL PRODUCT PREVIEW</span><span>No live telemetry or customer data shown</span></div>
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
