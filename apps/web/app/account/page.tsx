'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState, type ReactNode } from 'react';
import BrandLogo from '../brand-logo';
import { apiFetch } from '../../lib/api';
import { getAccessToken } from '../../lib/auth';

type AccountData = {
  profile: {
    businessName?: string;
    contactName?: string;
    phone?: string;
    email?: string;
    address?: string;
    brandColor?: string;
    logoUrl?: string;
    supportPhone?: string;
    supportWhatsapp?: string;
    supportEmail?: string;
    portalHeadline?: string;
    portalSubtitle?: string;
  } | null;
  tenant: {
    tenantId?: string;
    name?: string;
    slug?: string;
    status?: string;
    currency?: string;
    timezone?: string;
  } | null;
  lifecycle: {
    state?: string;
    deletionExecuteAt?: string;
  } | null;
  paymentDisplay: {
    acceptVouchers: boolean;
    acceptOnlinePayments: boolean;
  };
  subscription: {
    status?: string;
    planName?: string;
    price?: number;
    currency?: string;
    billingInterval?: string;
    currentPeriodEnd?: string;
    maxRouters?: number;
    maxSites?: number;
    maxCustomers?: number;
  } | null;
};

type Member = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  isActive: boolean;
};

const ROLES = ['OWNER', 'ADMIN', 'CASHIER', 'AGENT', 'READ_ONLY'] as const;

const DEFAULT_PROFILE = {
  businessName: '',
  contactName: '',
  phone: '',
  email: '',
  address: '',
};

const DEFAULT_BRAND = {
  brandColor: '#1769E0',
  logoUrl: '',
  supportPhone: '',
  supportWhatsapp: '',
  supportEmail: '',
  portalHeadline: 'Choose your WiFi plan',
  portalSubtitle: 'Select a package to get connected.',
};

function tokenHeaders(): Record<string, string> {
  const value = getAccessToken();
  return value ? { Authorization: `Bearer ${value}` } : {};
}

function stableNumericId(value?: string) {
  if (!value) return '—';
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const positive = hash >>> 0;
  return String(positive % 900000000 + 100000000);
}

function Icon({ name }: { name: 'profile' | 'workspace' | 'team' | 'branding' | 'payments' | 'privacy' | 'support' | 'devices' | 'danger' | 'copy' }) {
  const paths: Record<string, ReactNode> = {
    profile: <><circle cx="12" cy="8" r="3.2" /><path d="M4.5 20c.7-3.2 3-5 7.5-5s6.8 1.8 7.5 5" /></>,
    workspace: <><rect x="3.5" y="5" width="17" height="14" rx="2" /><path d="M8 5V3h8v2M7 10h10M7 14h6" /></>,
    team: <><circle cx="9" cy="8" r="2.8" /><circle cx="17" cy="9" r="2.2" /><path d="M3.8 20c.6-3.2 2.3-5 5.2-5s4.6 1.8 5.2 5M14 15.5c2.7-.2 4.8 1.3 5.5 4.5" /></>,
    branding: <><path d="M5 18 15.7 7.3l2.9 2.9L7.9 20H5v-2Z" /><path d="m13.8 9.2 2.9 2.9M18.6 5.5l.9-.9 2 2-.9.9" /></>,
    payments: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h4" /></>,
    privacy: <><path d="M12 3 19 6v5c0 4.5-2.5 7.2-7 10-4.5-2.8-7-5.5-7-10V6l7-3Z" /><path d="m9 12 2 2 4-4" /></>,
    support: <><circle cx="12" cy="12" r="8.5" /><path d="M9.7 9.2a2.4 2.4 0 1 1 4 1.8c-.8.6-1.5 1.1-1.5 2.4M12 17h.01" /></>,
    devices: <><rect x="5" y="4" width="14" height="10" rx="1.5" /><path d="M3 19h18M9 14v3h6v-3" /></>,
    danger: <><path d="M12 3 21 20H3L12 3Z" /><path d="M12 9v5M12 17h.01" /></>,
    copy: <><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export default function AccountPage() {
  const [data, setData] = useState<AccountData | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [brand, setBrand] = useState(DEFAULT_BRAND);
  const [payments, setPayments] = useState({ acceptVouchers: true, acceptOnlinePayments: true });
  const [support, setSupport] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);

  async function load() {
    setBusy(true);
    try {
      const [account, team] = await Promise.all([
        apiFetch<AccountData>('/account', { headers: tokenHeaders() }),
        apiFetch<{ data: Member[] }>('/account/team', { headers: tokenHeaders() }),
      ]);
      setData(account);
      setMembers(team.data ?? []);
      setProfile({ ...DEFAULT_PROFILE, ...(account.profile ?? {}) });
      setBrand({ ...DEFAULT_BRAND, ...(account.profile ?? {}) });
      setPayments(account.paymentDisplay);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load account');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function save(pathname: string, body: unknown, success: string) {
    setBusy(true);
    setMessage('');
    try {
      const next = await apiFetch<AccountData>(pathname, {
        method: 'PUT',
        headers: { ...tokenHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setData(next);
      setProfile({ ...DEFAULT_PROFILE, ...(next.profile ?? {}) });
      setBrand({ ...DEFAULT_BRAND, ...(next.profile ?? {}) });
      setPayments(next.paymentDisplay);
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const member = await apiFetch<Member>('/account/team', {
        method: 'POST',
        headers: { ...tokenHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: form.get('fullName'),
          email: form.get('email'),
          password: form.get('password'),
          role: form.get('role'),
        }),
      });
      setMembers((current) => [...current, member]);
      event.currentTarget.reset();
      setMessage('Team member added.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not add team member');
    } finally {
      setBusy(false);
    }
  }

  async function teamPatch(id: string, body: unknown) {
    setBusy(true);
    try {
      await apiFetch(`/account/team/${id}`, {
        method: 'PATCH',
        headers: { ...tokenHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Team update failed');
    } finally {
      setBusy(false);
    }
  }

  async function exportData() {
    setBusy(true);
    try {
      const response = await fetch(`${(process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '')}/account/data-export`, { headers: tokenHeaders() });
      if (!response.ok) throw new Error('Data export failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'jaslyn-net-data.json';
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage('Your data export has started.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Data export failed');
    } finally {
      setBusy(false);
    }
  }

  async function lifecycleAction(pathname: string, body?: unknown) {
    setBusy(true);
    try {
      const next = await apiFetch<AccountData>(pathname, {
        method: 'POST',
        headers: { ...tokenHeaders(), 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      setData(next);
      setMessage('Account state updated.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  const businessName = data?.profile?.businessName || data?.tenant?.name || 'JASLYN NET Workspace';
  const contactName = data?.profile?.contactName || 'Workspace owner';
  const tenantId = data?.tenant?.tenantId || '';
  const publicId = stableNumericId(tenantId);
  const timezone = data?.tenant?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Browser timezone';
  const subscriptionName = data?.subscription?.planName || 'Workspace plan';

  const sections = useMemo(() => [
    {
      title: 'Account',
      rows: [
        { icon: 'profile' as const, label: 'Business profile', detail: 'Name, contact details and workspace identity', href: '#profile' },
        { icon: 'workspace' as const, label: 'Workspace identity', detail: 'JASLYN ID, tenant reference and timezone', href: '#identity' },
        { icon: 'team' as const, label: 'Team access', detail: `${members.length} workspace members`, href: '#team' },
      ],
    },
    {
      title: 'Customer experience',
      rows: [
        { icon: 'branding' as const, label: 'Customer portal branding', detail: 'Portal name, support channels and presentation', href: '#branding' },
        { icon: 'payments' as const, label: 'Payment display', detail: 'Choose which payment surfaces customers see', href: '#payments' },
      ],
    },
    {
      title: 'Security & data',
      rows: [
        { icon: 'privacy' as const, label: 'Privacy & data', detail: 'Export the data held for this workspace', href: '#privacy' },
        { icon: 'devices' as const, label: 'Devices & sessions', detail: 'Review active operational sessions', href: '/sessions' },
      ],
    },
    {
      title: 'Help',
      rows: [
        { icon: 'support' as const, label: 'Support', detail: 'Create a support request for this workspace', href: '#support' },
      ],
    },
  ] as const, [members.length]);

  return (
    <main className="account-page">
      <header className="account-profile-hero">
        <div className="account-profile-identity">
          <div className="account-profile-avatar"><BrandLogo alt="" /></div>
          <div className="account-profile-copy">
            <div className="account-profile-name">{businessName}</div>
            <div className="account-profile-contact">{contactName}</div>
            <div className="account-profile-meta"><span>ID {publicId}</span><span>{subscriptionName}</span><span>{timezone}</span></div>
          </div>
        </div>
        <div className="account-profile-actions">
          <button type="button" onClick={async () => { if (!tenantId) return; await navigator.clipboard?.writeText(tenantId); setCopied(true); window.setTimeout(() => setCopied(false), 1200); }} aria-label="Copy tenant ID" title="Copy tenant ID"><Icon name="copy" /></button>
          <Link href="/settings" aria-label="Open settings"><span>⚙</span></Link>
        </div>
      </header>

      <div className="account-primary-actions">
        <Link href="#profile"><Icon name="profile" /><span>Edit profile</span></Link>
        <Link href="#branding"><Icon name="branding" /><span>Portal</span></Link>
        <Link href="#team"><Icon name="team" /><span>Team</span></Link>
        <Link href="#payments"><Icon name="payments" /><span>Payments</span></Link>
      </div>

      {message ? <div className="account-message" role="status">{message}</div> : null}
      {copied ? <div className="account-copy-status" role="status">Tenant ID copied.</div> : null}

      <div className="account-layout">
        <aside className="account-index" aria-label="Account sections">
          <div className="account-index-title">JASLYN NET</div>
          <div className="account-index-current">{businessName}</div>
          <div className="account-index-sub">{data?.profile?.email || data?.profile?.phone || 'Workspace account'}</div>
          <div className="account-index-id">ID <b>{publicId}</b></div>
        </aside>

        <section className="account-main">
          <section className="account-quick-groups" aria-label="Account navigation">
            {sections.map((section) => (
              <div className="account-group" key={section.title}>
                <div className="account-group-label">{section.title}</div>
                <div className="account-group-surface">
                  {section.rows.map((row) => (
                    <Link href={row.href} className="account-row" key={row.label}>
                      <span className="account-row-icon"><Icon name={row.icon} /></span>
                      <span className="account-row-copy"><strong>{row.label}</strong><small>{row.detail}</small></span>
                      <span className="account-row-chevron">›</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </section>

          <section id="identity" className="account-detail-section">
            <div className="account-section-head"><div><span>01 / IDENTITY</span><h2>Workspace identity</h2><p>Identifiers used by JASLYN NET when the workspace communicates with the control plane.</p></div></div>
            <div className="account-id-grid">
              <div><span>JASLYN ID</span><strong>ID {publicId}</strong><small>Human-friendly workspace reference.</small></div>
              <div><span>Tenant ID</span><strong className="account-mono">{tenantId || '—'}</strong><small>Canonical tenant identifier used by the API.</small></div>
              <div><span>Workspace slug</span><strong>{data?.tenant?.slug || '—'}</strong><small>Machine-friendly workspace handle.</small></div>
              <div><span>Status</span><strong>{data?.tenant?.status || '—'}</strong><small>{subscriptionName}</small></div>
            </div>
          </section>

          <section id="profile" className="account-detail-section">
            <div className="account-section-head"><div><span>02 / PROFILE</span><h2>Business profile</h2><p>Keep operator-facing business details accurate across the workspace.</p></div></div>
            <form className="account-form" onSubmit={(event) => { event.preventDefault(); void save('/account/profile', profile, 'Profile saved successfully.'); }}>
              {([
                ['businessName', 'Business name'],
                ['contactName', 'Contact name'],
                ['phone', 'Phone'],
                ['email', 'Email'],
                ['address', 'Address'],
              ] as const).map(([key, label]) => (
                <label key={key}><span>{label}</span><input value={profile[key]} onChange={(event) => setProfile({ ...profile, [key]: event.target.value })} /></label>
              ))}
              <button className="account-primary-button" disabled={busy}>Save profile</button>
            </form>
          </section>

          <section id="team" className="account-detail-section">
            <div className="account-section-head"><div><span>03 / TEAM</span><h2>Team access</h2><p>Manage operator access without leaving the workspace account surface.</p></div><span className="account-count">{members.length} members</span></div>
            <form className="account-team-form" onSubmit={addMember}>
              <input name="fullName" required placeholder="Full name" />
              <input name="email" required type="email" placeholder="Email" />
              <input name="password" required minLength={8} type="password" placeholder="Temporary password" />
              <select name="role" defaultValue="CASHIER">{ROLES.map((role) => <option key={role}>{role}</option>)}</select>
              <button className="account-primary-button" disabled={busy}>Add member</button>
            </form>
            <div className="account-member-list">
              {members.map((member) => (
                <div className="account-member" key={member.id}>
                  <div className="account-member-avatar">{member.fullName.slice(0, 1).toUpperCase()}</div>
                  <div className="account-member-copy"><strong>{member.fullName}</strong><small>{member.email}</small></div>
                  <select value={member.role} onChange={(event) => void teamPatch(member.id, { role: event.target.value })}>{ROLES.map((role) => <option key={role}>{role}</option>)}</select>
                  <button type="button" onClick={() => void teamPatch(member.id, { isActive: !member.isActive })}>{member.isActive ? 'Disable' : 'Enable'}</button>
                </div>
              ))}
            </div>
          </section>

          <section id="branding" className="account-detail-section">
            <div className="account-section-head"><div><span>04 / CUSTOMER EXPERIENCE</span><h2>Customer portal branding</h2><p>Control the presentation shown to customers without changing network logic.</p></div></div>
            <form className="account-form" onSubmit={(event) => { event.preventDefault(); void save('/account/branding', brand, 'Portal branding saved.'); }}>
              {([
                ['brandColor', 'Brand color'],
                ['logoUrl', 'Portal logo URL'],
                ['supportPhone', 'Support phone'],
                ['supportWhatsapp', 'Support WhatsApp'],
                ['supportEmail', 'Support email'],
                ['portalHeadline', 'Portal headline'],
                ['portalSubtitle', 'Portal subtitle'],
              ] as const).map(([key, label]) => (
                <label key={key}><span>{label}</span><input value={brand[key]} onChange={(event) => setBrand({ ...brand, [key]: event.target.value })} /></label>
              ))}
              <div className="portal-preview" style={{ borderTopColor: brand.brandColor }}>
                <div><span>Customer portal preview</span><strong>{brand.portalHeadline}</strong><small>{brand.portalSubtitle}</small></div>
                <b>BUY</b>
              </div>
              <button className="account-primary-button" disabled={busy}>Save portal branding</button>
            </form>
          </section>

          <section id="payments" className="account-detail-section">
            <div className="account-section-head"><div><span>05 / PAYMENTS</span><h2>Payment display</h2><p>Control which payment surfaces the customer portal exposes.</p></div></div>
            <div className="account-toggle-list">
              <label className="account-toggle-row"><span><strong>Vouchers</strong><small>Allow customers to access voucher purchase surfaces.</small></span><input type="checkbox" checked={payments.acceptVouchers} onChange={(event) => setPayments({ ...payments, acceptVouchers: event.target.checked })} /></label>
              <label className="account-toggle-row"><span><strong>Online payments</strong><small>Expose supported online payment flows in the customer portal.</small></span><input type="checkbox" checked={payments.acceptOnlinePayments} onChange={(event) => setPayments({ ...payments, acceptOnlinePayments: event.target.checked })} /></label>
            </div>
            <button className="account-primary-button" disabled={busy} onClick={() => void save('/account/payment-display', payments, 'Payment display saved.')}>Save payment display</button>
          </section>

          <section id="privacy" className="account-detail-section">
            <div className="account-section-head"><div><span>06 / PRIVACY & DATA</span><h2>Your data</h2><p>Export the tenant data currently stored by JASLYN NET.</p></div></div>
            <div className="account-data-action"><div><strong>Download workspace data</strong><small>Exports your tenant records as JSON from the authenticated account endpoint.</small></div><button className="account-secondary-button" disabled={busy} onClick={() => void exportData()}>Export data</button></div>
          </section>

          <section id="support" className="account-detail-section">
            <div className="account-section-head"><div><span>07 / SUPPORT</span><h2>Contact support</h2><p>Send a support request with this workspace identity attached to the account context.</p></div></div>
            <textarea className="account-support-input" value={support} onChange={(event) => setSupport(event.target.value)} placeholder="Describe the issue or request" />
            <button className="account-primary-button" disabled={busy || support.trim().length < 5} onClick={async () => { setBusy(true); try { await apiFetch('/account/support', { method: 'POST', headers: { ...tokenHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ message: support }) }); setSupport(''); setMessage('Support ticket created.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Support request failed'); } finally { setBusy(false); } }}>Send support request</button>
          </section>

          <section className="account-detail-section account-danger-section">
            <div className="account-section-head"><div><span>08 / ACCOUNT LIFECYCLE</span><h2>{data?.lifecycle?.state === 'DELETION_PENDING' ? 'Deletion scheduled' : 'Close account'}</h2><p>Workspace closure and deletion are intentionally kept away from everyday controls.</p></div><Icon name="danger" /></div>
            {data?.lifecycle?.state === 'DELETION_PENDING' ? (
              <button className="account-secondary-button" onClick={() => void lifecycleAction('/account/cancel-deletion')}>Cancel scheduled deletion</button>
            ) : (
              <div className="account-danger-actions">
                <button className="account-danger-button" disabled={busy} onClick={() => void lifecycleAction('/account/close')}>Close workspace</button>
                <input value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="Type DELETE MY JASLYN NET ACCOUNT" />
                <button className="account-danger-button" disabled={busy || confirm !== 'DELETE MY JASLYN NET ACCOUNT'} onClick={() => void lifecycleAction('/account/delete-request', { confirmation: confirm })}>Schedule deletion</button>
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
