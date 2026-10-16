import Link from 'next/link';
import LandingNav from './landing-nav';
import SiteFooter from './site-footer';

const capabilities = [
  { n: '01', title: 'Sell access', copy: 'Publish Wi-Fi packages, issue vouchers, manage subscriptions and keep customer purchases together.', tags: 'Packages · Vouchers · Billing' },
  { n: '02', title: 'Verify payments', copy: 'Connect payment events to orders and reconcile what was paid before service access changes.', tags: 'Payments · Reconciliation · Receipts' },
  { n: '03', title: 'Control connectivity', copy: 'Coordinate subscribers, access policy, sessions, routers and incidents from one operating view.', tags: 'RADIUS · Sessions · Network' },
];

const modules = [
  ['Customer management', 'Profiles, service status and subscriber lifecycle', '/customers'],
  ['Wi-Fi billing', 'Packages, subscriptions, invoices and credits', '/packages'],
  ['Hotspot & vouchers', 'Captive portal, prepaid access and expiry', '/vouchers'],
  ['Payments', 'Transactions, refunds and reconciliation', '/payments'],
  ['Network operations', 'Routers, sites, sessions and incidents', '/network'],
  ['Security & audit', 'Permissions, activity history and accountability', '/audit'],
];

const vendors = ['MikroTik', 'UniFi', 'Omada', 'Cambium', 'Cisco Meraki', 'Aruba', 'Grandstream', 'Ruckus', 'Teltonika', 'Peplink', 'pfSense / OPNsense', 'FreeRADIUS'];

function Arrow() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M4 10h11M10 5l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ProductMockup() {
  return (
    <div className="jn2-product" aria-label="Illustrative JASLYN NET product interface">
      <div className="jn2-appbar">
        <div className="jn2-appbrand"><span className="jn2-mark">J</span><span>JASLYN <b>NET</b></span></div>
        <div className="jn2-workspace">Operations workspace <span>DEMO VIEW</span></div>
        <div className="jn2-avatar">OP</div>
      </div>
      <div className="jn2-appbody">
        <aside className="jn2-sidebar">
          <small>WORKSPACE</small>
          <div className="jn2-side-active"><span>◫</span> Overview</div>
          <div><span>◉</span> Customers</div>
          <div><span>▤</span> Packages & billing</div>
          <div><span>⌁</span> Network</div>
          <div><span>↔</span> Payments</div>
          <div><span>◷</span> Incidents</div>
          <div className="jn2-sidebar-bottom"><span className="jn2-green-dot" /> Illustrative interface</div>
        </aside>
        <section className="jn2-dashboard">
          <div className="jn2-dashhead"><div><small>OVERVIEW</small><h3>Good morning, operator</h3><p>A connected view of customer, payment and network workflows.</p></div><span className="jn2-demo-pill">SAMPLE DATA</span></div>
          <div className="jn2-statrow">
            <article><small>SUBSCRIBER FLOW</small><strong>Customers</strong><span>Profiles & service status</span></article>
            <article><small>COMMERCIAL</small><strong>Payments</strong><span>Verification & reconciliation</span></article>
            <article><small>CONNECTIVITY</small><strong>Network</strong><span>Sessions & access policy</span></article>
          </div>
          <div className="jn2-flowcard">
            <div className="jn2-flowtitle"><div><small>THE CONNECTED WORKFLOW</small><h4>From purchase to connectivity</h4></div><span>EXAMPLE</span></div>
            <div className="jn2-flowsteps">
              <div><i>01</i><b>Customer</b><small>Subscriber record</small></div><Arrow />
              <div><i>02</i><b>Purchase</b><small>Package & invoice</small></div><Arrow />
              <div><i>03</i><b>Payment</b><small>Verified event</small></div><Arrow />
              <div><i>04</i><b>Access</b><small>Policy & session</small></div>
            </div>
          </div>
          <div className="jn2-bottomrow">
            <div><small>OPERATING PRINCIPLE</small><b>One traceable customer journey</b><span>Commercial state informs access workflows.</span></div>
            <div className="jn2-miniicon">↗</div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="landing jn-landing">
      <LandingNav />
      <section className="jn2-hero">
        <div className="jn2-hero-grid" aria-hidden="true" />
        <div className="jn2-hero-copy">
          <div className="jn2-eyebrow"><span /> THE OPERATING PLATFORM FOR CONNECTIVITY</div>
          <h1>Run your network.<br /><em>Not a pile of tools.</em></h1>
          <p className="jn2-lead">JASLYN NET brings Wi-Fi billing, subscriber access, payments and network operations into one connected workspace for ISPs, hotspot operators and managed networks.</p>
          <div className="jn2-actions">
            <Link href="/register" className="jn2-primary">Create your workspace <Arrow /></Link>
            <Link href="/platform" className="jn2-secondary">Explore the platform <Arrow /></Link>
          </div>
          <div className="jn2-trustline"><span>BUILT AROUND YOUR WORKFLOW</span><i /> Customers <i /> Payments <i /> Access <i /> Network</div>
        </div>
        <div className="jn2-hero-visual"><ProductMockup /><div className="jn2-visual-caption"><span className="jn2-green-dot" /> Product concept preview <span>·</span> Sample interface, not live customer data</div></div>
      </section>

      <section className="jn2-audience">
        <div><small>FOR THE TEAMS THAT KEEP PEOPLE CONNECTED</small><div className="jn2-audience-items"><span>Wi-Fi & hotspot operators</span><span>ISPs & WISPs</span><span>Managed networks</span><span>Multi-site teams</span></div></div>
      </section>

      <section className="jn2-section jn2-workflow" id="how-it-works">
        <div className="jn2-section-intro"><small>ONE CONNECTED WORKFLOW</small><h2>From the first sale<br />to the live session.</h2><p>Customer, commerce and connectivity are linked operational concerns. Your tools should reflect that.</p></div>
        <div className="jn2-capabilities">{capabilities.map(item => <article key={item.n}><div className="jn2-cap-top"><span>{item.n}</span><Arrow /></div><h3>{item.title}</h3><p>{item.copy}</p><small>{item.tags}</small></article>)}</div>
      </section>

      <section className="jn2-platform" id="features">
        <div className="jn2-section jn2-platform-inner">
          <div className="jn2-platform-heading"><small>THE PLATFORM</small><h2>Everything important,<br /><em>working together.</em></h2><p>One operational model across the customer lifecycle, commercial workflows and network infrastructure—without hiding which integrations need configuration.</p><Link href="/platform" className="jn2-textlink">Explore platform capabilities <Arrow /></Link></div>
          <div className="jn2-modules">{modules.map(([title, copy, href], i) => <Link href={href} key={title} className="jn2-module"><span>0{i + 1}</span><div><b>{title}</b><small>{copy}</small></div><Arrow /></Link>)}</div>
        </div>
      </section>

      <section className="jn2-section jn2-integrations" id="integrations">
        <div className="jn2-integrations-head"><div><small>WORK WITH YOUR INFRASTRUCTURE</small><h2>Built for mixed-vendor networks.</h2></div><p>Explore the integration approach and check adapter-specific capabilities before planning a production rollout.</p></div>
        <div className="jn2-vendor-list">{vendors.map((vendor, i) => <span key={vendor}><i>{String(i + 1).padStart(2, '0')}</i>{vendor}</span>)}</div>
        <Link href="/integrations" className="jn2-textlink">View integration details <Arrow /></Link>
      </section>

      <section className="jn2-section jn2-pricing" id="pricing">
        <div className="jn2-section-intro"><small>PLANS THAT FIT YOUR OPERATION</small><h2>Start with your needs.<br />Scale with your network.</h2><p>Choose a path based on your operation. Review the current commercial terms with the team before subscribing.</p></div>
        <div className="jn2-price-grid">
          <article><small>GET FAMILIAR</small><h3>Explore</h3><p>Review platform workflows and see how the modules fit together.</p><ul><li>Platform overview</li><li>Feature and integration review</li><li>Guided next steps</li></ul><Link href="/platform" className="jn2-secondary">Explore platform <Arrow /></Link></article>
          <article className="jn2-price-featured"><small>FOR OPERATORS</small><h3>Launch</h3><p>Discuss setup for your ISP, hotspot or managed network operation.</p><ul><li>Operational requirements review</li><li>Billing and access workflow planning</li><li>Integration readiness discussion</li></ul><Link href="/register" className="jn2-primary">Create workspace <Arrow /></Link></article>
          <article><small>COMPLEX NETWORKS</small><h3>Scale</h3><p>Plan a rollout across teams, locations and network infrastructure.</p><ul><li>Multi-site workflow review</li><li>Security and audit requirements</li><li>Deployment planning</li></ul><Link href="/faq" className="jn2-secondary">Discuss requirements <Arrow /></Link></article>
        </div>
        <p className="jn2-pricing-note">Pricing is not displayed here because current, verified subscription rates were not available to confirm.</p>
      </section>

      <section className="jn2-cta">
        <div><small>JASLYN NET</small><h2>Make your operation<br />easier to understand.</h2><p>Explore the platform, see how the pieces connect, and decide whether it fits your operation.</p></div>
        <div className="jn2-cta-actions"><Link href="/register" className="jn2-primary">Get started <Arrow /></Link><Link href="/faq" className="jn2-cta-link">Read common questions <Arrow /></Link></div>
      </section>
      <SiteFooter />
    </main>
  );
}
