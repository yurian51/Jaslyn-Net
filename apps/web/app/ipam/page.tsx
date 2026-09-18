'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../../lib/api';
import { getAccessToken } from '../../lib/auth';

type Pool = {
  id: string; name: string; network: string; gateway?: string | null; role: string;
  allocationMode: string; vlanId?: number | null; enabled: boolean;
  addressCount: number; availableCount: number; allocatedCount: number; reservedCount: number;
};

type PoolResponse = { data: Pool[] };

export default function IpamPage() {
  const [pools, setPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', network: '', gateway: '', role: 'CUSTOMER', allocationMode: 'INVENTORY', vlanId: '' });

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) { setError('Authentication required.'); setLoading(false); return; }
    setLoading(true);
    try {
      const result = await apiFetch<PoolResponse>('/ipam/pools', { headers: { Authorization: `Bearer ${token}` } });
      setPools(Array.isArray(result.data) ? result.data : []);
      setError(null);
    } catch (cause: unknown) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Unable to load IPAM pools.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createPool(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getAccessToken();
    if (!token) { setError('Authentication required.'); return; }
    setSaving(true); setError(null);
    try {
      await apiFetch('/ipam/pools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: form.name.trim(), network: form.network.trim(), gateway: form.gateway.trim() || undefined,
          role: form.role, allocationMode: form.allocationMode, vlanId: form.vlanId ? Number(form.vlanId) : undefined,
        }),
      });
      setForm({ name: '', network: '', gateway: '', role: 'CUSTOMER', allocationMode: 'INVENTORY', vlanId: '' });
      setShowCreate(false);
      await load();
    } catch (cause: unknown) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Unable to create IPAM pool.');
    } finally { setSaving(false); }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><img src="/brand/file_000000006450821195473e1e14153e8a.svg" alt="" /></div><div><span>JASLYN NET</span><small>Network operations platform</small></div></div>
        <div className="workspace-switch"><span className="workspace-dot"/> Global Workspace <span>⌄</span></div>
        <nav className="nav"><p className="nav-section">OPERATIONS</p>
          <a className="nav-item" href="/dashboard">Overview</a><a className="nav-item" href="/customers">Customers</a><a className="nav-item" href="/sessions">Sessions</a>
          <a className="nav-item" href="/network">Network</a><a className="nav-item active" href="/ipam">IPAM</a><a className="nav-item" href="/purchases">Purchases</a>
          <a className="nav-item" href="/packages">Plans &amp; Products</a><a className="nav-item" href="/audit">Security &amp; Audit</a>
        </nav>
      </aside>
      <section className="content">
        <header className="topbar"><div><div className="eyebrow">JASLYN NET / IPAM</div><h1>IP address management</h1><p className="context">Tenant-scoped IPv4/IPv6 pools, inventory and lease state. No synthetic utilization is shown.</p></div>
          <div className="top-actions"><button className="selector primary-action" onClick={() => setShowCreate(true)}>+ Add pool</button><button className="selector" onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button></div>
        </header>
        {error && <div className="error-banner" role="alert">{error}</div>}
        {showCreate && <section className="panel form-panel"><div className="panel-head"><div><div className="panel-kicker">POOL DEFINITION</div><h2>Create IP pool</h2><p>Overlapping networks are rejected before persistence.</p></div><button className="selector" onClick={() => setShowCreate(false)}>Close</button></div>
          <form className="form-grid" onSubmit={createPool}>
            <label>Name<input required value={form.name} onChange={e => setForm({...form,name:e.target.value})} placeholder="Customer IPv4"/></label>
            <label>Network / CIDR<input required value={form.network} onChange={e => setForm({...form,network:e.target.value})} placeholder="10.20.0.0/24"/></label>
            <label>Gateway<input value={form.gateway} onChange={e => setForm({...form,gateway:e.target.value})} placeholder="10.20.0.1"/></label>
            <label>Role<select value={form.role} onChange={e => setForm({...form,role:e.target.value})}><option>CUSTOMER</option><option>WAN</option><option>VLAN</option><option>LOOPBACK</option><option>MANAGEMENT</option><option>OTHER</option></select></label>
            <label>Allocation mode<select value={form.allocationMode} onChange={e => setForm({...form,allocationMode:e.target.value})}><option>INVENTORY</option><option>DYNAMIC</option></select></label>
            <label>VLAN ID<input type="number" min="1" max="4094" value={form.vlanId} onChange={e => setForm({...form,vlanId:e.target.value})} placeholder="Optional"/></label>
            <div className="form-actions"><button type="button" className="selector" onClick={() => setShowCreate(false)}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? 'Creating…' : 'Create pool'}</button></div>
          </form>
        </section>}
        <section className="kpi-grid">
          <article className="kpi"><div className="kpi-label"><span>Pools</span></div><strong>{loading ? '—' : pools.length}</strong><div className="kpi-foot"><span>IPAM</span><small>tenant scoped</small></div></article>
          <article className="kpi"><div className="kpi-label"><span>Inventory</span></div><strong>{loading ? '—' : pools.reduce((n,p) => n+p.addressCount,0)}</strong><div className="kpi-foot"><span>ADDRESSES</span><small>persisted inventory</small></div></article>
          <article className="kpi"><div className="kpi-label"><span>Available</span></div><strong>{loading ? '—' : pools.reduce((n,p) => n+p.availableCount,0)}</strong><div className="kpi-foot"><span>AVAILABLE</span><small>allocatable now</small></div></article>
          <article className="kpi"><div className="kpi-label"><span>Allocated</span></div><strong>{loading ? '—' : pools.reduce((n,p) => n+p.allocatedCount,0)}</strong><div className="kpi-foot"><span>LEASED</span><small>authoritative state</small></div></article>
        </section>
        <section className="panel"><div className="panel-head"><div><div className="panel-kicker">ADDRESS FABRIC</div><h2>IP pools</h2><p>{pools.length ? 'Live database state.' : 'No IPAM pools configured.'}</p></div></div>
          <div className="table-wrap"><table><thead><tr><th>POOL</th><th>NETWORK</th><th>ROLE</th><th>MODE</th><th>INVENTORY</th><th>ALLOCATED</th><th>AVAILABLE</th></tr></thead><tbody>
            {pools.map(p => <tr key={p.id}><td><strong>{p.name}</strong>{p.gateway && <><br/><small>GW {p.gateway}</small></>}</td><td>{p.network}</td><td>{p.role}</td><td>{p.allocationMode}</td><td>{p.addressCount}</td><td>{p.allocatedCount}</td><td>{p.availableCount}</td></tr>)}
          </tbody></table>{!loading && !pools.length && <div className="empty-state"><strong>No IPAM pools configured.</strong><span>Create a pool, then add real address inventory before allocation.</span></div>}</div>
        </section>
        <footer className="footer"><span>JASLYN NET · IPAM</span><span>Authoritative database state only</span></footer>
      </section>
      <style jsx>{`
        .primary-action{background:#172033!important;color:#fff!important;border-color:#172033!important}
        .form-panel{margin-bottom:12px}.form-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.form-grid label{font-size:8px;font-weight:750;color:#69768a}.form-grid input,.form-grid select{display:block;width:100%;height:37px;margin-top:5px;border:1px solid #dfe4eb;border-radius:7px;padding:0 10px;background:#fff;font-size:9px;color:#172033}.form-actions{grid-column:1/-1;display:flex;justify-content:flex-end;gap:8px;padding-top:8px}.primary-button{height:37px;padding:0 15px;border:0;border-radius:7px;background:#4f70dc;color:#fff;font-size:9px;font-weight:800}.empty-state{display:flex;flex-direction:column;align-items:center;gap:8px;padding:55px 20px;color:#8a95a4;font-size:10px}.empty-state strong{font-size:13px;color:#4d5a6f}@media(max-width:900px){.form-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){.form-grid{grid-template-columns:1fr}}
      `}</style>
    </main>
  );
}
