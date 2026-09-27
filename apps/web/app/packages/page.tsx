'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { getAccessToken } from '../../lib/auth';
import { apiFetch } from '../../lib/api';

type FeatureFlags = Record<string, boolean>;
type Package = {
  id: string;
  name: string;
  price: string | number;
  currency: string;
  durationSeconds: number;
  dataLimitBytes?: number | null;
  downloadBps?: number | null;
  uploadBps?: number | null;
  devicesPerCode: number;
  showOnPortal: boolean;
  isFreeTrial: boolean;
  freeTrialFrequency: string;
  tierCode?: string | null;
  tierRank?: number | null;
  tagline?: string | null;
  featureFlags?: FeatureFlags;
  isFeatured?: boolean;
  isActive: boolean;
};

type Tier = {
  code: string;
  name: string;
  rank: number;
  tagline: string;
  price: number;
  currency: string;
  durationSeconds: number;
  dataLimitBytes: number | null;
  downloadBps: number;
  uploadBps: number;
  devicesPerCode: number;
  featureFlags: FeatureFlags;
  featured: boolean;
  configured?: boolean;
  package?: Partial<Package> | null;
};

type Response = { data: Package[]; pagination: { page: number; limit: number; total: number; pages: number } };
type TierResponse = { data: Tier[] };

const duration = (s: number) => s % 86400 === 0 ? `${s / 86400} day${s === 86400 ? '' : 's'}` : s % 3600 === 0 ? `${s / 3600} hour${s === 3600 ? '' : 's'}` : `${Math.max(1, Math.floor(s / 60))} min`;
const speed = (bps?: number | null) => !bps ? 'Unlimited' : `${Math.round(bps / 1000000)} Mbps`;
const data = (bytes?: number | null) => !bytes ? 'Unlimited' : `${(bytes / 1_000_000_000).toFixed(bytes % 1_000_000_000 === 0 ? 0 : 1)} GB`;
const money = (value: number | string, currency = 'TZS') => `${currency} ${Number(value).toLocaleString()}`;
const featureLabel = (key: string) => ({
  hotspot: 'Hotspot access',
  captivePortal: 'Captive portal',
  vouchers: 'Voucher management',
  usageTracking: 'Usage tracking',
  multiDevice: 'Multi-device access',
  qos: 'QoS controls',
  radius: 'RADIUS / AAA',
  analytics: 'Advanced analytics',
  ipam: 'IP address management',
  automation: 'Network automation',
  loadBalancing: 'Multi-WAN load balancing',
  apiAccess: 'API access',
  multiLocation: 'Multi-location operations',
  audit: 'Audit trail',
  prioritySupport: 'Priority support',
  unlimitedData: 'Unlimited data policy',
  advancedNetworkControl: 'Advanced network control',
} as Record<string, string>)[key] ?? key.replaceAll(/([A-Z])/g, ' $1');

export default function PackagesPage() {
  const [rows, setRows] = useState<Package[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [pagination, setPagination] = useState<Response['pagination']>({ page: 1, limit: 25, total: 0, pages: 0 });
  const [pageNo, setPageNo] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [provisioning, setProvisioning] = useState('');
  const [selectedTier, setSelectedTier] = useState<Tier | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ name: '', price: '', duration: '1', unit: 'day', dataGb: '', down: '', up: '', devices: '1', show: true, trial: false, frequency: 'ONCE_PER_PHONE' });

  const token = (): Record<string, string> => {
    const t = getAccessToken();
    return t ? { Authorization: 'Bearer ' + t } : {};
  };

  async function load(p = pageNo, q = search) {
    setLoading(true);
    setError('');
    try {
      const headers = token();
      const [packages, catalog] = await Promise.all([
        apiFetch<Response>('/packages?' + new URLSearchParams({ page: String(p), limit: '25', ...(q.trim() ? { search: q.trim() } : {}) }), { headers }),
        apiFetch<TierResponse>('/packages/tiers/availability', { headers }),
      ]);
      setRows(packages.data || []);
      setPagination(packages.pagination);
      setPageNo(p);
      setTiers(catalog.data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load package catalogue.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(1, ''); }, []);

  async function provisionTier(tier: Tier) {
    setProvisioning(tier.code);
    setError('');
    setMessage('');
    try {
      await apiFetch(`/packages/tiers/${encodeURIComponent(tier.code)}/provision`, {
        method: 'POST',
        headers: { ...token(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ price: tier.price, durationSeconds: tier.durationSeconds, showOnPortal: true }),
      });
      setMessage(`${tier.name} is now configured in the commercial catalogue.`);
      await load(pageNo, search);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to configure this plan.');
    } finally {
      setProvisioning('');
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const units: Record<string, number> = { minute: 60, hour: 3600, day: 86400, week: 604800, month: 2592000 };
      await apiFetch('/packages', {
        method: 'POST',
        headers: { ...token(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          price: Number(form.price),
          durationSeconds: Number(form.duration) * units[form.unit],
          dataLimitBytes: form.dataGb ? Number(form.dataGb) * 1000000000 : undefined,
          downloadBps: form.down ? Number(form.down) * 1000000 : undefined,
          uploadBps: form.up ? Number(form.up) * 1000000 : undefined,
          devicesPerCode: Number(form.devices),
          showOnPortal: form.show,
          isFreeTrial: form.trial,
          freeTrialFrequency: form.frequency,
        }),
      });
      setForm({ ...form, name: '', price: '' });
      setMessage('Custom package created.');
      await load(1, search);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to create package.');
    } finally {
      setSaving(false);
    }
  }

  const featured = useMemo(() => tiers.find(t => t.featured) ?? tiers[Math.min(3, Math.max(0, tiers.length - 1))], [tiers]);

  return (
    <main className="packages-console">
      <section className="packages-intro">
        <div>
          <span className="eyebrow">JASLYN NET / COMMERCIAL CONTROL</span>
          <h1>Plans & Packages</h1>
          <p>Design, publish and operate connectivity plans from one commercial catalogue. Clear entitlements, transparent limits and a deliberate upgrade path.</p>
        </div>
        <div className="intro-actions">
          <a href="/purchases" className="secondary-action">Open purchases</a>
          <button type="button" className="primary-action" onClick={() => document.getElementById('create-package')?.scrollIntoView({ behavior: 'smooth' })}>Create custom plan</button>
        </div>
      </section>

      {error && <div className="system-message error" role="alert"><strong>Action required</strong><span>{error}</span></div>}
      {message && <div className="system-message success" role="status"><strong>Catalogue updated</strong><span>{message}</span></div>}

      <section className="catalogue">
        <div className="section-heading">
          <div><span className="section-label">JASLYN PLAN CATALOGUE</span><h2>Choose a service level that makes sense</h2><p>Every tier explains what the customer receives, rather than hiding the useful information behind a price tag.</p></div>
          <span className="catalogue-count">{tiers.length} standard tiers</span>
        </div>

        <div className="tier-grid">
          {tiers.map(tier => (
            <article key={tier.code} className={`tier-card ${tier.featured ? 'featured' : ''} ${tier.configured ? 'configured' : ''}`}>
              {tier.featured && <div className="featured-ribbon">RECOMMENDED CONFIGURATION</div>}
              <div className="tier-top">
                <div><span className="tier-code">{tier.code}</span><h3>{tier.name.replace('Jaslyn ', '')}</h3><p>{tier.tagline}</p></div>
                <span className={tier.configured ? 'state configured-state' : 'state'}>{tier.configured ? 'CONFIGURED' : 'AVAILABLE'}</span>
              </div>
              <div className="tier-price"><strong>{money(tier.price, tier.currency)}</strong><span>/ {duration(tier.durationSeconds)}</span></div>
              <div className="capacity">
                <div><span>Data allowance</span><strong>{data(tier.dataLimitBytes)}</strong></div>
                <div><span>Download</span><strong>{speed(tier.downloadBps)}</strong></div>
                <div><span>Upload</span><strong>{speed(tier.uploadBps)}</strong></div>
                <div><span>Devices</span><strong>{tier.devicesPerCode}</strong></div>
              </div>
              <div className="feature-list">
                {Object.entries(tier.featureFlags).filter(([, enabled]) => enabled).slice(0, 6).map(([key]) => <span key={key}>✓ {featureLabel(key)}</span>)}
              </div>
              <div className="tier-actions">
                <button type="button" className="text-action" onClick={() => setSelectedTier(tier)}>View details</button>
                {tier.configured
                  ? <a className="upgrade-action" href="/purchases">Upgrade / sell access</a>
                  : <button type="button" className="upgrade-action" disabled={provisioning === tier.code} onClick={() => void provisionTier(tier)}>{provisioning === tier.code ? 'Configuring…' : 'Activate plan'}</button>}
              </div>
            </article>
          ))}
        </div>
      </section>

      {featured && (
        <section className="explain-panel">
          <div>
            <span className="section-label">WHY THE TIERS MATTER</span>
            <h2>Commercial clarity without the small-business-template look.</h2>
            <p>Jaslyn plans are connected to the same package and entitlement model used by purchases. A plan is not decorative pricing copy: its bandwidth, quota, device allowance and feature flags describe the network policy customers actually receive.</p>
          </div>
          <div className="explain-stats">
            <div><strong>{tiers.filter(t => t.configured).length}</strong><span>configured tiers</span></div>
            <div><strong>{rows.filter(p => p.isActive).length}</strong><span>active packages</span></div>
            <div><strong>{featured.name.replace('Jaslyn ', '')}</strong><span>featured tier</span></div>
          </div>
        </section>
      )}

      <section className="catalogue-detail">
        <div className="section-heading compact">
          <div><span className="section-label">PACKAGE OPERATIONS</span><h2>Configured products</h2><p>Operational records currently attached to this tenant.</p></div>
          <form onSubmit={e => { e.preventDefault(); void load(1, search); }} className="search"><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by plan, tier or description" aria-label="Search packages" /><button>Search</button></form>
        </div>
        <div className="package-table-wrap">
          <table><thead><tr><th>Plan</th><th>Commercial</th><th>Network policy</th><th>Access</th><th>Status</th><th /></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={6} className="table-state">Loading catalogue…</td></tr> : rows.length === 0 ? <tr><td colSpan={6} className="table-state">No configured packages match this search.</td></tr> : rows.map(pkg => (
                <tr key={pkg.id}>
                  <td><div className="product-name"><strong>{pkg.name}</strong><span>{pkg.tagline || (pkg.tierCode ? `Jaslyn ${pkg.tierCode}` : 'Custom commercial package')}</span></div></td>
                  <td><strong>{money(pkg.price, pkg.currency)}</strong><span className="subvalue">{duration(pkg.durationSeconds)}</span></td>
                  <td><span>{speed(pkg.downloadBps)} ↓ / {speed(pkg.uploadBps)} ↑</span><span className="subvalue">{data(pkg.dataLimitBytes)} · {pkg.devicesPerCode} device{pkg.devicesPerCode === 1 ? '' : 's'}</span></td>
                  <td><span>{pkg.showOnPortal ? 'Customer portal' : 'Private'}</span><span className="subvalue">{pkg.isFreeTrial ? 'Free trial enabled' : 'Standard purchase'}</span></td>
                  <td><span className={pkg.isActive ? 'status-dot live' : 'status-dot'}>{pkg.isActive ? 'Active' : 'Inactive'}</span></td>
                  <td><a href="/purchases" className="row-action">Open sales →</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pagination.pages > 1 && <div className="pager"><button disabled={pageNo <= 1} onClick={() => void load(pageNo - 1)}>Previous</button><span>Page {pageNo} of {pagination.pages}</span><button disabled={pageNo >= pagination.pages} onClick={() => void load(pageNo + 1)}>Next</button></div>}
      </section>

      <section id="create-package" className="create-section">
        <div className="create-copy"><span className="section-label">CUSTOM COMMERCIAL PRODUCT</span><h2>Create a plan outside the standard catalogue</h2><p>Use this for tenant-specific packages. Standard Jaslyn tiers remain centrally defined so pricing and network entitlements do not drift across the product.</p></div>
        <form onSubmit={create} className="create-form">
          <label>Plan name<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Campus Pro" /></label>
          <div className="form-grid"><label>Duration<input type="number" min="1" required value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })} /></label><label>Unit<select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}><option value="minute">minute</option><option value="hour">hour</option><option value="day">day</option><option value="week">week</option><option value="month">month</option></select></label></div>
          <label>Price (TZS)<input type="number" min="0" required value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} /></label>
          <div className="form-grid"><label>Download Mbps<input type="number" min="1" value={form.down} onChange={e => setForm({ ...form, down: e.target.value })} placeholder="Unlimited" /></label><label>Upload Mbps<input type="number" min="1" value={form.up} onChange={e => setForm({ ...form, up: e.target.value })} placeholder="Unlimited" /></label></div>
          <div className="form-grid"><label>Data cap GB<input type="number" min="1" value={form.dataGb} onChange={e => setForm({ ...form, dataGb: e.target.value })} placeholder="Unlimited" /></label><label>Devices per code<select value={form.devices} onChange={e => setForm({ ...form, devices: e.target.value })}>{[1, 2, 3, 4, 5, 10].map(n => <option key={n} value={n}>{n} device{n === 1 ? '' : 's'}</option>)}</select></label></div>
          <label className="checkbox"><input type="checkbox" checked={form.show} onChange={e => setForm({ ...form, show: e.target.checked })} /> <span>Publish on customer portal</span></label>
          <label className="checkbox"><input type="checkbox" checked={form.trial} onChange={e => setForm({ ...form, trial: e.target.checked })} /> <span>Enable free trial</span></label>
          {form.trial && <select value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })}><option value="ONCE_PER_PHONE">Once per phone</option><option value="ONCE_PER_CUSTOMER">Once per customer</option><option value="UNLIMITED">Unlimited claims</option></select>}
          <button className="primary-action" disabled={saving}>{saving ? 'Creating…' : 'Create custom package'}</button>
        </form>
      </section>

      {selectedTier && <div className="detail-overlay" role="dialog" aria-modal="true" aria-label={selectedTier.name} onClick={() => setSelectedTier(null)}>
        <article className="detail-modal" onClick={e => e.stopPropagation()}>
          <button className="close" type="button" onClick={() => setSelectedTier(null)} aria-label="Close">×</button>
          <span className="section-label">{selectedTier.code} / SERVICE DEFINITION</span>
          <h2>{selectedTier.name}</h2><p className="modal-tagline">{selectedTier.tagline}</p>
          <div className="modal-price">{money(selectedTier.price, selectedTier.currency)} <span>/ {duration(selectedTier.durationSeconds)}</span></div>
          <div className="modal-grid"><div><span>Data</span><strong>{data(selectedTier.dataLimitBytes)}</strong></div><div><span>Download</span><strong>{speed(selectedTier.downloadBps)}</strong></div><div><span>Upload</span><strong>{speed(selectedTier.uploadBps)}</strong></div><div><span>Devices</span><strong>{selectedTier.devicesPerCode}</strong></div></div>
          <h3>Included capabilities</h3>
          <div className="modal-features">{Object.entries(selectedTier.featureFlags).filter(([, enabled]) => enabled).map(([key]) => <span key={key}>✓ {featureLabel(key)}</span>)}</div>
          <div className="modal-footer">{selectedTier.configured ? <a href="/purchases" className="upgrade-action">Continue to upgrade / sell access</a> : <button className="upgrade-action" disabled={provisioning === selectedTier.code} onClick={() => void provisionTier(selectedTier)}>{provisioning === selectedTier.code ? 'Configuring…' : 'Activate this plan'}</button>}<button className="text-action" onClick={() => setSelectedTier(null)}>Close</button></div>
        </article>
      </div>}

      <style jsx>{`
        .packages-console{min-height:100vh;background:#f5f7fa;color:#101828;padding:42px 46px 70px}
        .packages-intro,.catalogue,.catalogue-detail,.create-section,.explain-panel{max-width:1540px;margin:0 auto}
        .packages-intro{display:flex;justify-content:space-between;gap:40px;align-items:flex-end;margin-bottom:28px}
        .eyebrow,.section-label,.tier-code{font-size:9px;font-weight:800;letter-spacing:.16em;color:#718096}
        h1{font-size:36px;letter-spacing:-.035em;margin:8px 0 8px;font-weight:700} .packages-intro p{max-width:720px;margin:0;color:#667085;font-size:13px;line-height:1.65}
        .intro-actions,.tier-actions,.modal-footer{display:flex;gap:9px;align-items:center}.primary-action,.secondary-action,.upgrade-action,.text-action{height:38px;border-radius:7px;padding:0 15px;font-size:11px;font-weight:750;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
        .primary-action,.upgrade-action{background:#17132b;color:#fff;border:1px solid #17132b}.secondary-action{background:#fff;color:#344054;border:1px solid #d9dee8}.text-action{background:transparent;border:0;color:#5b45d6}.upgrade-action{background:#6246d9;border-color:#6246d9}.upgrade-action:disabled,.primary-action:disabled{opacity:.55;cursor:wait}
        .system-message{max-width:1540px;margin:0 auto 14px;padding:12px 15px;border:1px solid;border-radius:8px;font-size:11px;display:flex;gap:10px}.system-message span{color:#667085}.system-message.error{background:#fff7f7;border-color:#f0cccc;color:#a33a46}.system-message.success{background:#f5fbf8;border-color:#cce8da;color:#167052}
        .section-heading{display:flex;justify-content:space-between;gap:30px;align-items:end;margin:42px 0 18px}.section-heading.compact{margin-top:38px}.section-heading h2{font-size:20px;letter-spacing:-.02em;margin:6px 0}.section-heading p{font-size:11px;color:#7a8494;margin:0}.catalogue-count{font-size:10px;color:#667085}
        .tier-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.tier-card{position:relative;background:#fff;border:1px solid #e3e7ed;border-radius:10px;padding:19px;min-height:425px;display:flex;flex-direction:column;box-shadow:0 1px 2px rgba(16,24,40,.025)}.tier-card.featured{border-color:#8068dc;box-shadow:0 12px 34px rgba(98,70,217,.11)}.featured-ribbon{position:absolute;top:0;left:0;right:0;padding:6px;text-align:center;background:#f0edff;color:#6246d9;border-radius:10px 10px 0 0;font-size:7px;font-weight:850;letter-spacing:.12em}.featured .tier-top{margin-top:18px}
        .tier-top{display:flex;justify-content:space-between;gap:8px}.tier-top h3{font-size:17px;margin:4px 0 5px;letter-spacing:-.02em}.tier-top p{font-size:10px;color:#7a8494;line-height:1.5;margin:0;min-height:30px}.state{font-size:7px;font-weight:800;letter-spacing:.08em;background:#f5f6f8;color:#798392;border-radius:4px;padding:5px 6px;height:max-content}.configured-state{background:#edf8f3;color:#197451}
        .tier-price{display:flex;align-items:baseline;gap:5px;border-bottom:1px solid #edf0f4;padding:20px 0 14px}.tier-price strong{font-size:22px;letter-spacing:-.03em}.tier-price span{font-size:9px;color:#8993a2}.capacity{display:grid;grid-template-columns:1fr 1fr;gap:9px;padding:14px 0}.capacity div{display:flex;flex-direction:column;gap:3px}.capacity span,.modal-grid span{font-size:8px;color:#8a94a3}.capacity strong,.modal-grid strong{font-size:10px;color:#344054}.feature-list{display:grid;gap:6px;flex:1;border-top:1px solid #edf0f4;padding-top:13px}.feature-list span{font-size:9px;color:#5f6b7a}.tier-actions{border-top:1px solid #edf0f4;padding-top:13px;margin-top:14px}.tier-actions .text-action{padding-left:0}.tier-actions .upgrade-action{margin-left:auto}
        .explain-panel{margin-top:14px;background:#111827;color:#fff;border-radius:12px;padding:25px 28px;display:grid;grid-template-columns:1.5fr 1fr;gap:30px}.explain-panel .section-label{color:#aeb7c6}.explain-panel h2{font-size:21px;letter-spacing:-.025em;margin:7px 0}.explain-panel p{font-size:11px;color:#c0c7d1;line-height:1.7;max-width:760px;margin:0}.explain-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;align-items:center}.explain-stats div{border-left:1px solid rgba(255,255,255,.13);padding-left:16px}.explain-stats strong{display:block;font-size:20px}.explain-stats span{font-size:8px;color:#aeb7c6}
        .search{display:flex;height:36px}.search input{width:310px;border:1px solid #dfe4eb;border-right:0;border-radius:7px 0 0 7px;padding:0 10px;font-size:10px;background:#fff}.search button{border:1px solid #dfe4eb;background:#fff;border-radius:0 7px 7px 0;padding:0 13px;font-size:10px;font-weight:700}
        .package-table-wrap{background:#fff;border:1px solid #e1e6ec;border-radius:10px;overflow:auto}.package-table-wrap table{width:100%;border-collapse:collapse;min-width:850px}.package-table-wrap th{text-align:left;background:#f8fafc;color:#7a8494;font-size:8px;text-transform:uppercase;letter-spacing:.1em;font-weight:800;padding:12px 14px;border-bottom:1px solid #e6eaf0}.package-table-wrap td{padding:13px 14px;border-bottom:1px solid #edf0f4;font-size:10px;color:#344054}.package-table-wrap tr:last-child td{border-bottom:0}.product-name{display:grid;gap:3px}.product-name strong{font-size:10px}.product-name span,.subvalue{font-size:8px;color:#8a94a3;display:block;margin-top:3px}.status-dot{font-size:9px;color:#9b4b55}.status-dot.live{color:#197451}.status-dot:before{content:'•';margin-right:5px}.row-action{color:#6246d9;text-decoration:none;font-size:9px;font-weight:750}.table-state{text-align:center!important;padding:45px!important;color:#8993a2!important}.pager{display:flex;justify-content:flex-end;gap:10px;align-items:center;padding:12px 0;font-size:9px;color:#7a8494}.pager button{background:#fff;border:1px solid #dfe4eb;border-radius:6px;padding:7px 10px;font-size:9px}.pager button:disabled{opacity:.4}
        .create-section{margin-top:40px;background:#fff;border:1px solid #e1e6ec;border-radius:12px;padding:25px 28px;display:grid;grid-template-columns:1fr 1.3fr;gap:42px}.create-copy h2{font-size:20px;letter-spacing:-.02em;margin:7px 0}.create-copy p{font-size:11px;color:#7a8494;line-height:1.65;max-width:480px}.create-form{display:grid;gap:11px}.create-form label{font-size:9px;color:#667085;font-weight:750}.create-form input,.create-form select{display:block;width:100%;height:37px;margin-top:5px;border:1px solid #dfe4eb;border-radius:7px;background:#fff;padding:0 9px;font-size:10px;color:#344054}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.checkbox{display:flex!important;align-items:center;gap:7px}.checkbox input{width:auto!important;margin:0}.create-form .primary-action{margin-top:3px}
        .detail-overlay{position:fixed;inset:0;background:rgba(10,15,28,.62);backdrop-filter:blur(8px);display:grid;place-items:center;padding:20px;z-index:100}.detail-modal{width:min(620px,100%);max-height:90vh;overflow:auto;background:#fff;border-radius:12px;padding:28px;box-shadow:0 30px 100px rgba(0,0,0,.25);position:relative}.close{position:absolute;right:16px;top:14px;border:0;background:transparent;font-size:24px;color:#7a8494;cursor:pointer}.detail-modal h2{font-size:28px;margin:8px 0 3px}.modal-tagline{font-size:11px;color:#7a8494;margin:0}.modal-price{font-size:25px;font-weight:750;margin:22px 0}.modal-price span{font-size:9px;color:#8993a2;font-weight:500}.modal-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:#e8ebf0;border:1px solid #e8ebf0;border-radius:8px;overflow:hidden}.modal-grid div{background:#f8fafc;padding:12px;display:grid;gap:4px}.detail-modal h3{font-size:12px;margin:22px 0 10px}.modal-features{display:grid;grid-template-columns:1fr 1fr;gap:8px}.modal-features span{font-size:9px;color:#475467}.modal-footer{border-top:1px solid #edf0f4;margin-top:22px;padding-top:15px}.modal-footer .text-action{margin-left:auto}
        @media(max-width:1180px){.tier-grid{grid-template-columns:repeat(2,1fr)}.packages-intro{align-items:flex-start}.explain-panel,.create-section{grid-template-columns:1fr}}
        @media(max-width:720px){.packages-console{padding:25px 14px 50px}.packages-intro{display:block}.intro-actions{margin-top:18px}.tier-grid{grid-template-columns:1fr}.section-heading{display:block}.search{margin-top:13px}.search input{width:100%}.explain-stats{margin-top:20px}.create-section{padding:20px}.modal-grid{grid-template-columns:1fr 1fr}.modal-features{grid-template-columns:1fr}.modal-footer{flex-wrap:wrap}.packages-intro h1{font-size:30px}}
        @media(prefers-reduced-motion:reduce){.detail-overlay *{transition:none!important}}
      `}</style>
    </main>
  );
}
