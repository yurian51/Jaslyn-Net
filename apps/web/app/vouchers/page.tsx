'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../../lib/api';
import { getAccessToken } from '../../lib/auth';

type Voucher = { id: string; code: string; packageId: string; packageName: string; status: string; expiresAt?: string | null; usedAt?: string | null };
type Package = { id: string; name: string; price: string | number; currency: string; durationSeconds: number; isActive: boolean };
type Customer = { id: string; fullName: string; username: string; isActive: boolean };
type Router = { id: string; name: string; status?: string };

type ListResponse<T> = { data: T[]; pagination?: { total?: number } };

function date(value?: string | null) {
  if (!value) return 'No expiry';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Invalid date' : new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
}

function duration(seconds: number) {
  const days = Math.floor(seconds / 86400);
  if (days) return `${days} day${days === 1 ? '' : 's'}`;
  const hours = Math.floor(seconds / 3600);
  if (hours) return `${hours} hour${hours === 1 ? '' : 's'}`;
  return `${Math.max(1, Math.floor(seconds / 60))} min`;
}

export default function VouchersPage() {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [routers, setRouters] = useState<Router[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [batch, setBatch] = useState({ packageId: '', quantity: '10', expiresInSeconds: '2592000' });
  const [redeem, setRedeem] = useState({ code: '', customerId: '', routerId: '' });

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) { setLoading(false); setError('Sign in to manage vouchers.'); return; }
    setLoading(true); setError('');
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [voucherData, packageData, customerData, routerData] = await Promise.all([
        apiFetch<ListResponse<Voucher>>('/vouchers', { headers }),
        apiFetch<ListResponse<Package>>('/packages?limit=100&activeOnly=true', { headers }),
        apiFetch<ListResponse<Customer>>('/customers?limit=100&activeOnly=true', { headers }),
        apiFetch<ListResponse<Router>>('/routers', { headers }),
      ]);
      setVouchers(voucherData.data ?? []);
      setPackages(packageData.data ?? []);
      setCustomers(customerData.data ?? []);
      setRouters(routerData.data ?? []);
      setBatch((current) => ({ ...current, packageId: current.packageId || packageData.data?.[0]?.id || '' }));
      setRedeem((current) => ({ ...current, customerId: current.customerId || customerData.data?.[0]?.id || '' }));
    } catch (cause: unknown) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Unable to load voucher operations.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getAccessToken();
    if (!token) return setError('Sign in before generating vouchers.');
    if (!batch.packageId) return setError('Select an active package.');
    setSaving(true); setError(''); setSuccess('');
    try {
      const result = await apiFetch<{ count: number; codes: string[]; expiresAt?: string | null }>('/vouchers/batches', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ packageId: batch.packageId, quantity: Number(batch.quantity), expiresInSeconds: Number(batch.expiresInSeconds) }),
      });
      setSuccess(`Generated ${result.count} voucher${result.count === 1 ? '' : 's'}. Codes are shown below and can be exported from this view.`);
      await load();
    } catch (cause: unknown) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Unable to generate vouchers.');
    } finally { setSaving(false); }
  }

  async function redeemVoucher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getAccessToken();
    if (!token) return setError('Sign in before redeeming a voucher.');
    if (!redeem.code.trim() || !redeem.customerId) return setError('Voucher code and customer are required.');
    setSaving(true); setError(''); setSuccess('');
    try {
      const result = await apiFetch<{ redeemed: boolean; purchaseId: string; startsAt: string; endsAt: string }>(`/vouchers/${encodeURIComponent(redeem.code.trim())}/redeem`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ customerId: redeem.customerId, ...(redeem.routerId ? { routerId: redeem.routerId } : {}) }),
      });
      setSuccess(`Voucher redeemed. Access purchase ${result.purchaseId.slice(0, 12)}… is active until ${date(result.endsAt)}.`);
      setRedeem((current) => ({ ...current, code: '' }));
      await load();
    } catch (cause: unknown) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Unable to redeem voucher.');
    } finally { setSaving(false); }
  }

  const unused = vouchers.filter((voucher) => voucher.status === 'UNUSED').length;
  const used = vouchers.filter((voucher) => voucher.status === 'USED').length;
  const expired = vouchers.filter((voucher) => voucher.status === 'EXPIRED').length;

  return <main className="voucher-page">
    <header className="header"><div><div className="eyebrow">JASLYN NET / COMMERCIAL OPERATIONS</div><h1>Vouchers</h1><p>Generate prepaid WiFi access codes, track their lifecycle and redeem them into customer access.</p></div><button className="refresh" onClick={() => void load()} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button></header>
    {error && <div className="notice error" role="alert">{error}</div>}
    {success && <div className="notice success" role="status">{success}</div>}

    <section className="kpis"><article><span>Total codes</span><strong>{vouchers.length}</strong></article><article><span>Unused</span><strong>{unused}</strong></article><article><span>Redeemed</span><strong>{used}</strong></article><article><span>Expired</span><strong>{expired}</strong></article></section>

    <section className="layout">
      <article className="panel"><div className="panel-kicker">BATCH PROVISIONING</div><h2>Generate voucher batch</h2><p>Create up to 10,000 unique codes for an active WiFi package. The API generates the codes transactionally.</p>
        <form onSubmit={createBatch} className="form"><label>WiFi package<select required value={batch.packageId} onChange={(event) => setBatch({ ...batch, packageId: event.target.value })}><option value="">Select package</option>{packages.map((pkg) => <option key={pkg.id} value={pkg.id}>{pkg.name} · {pkg.currency} {Number(pkg.price).toLocaleString()} · {duration(pkg.durationSeconds)}</option>)}</select></label><label>Quantity<input required type="number" min="1" max="10000" value={batch.quantity} onChange={(event) => setBatch({ ...batch, quantity: event.target.value })}/></label><label>Expiry (seconds)<input required type="number" min="60" max="31536000" value={batch.expiresInSeconds} onChange={(event) => setBatch({ ...batch, expiresInSeconds: event.target.value })}/></label><button className="primary" disabled={saving}>{saving ? 'Generating…' : 'Generate vouchers'}</button></form>
      </article>
      <article className="panel"><div className="panel-kicker">ACCESS ACTIVATION</div><h2>Redeem voucher</h2><p>Redeeming creates a paid purchase and active access grant inside the same tenant transaction.</p>
        <form onSubmit={redeemVoucher} className="form"><label>Voucher code<input required maxLength={32} value={redeem.code} onChange={(event) => setRedeem({ ...redeem, code: event.target.value.toUpperCase() })} placeholder="ABC123456789"/></label><label>Customer<select required value={redeem.customerId} onChange={(event) => setRedeem({ ...redeem, customerId: event.target.value })}><option value="">Select customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.fullName} · {customer.username}</option>)}</select></label><label>Router (optional)<select value={redeem.routerId} onChange={(event) => setRedeem({ ...redeem, routerId: event.target.value })}><option value="">Any / not specified</option>{routers.map((router) => <option key={router.id} value={router.id}>{router.name}{router.status ? ` · ${router.status}` : ''}</option>)}</select></label><button className="primary" disabled={saving}>{saving ? 'Redeeming…' : 'Redeem voucher'}</button></form>
      </article>
    </section>

    <section className="panel ledger"><div className="panel-head"><div><div className="panel-kicker">VOUCHER LEDGER</div><h2>{vouchers.length.toLocaleString()} recent codes</h2></div></div>{loading ? <div className="empty">Loading voucher ledger…</div> : vouchers.length === 0 ? <div className="empty">No vouchers have been generated for this tenant.</div> : <div className="table-wrap"><table><thead><tr><th>CODE</th><th>PACKAGE</th><th>STATUS</th><th>EXPIRES</th><th>USED</th></tr></thead><tbody>{vouchers.map((voucher) => <tr key={voucher.id}><td><code>{voucher.code}</code></td><td><strong>{voucher.packageName}</strong><small>{voucher.packageId.slice(0, 12)}…</small></td><td><span className={`status ${voucher.status.toLowerCase()}`}>{voucher.status}</span></td><td>{date(voucher.expiresAt)}</td><td>{date(voucher.usedAt)}</td></tr>)}</tbody></table></div>}</section>
    <footer>JASLYN NET · Prepaid access operations · Tenant scoped</footer>
    <style jsx>{`.voucher-page{min-height:100vh;background:#f6f8fb;color:#172033;padding:36px 42px}.header{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;max-width:1500px;margin-bottom:18px}.eyebrow,.panel-kicker{font-size:8px;font-weight:800;letter-spacing:.13em;color:#8a96a8}.header h1{font-size:28px;letter-spacing:-.04em;margin:6px 0 4px}.header p{margin:0;color:#7d899a;font-size:11px}.refresh{border:1px solid #dfe4eb;background:#fff;border-radius:7px;padding:9px 12px;font-size:9px}.notice{max-width:1500px;margin:0 0 12px;padding:10px;border-radius:7px;font-size:9px}.notice.error{background:#fff3f4;color:#b34d58;border:1px solid #f3d5d8}.notice.success{background:#edf9f2;color:#2c7d58;border:1px solid #d5efdf}.kpis{max-width:1500px;display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px}.kpis article{background:#fff;border:1px solid #e2e7ee;border-radius:9px;padding:15px}.kpis span{display:block;color:#8a95a4;font-size:8px;text-transform:uppercase;letter-spacing:.08em}.kpis strong{display:block;margin-top:7px;font-size:22px;letter-spacing:-.03em}.layout{max-width:1500px;display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}.panel{background:#fff;border:1px solid #e2e7ee;border-radius:10px;padding:18px}.panel h2{font-size:15px;margin:6px 0}.panel p{font-size:9px;line-height:1.6;color:#8792a1;margin:0 0 16px}.form{display:flex;flex-direction:column;gap:11px}.form label{font-size:8px;font-weight:750;color:#69768a}.form input,.form select{display:block;width:100%;height:36px;margin-top:5px;border:1px solid #dfe4eb;border-radius:6px;padding:0 9px;background:#fff;font-size:9px;outline:0}.primary{height:38px;border:0;border-radius:7px;background:#4f70dc;color:#fff;font-size:9px;font-weight:800}.primary:disabled{opacity:.5}.ledger{max-width:1500px}.panel-head{display:flex;justify-content:space-between;align-items:center}.table-wrap{overflow:auto;margin-top:14px}table{width:100%;border-collapse:collapse;min-width:700px}th{text-align:left;padding:9px;font-size:7px;color:#96a0ae;letter-spacing:.08em;border-bottom:1px solid #edf0f4}td{padding:11px 9px;border-bottom:1px solid #f0f2f5;font-size:9px;color:#596579}td strong{display:block;color:#263247}td small{display:block;color:#a0a8b4;font-size:7px;margin-top:3px}code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;letter-spacing:.06em;color:#263247}.status{display:inline-block;padding:4px 7px;border-radius:4px;font-size:7px;font-weight:800}.status.unused{background:#edf7f1;color:#2f805d}.status.used{background:#eef2f7;color:#687589}.status.expired{background:#fff0f1;color:#b64b57}.empty{text-align:center;padding:50px;color:#8a95a4;font-size:10px}footer{max-width:1500px;padding:18px 2px;color:#9aa4b1;font-size:8px}@media(max-width:900px){.layout{grid-template-columns:1fr}.kpis{grid-template-columns:repeat(2,1fr)}}@media(max-width:650px){.voucher-page{padding:20px 13px}.header{flex-direction:column}.refresh{width:100%}.kpis{grid-template-columns:repeat(2,1fr)}.panel{padding:14px}}`}</style>
  </main>;
}
