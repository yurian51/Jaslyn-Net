'use client';

import Link from 'next/link';
import Image from 'next/image';
import LandingNav from './landing-nav';
import BrandLogo from './brand-logo';

const integrationList = [
  { name: 'MikroTik RouterOS', logo: '/integrations/mikrotik.svg', detail: 'v6 & v7 REST, API-SSL, Queues & PPPoE', badge: 'Core adapter' },
  { name: 'Ubiquiti UniFi', logo: '/integrations/ubiquiti.svg', detail: 'Controller API, guest portal authorization, VLANs', badge: 'Native sync' },
  { name: 'TP-Link Omada', logo: '/integrations/tplink.svg', detail: 'SDN controller, captive vouchers, AP binding', badge: 'Supported' },
  { name: 'Cambium Networks', logo: '/integrations/cambium-networks.svg', detail: 'cnMaestro REST, fixed wireless & ePMP telemetry', badge: 'Direct API' },
  { name: 'Cisco Meraki', logo: '/integrations/meraki.svg', detail: 'Dashboard API, Splash page redirect, Webhooks', badge: 'Cloud native' },
  { name: 'Aruba Networks', logo: '/integrations/aruba.svg', detail: 'Instant On & ClearPass RADIUS dictionary', badge: 'Enterprise' },
  { name: 'Grandstream', logo: '/integrations/grandstream.svg', detail: 'GWN.Cloud, captive portal & multi-SSID profiles', badge: 'Supported' },
  { name: 'Ruijie Reyee', logo: '/integrations/ruijie-reyee.svg', detail: 'Ruijie Cloud Open API & Hotspot authentication', badge: 'Supported' },
  { name: 'Ruckus CommScope', logo: '/integrations/ruckus.svg', detail: 'SmartZone & Unleashed dynamic PSK / captive AAA', badge: 'Carrier tier' },
  { name: 'OpenWrt', logo: '/integrations/openwrt.svg', detail: 'CoovaChilli, LuCI ubus agent & nodogsplash AAA', badge: 'Open source' },
  { name: 'Teltonika Networks', logo: '/integrations/teltonika.svg', detail: 'RUTX series, RMS API, Dual-SIM WAN failover', badge: 'Industrial' },
  { name: 'Peplink SpeedFusion', logo: '/integrations/peplink.svg', detail: 'InControl2 API, SpeedFusion bonding, Multi-WAN', badge: 'Enterprise' },
  { name: 'pfSense', logo: '/integrations/pfsense.svg', detail: 'FreeBSD pf packet filter, Captive portal & CP radius', badge: 'Firewall tier' },
  { name: 'OPNsense', logo: '/integrations/opnsense.svg', detail: 'REST API, voucher sync, traffic shaper pipes', badge: 'Firewall tier' },
  { name: 'FreeRADIUS', logo: '/integrations/freeradius.svg', detail: 'RFC 2865/2866 AAA, CoA disconnect & MikroTik VSA', badge: 'Standards RFC' },
];

const platformModules = [
  { id: '01', title: 'Customers & CRM', copy: 'Profiles, service status, usage metrics and subscriber lifecycle for hotspot & fiber users.', href: '/customers' },
  { id: '02', title: 'Wi-Fi Packages & Billing', copy: 'Speed profiles, quotas, validity policies, auto-invoicing and platform subscription plans.', href: '/packages' },
  { id: '03', title: 'Hotspot & Vouchers', copy: 'Branded captive portals, thermal printer voucher batches, QR codes and instant SMS delivery.', href: '/vouchers' },
  { id: '04', title: 'Automated Payments', copy: 'Instant Lipa na M-Pesa STK push, mobile money reconciliation, direct settlement and receipts.', href: '/payments' },
  { id: '05', title: 'Network Control Plane', copy: 'MikroTik & UniFi routers, live interfaces, traffic queues, dynamic DHCP and WAN failover.', href: '/network' },
  { id: '06', title: 'Field Operations & QR', copy: 'Mobile QR scanner for pole equipment, ONT optical testing and offline sync for field technicians.', href: '/field-operations' },
  { id: '07', title: 'Security & Audit Logs', copy: 'Append-only audit ledger, operator role permissions, command histories and compliance records.', href: '/audit' },
  { id: '08', title: 'Subscriber Portal', copy: 'Customer self-service portal for speed tests, quota checks, renewals and receipt downloads.', href: '/captive/manage' },
];

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="jn-arrow-icon">
      <path d="M4 10h11M10 5l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Home() {
  return (
    <main className="landing jn-landing">
      <LandingNav />

      {/* HERO SECTION */}
      <section className="jn-hero" aria-label="JASLYN NET Platform Overview">
        <div className="jn-hero-copy">
          <div className="jn-eyebrow">
            <span aria-hidden="true" />
            JASLYN NET / CONNECTIVITY OPERATIONS
          </div>
          <h1>
            Run your Wi-Fi and ISP operations <em>from one place.</em>
          </h1>
          <p className="jn-hero-lead">
            JASLYN NET connects customer accounts, Wi-Fi packages, M-Pesa payments, network access control and field operations into one reliable control plane.
          </p>
          <div className="jn-hero-actions">
            <Link className="jn-btn jn-btn-primary" href="/register">
              Create your workspace <ArrowIcon />
            </Link>
            <Link className="jn-btn jn-btn-secondary" href="/packages">
              Explore packages
            </Link>
            <Link className="jn-btn jn-btn-secondary" href="/login">
              Sign in
            </Link>
          </div>
          <div className="jn-hero-meta">
            <span>RouterOS v6 & v7</span>
            <i aria-hidden="true" />
            <span>Ubiquiti UniFi</span>
            <i aria-hidden="true" />
            <span>M-Pesa STK Push</span>
            <i aria-hidden="true" />
            <span>RADIUS AAA</span>
          </div>
        </div>

        {/* ILLUSTRATIVE WORKSPACE PREVIEW */}
        <div className="jn-hero-visual">
          <div className="jn-preview-frame">
            <div className="jn-preview-topline">
              <div className="jn-window-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </div>
              <span>JASLYN NET · ILLUSTRATIVE WORKSPACE</span>
              <b>OPERATOR VIEW</b>
            </div>
            <div className="jn-preview-body">
              <div className="jn-preview-sidebar">
                <div className="jn-preview-brand">
                  <span><BrandLogo alt="" /></span>
                  <div>
                    <span>JASLYN NET</span>
                    <small>TENANT WORKSPACE</small>
                  </div>
                </div>
                <div className="jn-preview-label">NAVIGATION</div>
                <span className="active">
                  <i aria-hidden="true">⌘</i> Overview
                </span>
                <span>
                  <i aria-hidden="true">👥</i> Customers
                </span>
                <span>
                  <i aria-hidden="true">📶</i> Sessions
                </span>
                <span>
                  <i aria-hidden="true">⚡</i> Network
                </span>
                <span>
                  <i aria-hidden="true">💳</i> Payments
                </span>
                <div className="jn-preview-sidebar-foot">
                  <span className="jn-preview-example-dot" aria-hidden="true" />
                  Illustrative session
                  <small>Demo environment preview</small>
                </div>
              </div>

              <div className="jn-preview-content">
                <div className="jn-preview-heading">
                  <div>
                    <small>OPERATIONAL DASHBOARD</small>
                    <h3>Primary Network Overview</h3>
                    <p>Live session distribution across registered access gateways</p>
                  </div>
                  <span>OPERATIONAL CONTEXT</span>
                </div>

                <div className="jn-preview-metrics">
                  <article>
                    <small>ACTIVE SUBSCRIBERS</small>
                    <strong>1,420 Verified</strong>
                    <span>Operational snapshot</span>
                  </article>
                  <article>
                    <small>NETWORK THROUGHPUT</small>
                    <strong>482 Mbps Aggregated</strong>
                    <span>Core WAN link</span>
                  </article>
                  <article>
                    <small>PAYMENT CLEARING</small>
                    <strong>99.8% Automated</strong>
                    <span>Direct mobile money</span>
                  </article>
                </div>

                <div className="jn-preview-grid">
                  <div className="jn-preview-panel">
                    <small className="jn-panel-kicker">SUBSCRIBER SERVICE LIFECYCLE</small>
                    <h4>Purchase-to-Access Verification Chain</h4>
                    <p>Deterministic policy transition from mobile payment to gateway authorization.</p>

                    <div className="jn-flow-chain">
                      <div className="jn-flow-node">
                        <span>STEP 1</span>
                        <b>Customer</b>
                        <ArrowIcon />
                      </div>
                      <div className="jn-flow-node">
                        <span>STEP 2</span>
                        <b>Package</b>
                        <ArrowIcon />
                      </div>
                      <div className="jn-flow-node">
                        <span>STEP 3</span>
                        <b>M-Pesa STK</b>
                        <ArrowIcon />
                      </div>
                      <div className="jn-flow-node">
                        <span>STEP 4</span>
                        <b>RADIUS AAA</b>
                        <ArrowIcon />
                      </div>
                      <div className="jn-flow-node">
                        <span>STEP 5</span>
                        <b>Online</b>
                      </div>
                    </div>
                  </div>

                  <div className="jn-preview-panel">
                    <small className="jn-panel-kicker">SYSTEM INTEGRITY</small>
                    <h4>Core Services</h4>
                    <div className="jn-health-row">
                      <span><i aria-hidden="true" /> RADIUS Service</span>
                      <b>ACTIVE</b>
                    </div>
                    <div className="jn-health-row">
                      <span><i aria-hidden="true" /> Payment Webhook</span>
                      <b>VERIFIED</b>
                    </div>
                    <div className="jn-health-row">
                      <span><i className="neutral" aria-hidden="true" /> MikroTik API</span>
                      <b>CONNECTED</b>
                    </div>
                    <div className="jn-preview-footer">
                      <span>Audit trail recorded</span>
                      <b>v2026.4</b>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="jn-floating-card">
            <span className="jn-preview-example-dot" aria-hidden="true" />
            <div>
              <small>ACCESS POLICY</small>
              <b>Example policy · Illustrative only</b>
            </div>
          </div>
        </div>
      </section>

      {/* PROOF STRIP */}
      <div className="jn-proof-strip">
        <div>
          <span>OPERATOR ARCHITECTURE</span>
          <b>MikroTik RouterOS Core</b>
          <b>Ubiquiti UniFi APs</b>
          <b>PPPoE & Hotspot Vouchers</b>
          <b>Direct Lipa na M-Pesa Settlement</b>
          <b>Multi-Site Network Operations</b>
        </div>
      </div>

      {/* 01 PLATFORM SECTION */}
      <section className="jn-section" id="platform" aria-label="Platform Architecture">
        <div className="jn-section-head">
          <div>
            <div className="jn-kicker">01 / PLATFORM CAPABILITIES</div>
            <h2>
              One workspace for <span>every layer of connectivity.</span>
            </h2>
          </div>
          <p>
            Rather than juggling disconnected captive portal portals, separate billing apps, manual M-Pesa statements and scattered router logins, JASLYN NET connects each piece into a single control plane.
          </p>
        </div>

        <div className="jn-layer-grid">
          <article>
            <small>CUSTOMER & CRM</small>
            <h3>Customer Management</h3>
            <p>Maintain accurate subscriber records, contact details, account balances, registered MAC addresses and active subscriptions.</p>
            <ArrowIcon />
          </article>
          <article>
            <small>COMMERCE & BILLING</small>
            <h3>Wi-Fi Packages & Billing</h3>
            <p>Define speed plans, time and data quotas, recurring subscriptions, invoice schedules and automated renewal notices.</p>
            <ArrowIcon />
          </article>
          <article>
            <small>ACCESS & AAA</small>
            <h3>Hotspot & Vouchers</h3>
            <p>Generate secure prepaid voucher codes, customized captive portals, thermal batch printing and self-service purchasing.</p>
            <ArrowIcon />
          </article>
          <article>
            <small>PAYMENTS & SETTLEMENT</small>
            <h3>Payment Processing</h3>
            <p>Native STK Push for M-Pesa and Airtel Money with zero manual reconciliation, instant receipts and automatic unblocking.</p>
            <ArrowIcon />
          </article>
          <article>
            <small>INFRASTRUCTURE & NOC</small>
            <h3>Network Operations</h3>
            <p>Monitor routers, wireless access points, fiber switches, interface traffic, DHCP leases and link availability in real time.</p>
            <ArrowIcon />
          </article>
        </div>
      </section>

      {/* 02 ARCHITECTURE / WORKFLOW */}
      <section className="jn-architecture" id="architecture" aria-label="How it works">
        <div className="jn-section jn-section-light">
          <div className="jn-section-head">
            <div>
              <div className="jn-kicker">02 / END-TO-END WORKFLOW</div>
              <h2>
                How subscriber connectivity <span>actually flows.</span>
              </h2>
            </div>
            <p>
              From customer captive splash to active bandwidth queue, every transaction follows a deterministic, audited lifecycle.
            </p>
          </div>

          <div className="jn-architecture-flow">
            <div className="jn-architecture-spine" aria-hidden="true" />

            <div className="jn-architecture-step">
              <span>01</span>
              <h3>Customer Connects</h3>
              <p>Device associates with SSID or fiber ONT; captive portal or PPPoE request initiates authentication.</p>
            </div>

            <div className="jn-architecture-step">
              <span>02</span>
              <h3>Package & M-Pesa</h3>
              <p>Subscriber selects an internet package; instant STK Push prompts user on mobile phone for PIN.</p>
            </div>

            <div className="jn-architecture-step">
              <span>03</span>
              <h3>Payment Verified</h3>
              <p>Callback webhook confirms settlement; system generates voucher entitlement and binds subscriber account.</p>
            </div>

            <div className="jn-architecture-step">
              <span>04</span>
              <h3>RADIUS & Router CoA</h3>
              <p>FreeRADIUS issues access accept or CoA disconnect; MikroTik simple queue or PCQ shapes the rate limit.</p>
            </div>

            <div className="jn-architecture-step">
              <span>05</span>
              <h3>Active Session</h3>
              <p>Subscriber receives full-speed connectivity with live accounting and quota tracking in the console.</p>
            </div>
          </div>

          <div className="jn-architecture-caption">
            <span>DETERMINISTIC ENTITLEMENT STATE</span>
            <b>Sub-2 second transaction clearing from mobile push to router unblock</b>
          </div>
        </div>
      </section>

      {/* 03 OUTCOMES */}
      <section className="jn-outcomes" id="jn-outcomes-title" aria-label="Operator Outcomes">
        <div className="jn-outcomes-inner">
          <div className="jn-outcomes-heading">
            <div className="jn-kicker">03 / REAL RESULTS FOR OPERATORS</div>
            <h2>
              Built for the daily reality of <span>East African & Global ISPs.</span>
            </h2>
            <p>
              Designed for WISPs, fiber providers, hotel Wi-Fi networks and estates needing speed, resilience and zero revenue leakage.
            </p>
          </div>

          <div className="jn-outcomes-grid">
            <article>
              <span>OUTCOME 01</span>
              <div className="jn-outcome-icon" aria-hidden="true">📦</div>
              <h3>Transparent Wi-Fi Packages</h3>
              <p>Create clear, compelling packages that customers understand instantly: hourly, 24-hour hotspot, weekly passes or monthly uncapped fiber.</p>
              <Link href="/packages">
                Explore plan catalogue <ArrowIcon />
              </Link>
            </article>

            <article>
              <span>OUTCOME 02</span>
              <div className="jn-outcome-icon" aria-hidden="true">⚡</div>
              <h3>Automate 100% of Payments</h3>
              <p>Eliminate manual verification phone calls and shared receipts. Customers pay via M-Pesa STK Push and are connected immediately.</p>
              <Link href="/architecture">
                Review workflow architecture <ArrowIcon />
              </Link>
            </article>

            <article>
              <span>OUTCOME 03</span>
              <div className="jn-outcome-icon" aria-hidden="true">🛡️</div>
              <h3>Operate from Real Evidence</h3>
              <p>Verify exactly which router interface has packet loss, audit every operator command, and dispatch field technicians with clear QR tools.</p>
              <Link href="/operations">
                Inspect operations tooling <ArrowIcon />
              </Link>
            </article>
          </div>
          <div className="jn-outcomes-note">
            * Field tested across rural WISPs, multi-tenant residential estates, and commercial Wi-Fi hotspots.
          </div>
        </div>
      </section>

      {/* 04 OPERATIONS */}
      <section className="jn-section" id="operations" aria-label="Field and NOC Operations">
        <div className="jn-section-head">
          <div>
            <div className="jn-kicker">04 / FIELD & NOC OPERATIONS</div>
            <h2>
              Equip both field technicians <span>and NOC engineers.</span>
            </h2>
          </div>
          <p>
            Bridging the gap between tower/pole work and centralized network monitoring with dedicated mobile-ready workflows.
          </p>
        </div>

        <div className="jn-scenario-grid">
          <article>
            <span className="jn-scenario-number">FEATURE 01</span>
            <h3>Field Technician QR Scanner</h3>
            <p>Technicians on poles or at subscriber premises scan equipment QR codes with their phone camera to instantly fetch router configuration, uptime, and test signals.</p>
            <small>ACCELERATED FIELD WORK</small>
          </article>

          <article>
            <span className="jn-scenario-number">FEATURE 02</span>
            <h3>MikroTik & RouterOS NOC</h3>
            <p>Centralized interface statistics, simple queues, PCQ bandwidth distribution, CPU load, voltage telemetry and WAN failover tracking across all sites.</p>
            <small>CENTRAL CONTROL</small>
          </article>

          <article>
            <span className="jn-scenario-number">FEATURE 03</span>
            <h3>Incident Management</h3>
            <p>Automated outage detection when gateways drop offline. Track affected subscribers, send bulk SMS alerts, and log resolution times.</p>
            <small>SERVICE RELIABILITY</small>
          </article>

          <article>
            <span className="jn-scenario-number">FEATURE 04</span>
            <h3>Strict Security & Audit Trail</h3>
            <p>Role-based operator access (superadmin, technician, cashier). Every voucher created, payment refunded, or config change is permanently audited.</p>
            <small>ENTERPRISE ACCOUNTABILITY</small>
          </article>
        </div>
      </section>

      {/* 05 INTEGRATIONS */}
      <section className="jn-integrations" id="integrations" aria-label="Hardware & Vendor Integrations">
        <div className="jn-section">
          <div className="jn-section-head">
            <div>
              <div className="jn-kicker">05 / HARDWARE ECOSYSTEM</div>
              <h2>
                Compatible with the <span>equipment you rely on.</span>
              </h2>
            </div>
            <p>
              Vendor-tested adapters for industry-standard routers, access points, controllers and AAA services. Note: confirm compatibility before planning a production cutover.
            </p>
          </div>

          <div className="jn-integration-grid">
            {integrationList.map((item) => (
              <article key={item.name}>
                <div className="jn-integration-brand">
                  <Image
                    className="jn-integration-logo"
                    src={item.logo}
                    alt={item.name}
                    width={32}
                    height={32}
                  />
                </div>
                <div className="jn-integration-copy">
                  <h3>{item.name}</h3>
                  <p>{item.detail}</p>
                </div>
                <small>{item.badge}</small>
              </article>
            ))}
          </div>

          <div className="jn-integration-note">
            <span>ADAPTER READINESS</span>
            <b>Vendor listings represent protocol adapter capabilities. Always confirm compatibility before planning a production cutover with custom hardware firmware.</b>
          </div>
        </div>
      </section>

      {/* 06 MODULES */}
      <section className="jn-module-section" id="modules" aria-label="Platform Modules">
        <div className="jn-section">
          <div className="jn-section-head">
            <div>
              <div className="jn-kicker">06 / MODULAR ARCHITECTURE</div>
              <h2>
                Dedicated tools for <span>every department.</span>
              </h2>
            </div>
            <p>
              Each core operational discipline has its own clean, focused route so team members can work without distraction or clutter.
            </p>
          </div>

          <div className="jn-module-grid">
            {platformModules.map((mod) => (
              <article key={mod.id}>
                <span>{mod.id} / MODULE</span>
                <h3>{mod.title}</h3>
                <p>{mod.copy}</p>
                <Link href={mod.href}>
                  Open module <ArrowIcon />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 07 FAQ */}
      <section className="jn-faq" id="faq" aria-label="Frequently Asked Questions">
        <div className="jn-section">
          <div className="jn-faq-grid">
            <div>
              <div className="jn-kicker jn-kicker-inverse">07 / FREQUENTLY ASKED QUESTIONS</div>
              <h2>
                Clear answers before <span>you get started.</span>
              </h2>
              <p>
                Have questions about deployment, hardware requirements, or billing? Here is how JASLYN NET operates.
              </p>
            </div>

            <div className="jn-faq-list">
              <details open>
                <summary>
                  What router hardware is supported? <b>+</b>
                </summary>
                <p>
                  JASLYN NET integrates natively with MikroTik RouterOS (v6 and v7), Ubiquiti UniFi, TP-Link Omada, Cambium cnMaestro, pfSense, OPNsense, OpenWrt, and standard FreeRADIUS compliant gateways.
                </p>
              </details>

              <details>
                <summary>
                  How does M-Pesa automated billing work? <b>+</b>
                </summary>
                <p>
                  When a subscriber taps Buy Package on your captive portal, JASLYN NET initiates an automated Lipa na M-Pesa Online STK Push directly to their phone. Upon entering their MPIN, the webhook validates the payment and provisions internet access in under two seconds without any cashier intervention.
                </p>
              </details>

              <details>
                <summary>
                  Can I print physical scratch cards and paper vouchers? <b>+</b>
                </summary>
                <p>
                  Yes. The Vouchers module supports generating batches with custom prefixes, expiration rules, rate limits, and formatted thermal paper print layouts ready for 58mm and 80mm POS receipt printers.
                </p>
              </details>

              <details>
                <summary>
                  Does JASLYN NET support field technicians on site? <b>+</b>
                </summary>
                <p>
                  Yes. Technicians can use the mobile-optimized Field Operations interface equipped with a live camera QR scanner to scan equipment serial/barcode labels, inspect router interfaces, and verify client links in real time.
                </p>
              </details>

              <details>
                <summary>
                  Where is data stored and is multi-tenancy supported? <b>+</b>
                </summary>
                <p>
                  Every tenant operates within an isolated workspace schema with strict role-based access control (RBAC), append-only security logs, and comprehensive audit trails.
                </p>
              </details>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="jn-final-cta" aria-label="Get Started">
        <div className="jn-section">
          <div className="jn-kicker">GET STARTED WITH JASLYN NET</div>
          <h2>
            Take control of your <span>Wi-Fi & ISP operations today.</span>
          </h2>
          <p>
            Deploy JASLYN NET to automate subscriber billing, eliminate manual vouchers, and manage your network with confidence.
          </p>
          <div className="jn-final-actions">
            <Link className="jn-btn jn-btn-primary" href="/register">
              Create your workspace <ArrowIcon />
            </Link>
            <Link className="jn-btn jn-btn-secondary" href="/login">
              Sign in to console
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="jn-footer">
        <div>
          <div className="jn-footer-brand">
            <BrandLogo alt="" />
            <b>JASLYN NET</b>
          </div>
          <p>
            The modern operating platform for Wi-Fi billing, subscriber access, and network infrastructure management.
          </p>
        </div>

        <nav aria-label="Landing Page Navigation">
          <Link href="/platform">Platform</Link>
          <Link href="/architecture">How it works</Link>
          <Link href="/operations">Operations</Link>
          <Link href="/integrations">Integrations</Link>
          <Link href="/packages">Plans</Link>
          <Link href="/faq">FAQ</Link>
          <Link href="/legal/privacy">Privacy Policy</Link>
          <Link href="/legal/terms">Terms of Service</Link>
        </nav>

        <div className="jn-footer-end">
          <Link href="/login">Operator Sign In</Link>
          <small>© 2026 JASLYN NET. All rights reserved.</small>
        </div>
      </footer>
    </main>
  );
}
