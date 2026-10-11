import Link from 'next/link';
import LandingNav from './landing-nav';
import BrandLogo from './brand-logo';

const operatingLayers = [
  ['01', 'Subscriber', 'Customers, service state, devices and the lifecycle behind every connection.'],
  ['02', 'Commerce', 'Packages, subscriptions, invoices, purchases and payment-aware workflows.'],
  ['03', 'Entitlement', 'The policy layer that turns verified commercial state into controlled access.'],
  ['04', 'Network', 'Routers, gateways, RADIUS, IPAM, sessions and multi-location infrastructure.'],
  ['05', 'Operations', 'Incidents, commands, audit, visibility and the evidence needed to run the system.'],
];

const operatingScenarios = [
  ['WiFi operators', 'Sell prepaid access, manage captive portal journeys, control vouchers and understand sessions without stitching together separate tools.', 'Hotspot · Vouchers · Payments'],
  ['ISPs & WISPs', 'Keep subscribers, packages, AAA, network devices and service state connected as your deployment grows across locations.', 'PPPoE · RADIUS · IPAM'],
  ['Multi-location teams', 'Operate sites, routers, customer services and incidents from one tenant-aware operational context.', 'Locations · Network · Incidents'],
  ['Managed networks', 'Give operations teams a shared control plane for customers, infrastructure, access policy and accountability.', 'Operations · Audit · Commands'],
];

const integrations = [
  { vendor: 'MikroTik', protocol: 'RouterOS REST + RADIUS', mode: 'Router / AAA', logos: ['/integrations/mikrotik.svg'] },
  { vendor: 'Ubiquiti UniFi', protocol: 'Controller API + RADIUS', mode: 'Controller', logos: ['/integrations/ubiquiti.svg'] },
  { vendor: 'TP-Link Omada', protocol: 'Controller API + RADIUS', mode: 'Controller', logos: ['/integrations/tplink.svg'] },
  { vendor: 'Cambium Networks', protocol: 'cnMaestro + RADIUS', mode: 'Controller', logos: ['/integrations/cambium-networks.svg'] },
  { vendor: 'Cisco Meraki', protocol: 'Dashboard API + RADIUS', mode: 'Cloud API', logos: ['/integrations/meraki.svg'] },
  { vendor: 'Aruba Networks', protocol: 'Central API + RADIUS', mode: 'Cloud API', logos: ['/integrations/aruba.svg'] },
  { vendor: 'Grandstream', protocol: 'GWN API + RADIUS', mode: 'Controller', logos: ['/integrations/grandstream.svg'] },
  { vendor: 'Ruijie / Reyee', protocol: 'Cloud API + RADIUS', mode: 'Cloud API', logos: ['/integrations/ruijie-reyee.svg'] },
  { vendor: 'Ruckus Networks', protocol: 'SmartZone API + RADIUS', mode: 'Controller', logos: ['/integrations/ruckus.svg'] },
  { vendor: 'OpenWrt', protocol: 'ubus + RADIUS', mode: 'Gateway', logos: ['/integrations/openwrt.svg'] },
  { vendor: 'Teltonika Networks', protocol: 'RMS API + RADIUS', mode: 'Gateway', logos: ['/integrations/teltonika.svg'] },
  { vendor: 'Peplink', protocol: 'InControl API + RADIUS', mode: 'WAN', logos: ['/integrations/peplink.svg'] },
  { vendor: 'pfSense / OPNsense', protocol: 'Gateway API + RADIUS', mode: 'Gateway', logos: ['/integrations/pfsense.svg', '/integrations/opnsense.svg'] },
  { vendor: 'FreeRADIUS', protocol: 'Vendor-neutral AAA', mode: 'AAA', logos: ['/integrations/freeradius.svg'] },
];

const modules = [
  ['Billing', 'Package catalog, subscriptions, invoices and revenue workflows.'],
  ['Customers', 'Customer profiles, devices and service lifecycle.'],
  ['Hotspot', 'Captive portal, access policies and customer onboarding.'],
  ['Vouchers', 'Prepaid access creation, activation, expiry and control.'],
  ['Sessions', 'Live connections, usage context and session history.'],
  ['Network', 'Locations, routers, infrastructure and operational state.'],
  ['Payments', 'Transactions, verification and reconciliation.'],
  ['RADIUS / AAA', 'Authentication, authorization and accounting workflows.'],
  ['IPAM', 'Address pools, allocations and network inventory.'],
  ['Incidents', 'Connectivity issues, correlation and operational follow-up.'],
  ['WAN & Load Balancing', 'Multi-WAN policy, path control and traffic distribution.'],
  ['Audit & Security', 'Operational history, access accountability and security events.'],
];

const faqs = [
  ['What is JASLYN NET?', 'JASLYN NET is a connectivity and ISP operating system that brings customer, commercial, access and network operations into one control plane.'],
  ['Is the platform tied to one network vendor?', 'No. The architecture is designed around vendor adapters and standards such as RADIUS, allowing native controller/API integrations to coexist with vendor-neutral access workflows.'],
  ['Does the public website show live network data?', 'No. The public experience uses product concepts and workflow examples rather than fabricated operational numbers. Live workspace data belongs inside the authenticated console.'],
  ['How does payment-aware access work?', 'A verified payment event can update purchase state and, where configured, drive the entitlement and service state used by the access workflow.'],
  ['Can I operate more than one location?', 'The platform is designed around tenant-aware customers, services, network devices and operational state, making multi-location operations a first-class concern.'],
];

function ArrowIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="jn-arrow-icon">
      <path d="M3 8h9M8 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ProductPreview() {
  return (
    <div className="jn-preview-frame" aria-label="JASLYN NET console preview">
      <div className="jn-preview-topline">
        <div className="jn-window-dots" aria-hidden="true"><i /><i /><i /></div>
        <span>JASLYN NET / OPERATIONS</span>
        <b>PRODUCT PREVIEW</b>
      </div>

      <div className="jn-preview-body">
        <aside className="jn-preview-sidebar">
          <div className="jn-preview-brand">
            <BrandLogo alt="" />
            <span>JASLYN NET<small>OPERATIONS</small></span>
          </div>
          <small className="jn-preview-label">CONTROL PLANE</small>
          {['Overview', 'Customers', 'Sessions', 'Network', 'Payments'].map((item, index) => (
            <span key={item} className={index === 0 ? 'active' : ''}><i>{['◫', '◉', '◌', '⌁', '₮'][index]}</i>{item}</span>
          ))}
          <small className="jn-preview-label">ACCESS</small>
          {['Hotspot', 'Packages', 'Vouchers', 'RADIUS / AAA'].map(item => <span key={item}><i>·</i>{item}</span>)}
          <div className="jn-preview-sidebar-foot">
            <span className="jn-preview-example-dot" aria-hidden="true" /> Illustrative session
            <small>Example operator view</small>
          </div>
        </aside>

        <div className="jn-preview-content">
          <div className="jn-preview-heading">
            <div>
              <small>OPERATIONS OVERVIEW</small>
              <h3>Customer to connectivity</h3>
              <p>One operational context from purchase to active session.</p>
            </div>
            <span>ILLUSTRATIVE WORKSPACE</span>
          </div>

          <div className="jn-preview-metrics">
            <article><small>CUSTOMER</small><strong>Service state</strong><span>Example state</span></article>
            <article><small>PAYMENT</small><strong>Payment event</strong><span>Illustrative only</span></article>
            <article><small>NETWORK</small><strong>Access policy</strong><span>Example policy</span></article>
          </div>

          <div className="jn-preview-grid">
            <article className="jn-preview-panel jn-flow-panel">
              <div className="jn-panel-kicker">OPERATIONAL CHAIN</div>
              <h4>Commerce becomes access.</h4>
              <p>JASLYN NET keeps the state connected across the workflow.</p>
              <div className="jn-flow-chain">
                {['Customer', 'Service', 'Payment', 'Entitlement', 'Session'].map((step, index) => (
                  <div key={step} className="jn-flow-node">
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <b>{step}</b>
                    {index < 4 && <ArrowIcon />}
                  </div>
                ))}
              </div>
            </article>

            <article className="jn-preview-panel jn-health-panel">
              <div className="jn-panel-kicker">CONTROL LAYERS</div>
              <h4>Operational state</h4>
              {[
                ['Commercial', 'Workflow example', 'neutral'],
                ['Access', 'Policy example', 'neutral'],
                ['Network', 'Adapter-dependent', 'neutral'],
                ['Incidents', 'Workspace data only', 'neutral'],
              ].map(([label, state, kind]) => (
                <div className="jn-health-row" key={label}>
                  <span><i className={kind} />{label}</span><b>{state}</b>
                </div>
              ))}
            </article>
          </div>

          <div className="jn-preview-footer">
            <span>PRODUCT SURFACE</span>
            <b>Actual workspace data appears after authentication.</b>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="landing jn-landing">
      <LandingNav />

      <section className="jn-hero">
        <div className="jn-hero-copy">
          <div className="jn-eyebrow"><span /> CONNECTIVITY OPERATING SYSTEM</div>
          <h1>The control plane for <em>connected businesses.</em></h1>
          <p className="jn-hero-lead">
            JASLYN NET helps WiFi operators and ISPs manage customers, internet packages, payments, network access and day-to-day operations from one workspace.
          </p>
          <p className="jn-hero-plain">
            In simple terms: manage who buys internet, confirm their payment, control their access, and help your team see what is happening on the network.
          </p>
          <div className="jn-hero-actions">
            <Link href="/register" className="jn-btn jn-btn-primary">Create a workspace <ArrowIcon /></Link>
            <Link href="/platform" className="jn-btn jn-btn-secondary">Explore the platform</Link>
          </div>
          <div className="jn-hero-meta">
            <span>WiFi</span><i /><span>ISP</span><i /><span>RADIUS</span><i /><span>Billing</span><i /><span>Network operations</span>
          </div>
        </div>
        <div className="jn-hero-visual">
          <ProductPreview />
          <div className="jn-floating-card">
            <span className="jn-preview-example-dot" aria-hidden="true" />
            <div><small>OPERATING MODEL</small><b>Customer → Service → Access</b></div>
          </div>
        </div>
      </section>

      <section className="jn-proof-strip" aria-label="JASLYN NET product scope">
        <div><span>ONE CONNECTED OPERATING MODEL</span><b>Customer</b><b>Commerce</b><b>Entitlement</b><b>Network</b><b>Operations</b></div>
      </section>



      <section className="jn-outcomes" aria-labelledby="jn-outcomes-title">
        <div className="jn-outcomes-inner">
          <div className="jn-outcomes-heading">
            <small className="jn-kicker">DESIGNED FOR DAILY OPERATIONS</small>
            <h2 id="jn-outcomes-title">Less context switching.<br /><span>Clearer operational decisions.</span></h2>
            <p>Connect the commercial journey to the network workflow without pretending every adapter or payment path is already enabled.</p>
          </div>
          <div className="jn-outcomes-grid">
            <article><span>01 / SELL</span><div className="jn-outcome-icon" aria-hidden="true">↗</div><h3>Make access understandable</h3><p>Keep WiFi bundles, prices, validity, data allowances and device limits clear to customers before they buy.</p><Link href="/packages">Explore WiFi packages <ArrowIcon /></Link></article>
            <article><span>02 / CONTROL</span><div className="jn-outcome-icon" aria-hidden="true">⌁</div><h3>Connect purchase to service</h3><p>Model purchases, payment verification, access entitlement and session state as related parts of one customer lifecycle.</p><Link href="/architecture">See how it works <ArrowIcon /></Link></article>
            <article><span>03 / OPERATE</span><div className="jn-outcome-icon" aria-hidden="true">◎</div><h3>Work from evidence</h3><p>Bring network inventory, incidents, session context and audit history into the operator's decision-making process.</p><Link href="/operations">Explore operations <ArrowIcon /></Link></article>
          </div>
          <p className="jn-outcomes-note">Integration availability and payment automation depend on the configured adapter, provider and deployment.</p>
        </div>
      </section>

      <section id="platform" className="jn-section jn-platform">
        <div className="jn-section-head">
          <div>
            <small className="jn-kicker">01 / THE PLATFORM</small>
            <h2>Your network is distributed.<br /><span>Your operations should not be.</span></h2>
          </div>
          <p>
            Connectivity touches customers, products, payments, access rules, routers, sessions and incidents. JASLYN NET is designed so those domains can be operated as one connected system rather than a collection of isolated dashboards.
          </p>
        </div>

        <div className="jn-layer-grid">
          {operatingLayers.map(([number, title, copy]) => (
            <article key={number}>
              <small>{number}</small>
              <div><h3>{title}</h3><p>{copy}</p></div>
              <ArrowIcon />
            </article>
          ))}
        </div>
      </section>

      <section id="architecture" className="jn-architecture">
        <div className="jn-section jn-section-light">
          <div className="jn-section-head">
            <div>
              <small className="jn-kicker">02 / ARCHITECTURE</small>
              <h2>One workflow.<br /><span>Five connected layers.</span></h2>
            </div>
            <p>
              The product model follows the actual lifecycle of connectivity: who the customer is, what they purchased, what they are entitled to, how the network serves it and what operators need to see when something changes.
            </p>
          </div>

          <div className="jn-architecture-flow">
            <div className="jn-architecture-spine" />
            {[
              ['Subscriber', 'Identity, services, devices'],
              ['Commerce', 'Plans, purchases, payments'],
              ['Entitlement', 'Policy, access, expiry'],
              ['Network', 'Routers, AAA, IPAM, sessions'],
              ['Operations', 'Incidents, audit, commands'],
            ].map(([title, copy], index) => (
              <article key={title} className="jn-architecture-step">
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div><h3>{title}</h3><p>{copy}</p></div>
              </article>
            ))}
          </div>

          <div className="jn-architecture-caption">
            <span>DESIGNED AROUND OPERATING STATE</span>
            <b>Not a collection of disconnected admin pages.</b>
          </div>
        </div>
      </section>

      <section id="operations" className="jn-section jn-scenarios">
        <div className="jn-section-head">
          <div>
            <small className="jn-kicker">03 / OPERATING SCENARIOS</small>
            <h2>Built for the people<br /><span>who operate the connection.</span></h2>
          </div>
          <p>
            Different deployments have different operational pressures. The underlying control plane stays coherent while the workflows adapt to how the network is actually run.
          </p>
        </div>

        <div className="jn-scenario-grid">
          {operatingScenarios.map(([title, copy, tags], index) => (
            <article key={title}>
              <span className="jn-scenario-number">0{index + 1}</span>
              <div><h3>{title}</h3><p>{copy}</p></div>
              <small>{tags}</small>
            </article>
          ))}
        </div>
      </section>

      <section id="integrations" className="jn-integrations">
        <div className="jn-section">
          <div className="jn-section-head">
            <div>
              <small className="jn-kicker">04 / NETWORK ECOSYSTEM</small>
              <h2>Keep the infrastructure<br /><span>you already operate.</span></h2>
            </div>
            <p>
              JASLYN NET is designed around vendor adapters and standards. The integration path and supported operations depend on each adapter and deployment; confirm compatibility before planning a production cutover.
            </p>
          </div>

          <div className="jn-integration-grid">
            {integrations.map(({ vendor, protocol, mode, logos }) => (
              <article key={vendor}>
                <div className="jn-integration-brand" aria-hidden="true">
                  {logos.map((src) => (
                    <img
                      key={src}
                      className="jn-integration-logo"
                      src={src}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                  ))}
                </div>
                <div className="jn-integration-copy"><h3>{vendor}</h3><p>{protocol}</p></div>
                <small>{mode}</small>
              </article>
            ))}
          </div>

          <div className="jn-integration-note">
            <span>INTEGRATION MODEL</span>
            <b>Controller / API pathways</b><i>+</i><b>RADIUS / AAA</b><i>+</i><b>Gateway pathways</b>
          </div>
        </div>
      </section>

      <section id="modules" className="jn-section jn-module-section">
        <div className="jn-section-head">
          <div>
            <small className="jn-kicker">05 / PRODUCT SURFACE</small>
            <h2>Every operational domain.<br /><span>One product language.</span></h2>
          </div>
          <p>
            The module count matters less than the consistency between them. Every surface is expected to make the same operational state understandable to the people responsible for it.
          </p>
        </div>

        <div className="jn-module-grid">
          {modules.map(([title, copy], index) => (
            <article key={title}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
              <a href="/login" aria-label={"Open " + title + " in JASLYN NET"}>Open module <ArrowIcon /></a>
            </article>
          ))}
        </div>
      </section>

      <section className="jn-operations-band">
        <div className="jn-section">
          <div className="jn-operations-grid">
            <div>
              <small className="jn-kicker jn-kicker-inverse">06 / OPERATIONS</small>
              <h2>When connectivity changes, your team should see <span>why.</span></h2>
            </div>
            <div>
              <p>Operational work is not just adding routers. It is understanding service state, payment state, access state, session state, incidents and audit history together.</p>
              <div className="jn-ops-points">
                <span>✓ Incident correlation</span>
                <span>✓ Network commands</span>
                <span>✓ Session visibility</span>
                <span>✓ Security & audit</span>
                <span>✓ Multi-location context</span>
                <span>✓ Payment-aware access</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="commercial" className="jn-section jn-commercial">
        <div className="jn-section-head">
          <div>
            <small className="jn-kicker">07 / COMMERCIAL MODEL</small>
            <h2>Start with the workflow.<br /><span>Scale the deployment.</span></h2>
          </div>
          <p>
            Public pricing should describe real commercial terms, not invented numbers. JASLYN NET keeps plan, entitlement and deployment configuration separate so commercial decisions can evolve without changing the core network control plane.
          </p>
        </div>

        <div className="jn-commercial-grid">
          <article><small>START</small><h3>Single operation</h3><p>Core customer, access, package and network workflows for getting a connected operation under control.</p><Link href="/register">Create workspace <ArrowIcon /></Link></article>
          <article className="featured"><small>OPERATIONS</small><h3>Multi-location</h3><p>For teams operating more sites, services, devices and operational state from one workspace.</p><Link href="/register">Create workspace <ArrowIcon /></Link></article>
          <article><small>ENTERPRISE</small><h3>Infrastructure scale</h3><p>For deployment-specific integrations, operational controls and commercial terms that need closer configuration.</p><a href="mailto:support@jaslyn.net">Contact support <ArrowIcon /></a></article>
        </div>
      </section>

      <section id="faq" className="jn-faq">
        <div className="jn-section">
          <div className="jn-faq-grid">
            <div>
              <small className="jn-kicker jn-kicker-inverse">08 / FAQ</small>
              <h2>Questions operators<br /><span>actually ask.</span></h2>
              <p>Clear answers, no brochure fog.</p>
            </div>
            <div className="jn-faq-list">
              {faqs.map(([question, answer]) => (
                <details key={question}>
                  <summary>{question}<b>+</b></summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="jn-final-cta">
        <div className="jn-section">
          <small className="jn-kicker">09 / START OPERATING</small>
          <h2>Bring the network,<br /><em>the customer and the transaction together.</em></h2>
          <p>Explore the product model, verify the integrations your network needs, then create a workspace when you are ready to configure your operation.</p>
          <div className="jn-final-actions">
            <Link href="/register" className="jn-btn jn-btn-primary">Create a JASLYN NET workspace <ArrowIcon /></Link>
            <Link href="/login" className="jn-btn jn-btn-secondary">Sign in to the console</Link>
          </div>
        </div>
      </section>

      <footer className="jn-footer">
        <div>
          <Link href="/" className="jn-footer-brand">
            <BrandLogo alt="" loading="lazy" />
            <b>JASLYN NET</b>
          </Link>
          <p>A clearer operating model for WiFi, ISP and managed network teams.</p>
        </div>
        <nav aria-label="Footer">
          <Link href="/platform">Platform</Link>
          <Link href="/architecture">How it works</Link>
          <Link href="/operations">Operations</Link>
          <Link href="/integrations">Integrations</Link>
          <Link href="/faq">FAQ</Link>
        </nav>
        <div className="jn-footer-end">
          <Link href="/register">Create workspace</Link>
          <Link href="/login">Sign in</Link>
          <small>© 2026 JASLYN NET</small>
        </div>
      </footer>
    </main>
  );
}
