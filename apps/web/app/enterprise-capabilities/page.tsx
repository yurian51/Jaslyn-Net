"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import "./enterprise-capabilities.css";

type Capability = {
  number: string;
  title: string;
  summary: string;
  status: "Existing foundation" | "Integration required" | "Planned";
  href?: string;
  action?: string;
  details: string[];
};

const capabilities: Capability[] = [
  { number: "01", title: "Network Auto-Healing", summary: "Apply bounded retries to eligible failed network commands through the existing verified command worker.", status: "Integration required", href: "/network-auto-healing", action: "Open auto-healing policy", details: ["Disabled by default; tenant owner/NOC explicitly enables it", "Retries only supported failed commands after a cooldown, with a hard retry cap", "The existing network worker still executes commands and verifies device state"] },
  { number: "02", title: "Fiber GIS & OLT/ONU", summary: "Manage geolocated fiber assets and parent-child topology, with vendor provisioning and optical telemetry gated by real adapters.", status: "Integration required", href: "/fiber-ops", action: "Open fiber topology", details: ["Tenant-scoped OLT/ONU/cabinet/splitter/route inventory and coordinates", "Parent-child links and status changes are persisted and audited", "Live optical levels and device provisioning require tested vendor adapters"] },
  { number: "03", title: "Customer Self-Service Portal", summary: "Let subscribers review packages, payment history, sessions, renewals and support requests.", status: "Existing foundation", href: "/customers", action: "Open customers", details: ["Build on existing customer, commerce and payment domains", "Enforce customer identity and ownership on every request", "Never expose another subscriber’s invoices or sessions"] },
  { number: "04", title: "Bandwidth Intelligence & QoS", summary: "Show utilization, peak periods, capacity forecasts and policy-backed bandwidth controls.", status: "Integration required", href: "/operations-intelligence", action: "Open operations intelligence", details: ["Use measured traffic samples and disclose data freshness", "Keep vendor-specific queue/shaping support capability-gated", "Verify applied QoS state on the device"] },
  { number: "05", title: "Revenue Assurance", summary: "Compare payments, purchases, access grants and ledger records to surface discrepancies.", status: "Existing foundation", href: "/revenue-assurance", action: "Open revenue assurance", details: ["Use authoritative payment and ledger records", "Make reconciliation idempotent and tenant-scoped", "Flag discrepancies; never silently rewrite financial records"] },
  { number: "06", title: "SLA & Smart Dispatch", summary: "Connect incidents, service targets, technician assignment and field-work evidence.", status: "Existing foundation", href: "/incidents", action: "Open incident operations", details: ["Track response and resolution clocks with maintenance exclusions", "Dispatch only to authorized technicians and assigned sites", "Record arrival, work notes, materials and closure evidence"] },
  { number: "07", title: "Configuration Backup & Rollback", summary: "Capture redacted configuration snapshots and restore only supported, verified changes.", status: "Integration required", href: "/network", action: "Open network inventory", details: ["Encrypt snapshots and redact secrets before persistence", "Compare snapshots and show a dry-run diff", "Require approval and verify the post-rollback device state"] },
  { number: "08", title: "Reseller & Franchise Management", summary: "Manage child operators, delegated sites, commissions, settlement reports and quotas.", status: "Existing foundation", href: "/msp/usage", action: "Open tenant hierarchy and usage", details: ["Parent approval and cycle-safe tenant hierarchy", "No implicit inheritance of users or permissions", "Reconcile commissions from authoritative transactions"] },
  { number: "09", title: "Security Operations Center", summary: "Bring security posture, audit integrity, synthetic checks and incidents into one queue.", status: "Existing foundation", href: "/security-posture", action: "Open security posture", details: ["Correlate alerts with source, timestamp and affected tenant/site", "Keep audit records tamper-evident and access-controlled", "Distinguish detected, investigated, contained and resolved states"] },
  { number: "10", title: "SaaS Marketplace & Tenant Plans", summary: "Control tenant subscriptions, quotas, integration entitlements and usage visibility.", status: "Existing foundation", href: "/msp/usage", action: "Open tenant usage", details: ["Enforce plan limits in API services, not only in the UI", "Show quota usage and the reason an action is blocked", "Keep platform subscription plans separate from subscriber Wi-Fi packages"] },
];

const statusClass: Record<Capability["status"], string> = {
  "Existing foundation": "ec-status-existing",
  "Integration required": "ec-status-integration",
  Planned: "ec-status-planned",
};

export default function EnterpriseCapabilitiesPage() {
  const [filter, setFilter] = useState<"All" | Capability["status"]>("All");
  const visible = useMemo(() => capabilities.filter((item) => filter === "All" || item.status === filter), [filter]);
  const existing = capabilities.filter((item) => item.status === "Existing foundation").length;
  const integration = capabilities.filter((item) => item.status === "Integration required").length;
  const planned = capabilities.filter((item) => item.status === "Planned").length;

  return (
    <main className="ec-page">
      <header className="ec-header">
        <div>
          <p className="ec-eyebrow">JASLYN NET · ENTERPRISE OPERATIONS</p>
          <h1>Enterprise capabilities</h1>
          <p className="ec-lead">One control surface for the ten operational capabilities. Status labels distinguish existing foundations from hardware integrations and work not yet implemented.</p>
        </div>
        <Link className="ec-back" href="/network">Network workspace ↗</Link>
      </header>
      <section className="ec-summary" aria-label="Capability status summary">
        <article><span>Catalogued capabilities</span><strong>10</strong></article>
        <article><span>Existing foundations</span><strong>{existing}</strong></article>
        <article><span>Integration required</span><strong>{integration}</strong></article>
        <article><span>Planned</span><strong>{planned}</strong></article>
      </section>
      <section className="ec-controls" aria-label="Filter capabilities">
        <div><h2>Capability portfolio</h2><p>Open the related workspace where one exists. A linked workspace does not imply every sub-capability is complete.</p></div>
        <label className="ec-filter">Show
          <select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
            <option>All</option><option>Existing foundation</option><option>Integration required</option><option>Planned</option>
          </select>
        </label>
      </section>
      <section className="ec-grid">
        {visible.map((item) => (
          <article className="ec-card" key={item.number}>
            <div className="ec-card-top"><span className="ec-number">{item.number}</span><span className={"ec-status " + statusClass[item.status]}>{item.status}</span></div>
            <h3>{item.title}</h3><p className="ec-summary-copy">{item.summary}</p>
            <ul>{item.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>
            <div className="ec-card-footer"><span>Delivery scope</span>{item.href ? <Link href={item.href}>{item.action} ↗</Link> : <span>Not available</span>}</div>
          </article>
        ))}
      </section>
      <footer className="ec-note"><strong>Release rule</strong><p>Capabilities are not production-ready solely because they appear here. Each one must pass tenant-isolation, permission, migration, integration, rollback and automated-test gates. No automated network mutation should run without an explicit policy, an audit trail and post-action verification.</p></footer>
    </main>
  );
}
