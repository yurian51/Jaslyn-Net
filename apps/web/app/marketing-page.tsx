import Link from 'next/link';
import SiteShell from './landing/site-chrome';

type PageKey = 'platform' | 'architecture' | 'operations' | 'integrations' | 'product' | 'faq';

const navItems: Array<[PageKey, string]> = [
  ['platform', 'Platform'],
  ['architecture', 'How it works'],
  ['operations', 'Operations'],
  ['integrations', 'Integrations'],
  ['product', 'Features'],
  ['faq', 'FAQ'],
];

const content: Record<PageKey, {
  title: string; intro: string; plain: string;
  sections: Array<{ title: string; copy: string; bullets: string[] }>;
  next: PageKey;
}> = {
  platform: {
    title: 'Run your connectivity business from one workspace.',
    intro: 'JASLYN NET brings customer records, internet packages, payments, network access and support operations into one place.',
    plain: 'In simple terms: register customers, manage the internet service they buy, connect verified payment events to service access, and help your team understand what is happening on the network.',
    sections: [
      { title: 'Customers and services', copy: 'Keep customer profiles, service details and lifecycle changes together.', bullets: ['Customer and service records', 'Packages, purchases and invoices', 'Service status and history'] },
      { title: 'Internet access', copy: 'Connect commercial state to the network policies that provide access.', bullets: ['Hotspot and voucher workflows', 'RADIUS / AAA workflows', 'Sessions and access context'] },
      { title: 'Network operations', copy: 'Give your team a place to manage infrastructure and investigate issues.', bullets: ['Routers, sites and network inventory', 'Incidents, audit history and commands', 'Multi-location operational context'] },
    ],
    next: 'architecture',
  },
  architecture: {
    title: 'Follow the customer journey from purchase to connection.',
    intro: 'The platform is organised around the real steps required to deliver internet service, rather than treating every tool as a disconnected dashboard.',
    plain: 'A typical workflow is: customer → package or service → payment verification → access entitlement → network session. The exact automation depends on which providers and adapters are configured.',
    sections: [
      { title: '1. Customer and service', copy: 'Identify who is receiving service and which package or subscription applies.', bullets: ['Customer profile', 'Service lifecycle', 'Device and location context'] },
      { title: '2. Purchase and payment', copy: 'Record the purchase and process payment status from the configured payment workflow.', bullets: ['Packages and purchases', 'Invoice and payment records', 'Reconciliation and status history'] },
      { title: '3. Entitlement and access', copy: 'Use verified commercial state to determine what access should be allowed.', bullets: ['Access policies', 'RADIUS / AAA integration points', 'Session visibility and troubleshooting'] },
    ],
    next: 'operations',
  },
  operations: {
    title: 'Help your team see what needs attention—and why.',
    intro: 'Operational pages bring network context, customer impact and follow-up actions closer together.',
    plain: 'This is where a team checks devices and sessions, investigates incidents, reviews audit events, and coordinates maintenance. Real telemetry depends on the connected device adapters and data feeds.',
    sections: [
      { title: 'Monitor and investigate', copy: 'Use device, session and incident context to narrow down service problems.', bullets: ['Network inventory and device lifecycle', 'Incident records and operational history', 'WiFi experience and capacity views where data is available'] },
      { title: 'Control and accountability', copy: 'Keep sensitive operations attributable and reviewable.', bullets: ['Role-aware workspace access', 'Audit trails and security events', 'Command and change history where supported'] },
      { title: 'Plan and maintain', copy: 'Support repeatable maintenance and service commitments.', bullets: ['SLA policies and operational follow-up', 'Capacity and power/environment data where integrated', 'Automation rules with controlled actions'] },
    ],
    next: 'integrations',
  },
  integrations: {
    title: 'Connect the network equipment you already use.',
    intro: 'The integration model is built around vendor adapters, controller APIs, gateways and standard AAA workflows.',
    plain: 'Important: seeing a vendor listed does not mean every device model, API operation, or live telemetry path has been verified. Confirm adapter coverage and test against your actual hardware before production cutover.',
    sections: [
      { title: 'Controllers and cloud APIs', copy: 'Controller integrations can provide central visibility and management where the vendor API supports it.', bullets: ['Ubiquiti UniFi and TP-Link Omada', 'Cambium, Aruba and Ruckus', 'Grandstream, Ruijie / Reyee and Cisco Meraki'] },
      { title: 'Routers and gateways', copy: 'Gateway adapters vary by model, firmware and exposed management interfaces.', bullets: ['MikroTik RouterOS', 'OpenWrt and pfSense / OPNsense', 'Teltonika and Peplink'] },
      { title: 'Standards and readiness', copy: 'Use a clear test plan for each adapter and deployment.', bullets: ['RADIUS / AAA and authentication flows', 'Read/write operation checks and permission scope', 'Timeouts, retries, error handling and audit evidence'] },
    ],
    next: 'product',
  },
  product: {
    title: 'Separate tools for separate jobs, connected by one workspace.',
    intro: 'Each feature area has its own route so users can open it directly, bookmark it and return to it without being forced through a long single page.',
    plain: 'Public product pages explain what each area is for. The authenticated console contains the actual workspace data and actions permitted to the signed-in user.',
    sections: [
      { title: 'Customers and commerce', copy: 'Manage the customer and financial side of delivering connectivity.', bullets: ['Customers and services', 'Packages, purchases, sales and payments', 'Vouchers and promotions'] },
      { title: 'Network and access', copy: 'Manage the infrastructure and access paths that provide service.', bullets: ['Network, sessions and Access Network', 'RADIUS / AAA and IP address management', 'Fiber, WAN and load balancing'] },
      { title: 'Security and operations', copy: 'Support reliable, accountable day-to-day operations.', bullets: ['Incidents and notifications', 'Security, audit and settings', 'Procurement, integrations and operations intelligence where enabled'] },
    ],
    next: 'faq',
  },
  faq: {
    title: 'Clear answers before you start.',
    intro: 'A quick guide to what the platform does, where to begin and what should be verified before a production rollout.',
    plain: 'JASLYN NET is an operating platform for WiFi providers, ISPs and managed network teams—not a guarantee that every vendor integration or payment provider is enabled by default.',
    sections: [
      { title: 'Who is it for?', copy: 'WiFi operators, ISPs / WISPs and teams managing networks across multiple locations.', bullets: ['Customer and service management', 'Access and billing workflows', 'Network operations and accountability'] },
      { title: 'Does every integration work automatically?', copy: 'No. Availability depends on the adapter, hardware model, API permissions, firmware and deployment configuration.', bullets: ['Test each required operation', 'Verify credentials and tenant permissions', 'Run integration and failure-path tests'] },
      { title: 'Where do I begin?', copy: 'Create a workspace or sign in if your organisation already has one.', bullets: ['Set up the workspace', 'Configure services and integrations', 'Validate workflows before production use'] },
    ],
    next: 'platform',
  },
};

export default function MarketingPage({ page }: { page: PageKey }) {
  const item = content[page];
  const nextLabel = navItems.find(([key]) => key === item.next)?.[1] ?? 'Next';
  const nextHref = '/' + item.next;
  return (
    <SiteShell current={'/' + page}>
      <section className="jl-pagehead" aria-labelledby="jl-page-h1">
        <div className="jl-wrap">
          <h1 id="jl-page-h1">{item.title}</h1>
          <p className="jl-lead">{item.intro}</p>
          <p className="jl-caveat"><strong>In plain language. </strong>{item.plain}</p>
          <div className="jl-actions">
            <Link href="/register" className="jl-btn">Create a workspace</Link>
            <Link href="/login" className="jl-btn jl-btn-ghost">Sign in</Link>
          </div>
        </div>
      </section>
      <section className="jl-pagerows" aria-label={item.title}>
        <div className="jl-wrap">
          {item.sections.map((section) => (
            <div className="jl-pagerow" key={section.title}>
              <div><h2 className="jl-h3x">{section.title}</h2><p>{section.copy}</p></div>
              <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>
            </div>
          ))}
        </div>
      </section>
      <section className="jl-pagenext">
        <div className="jl-wrap jl-pagenext-in">
          <Link href="/" className="jl-textlink">Back to home</Link>
          <Link href={nextHref} className="jl-nextlink">Next: {nextLabel}</Link>
        </div>
      </section>
    </SiteShell>
  );
}
