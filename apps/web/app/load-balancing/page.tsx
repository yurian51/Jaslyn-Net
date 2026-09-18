'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, apiFetch } from '../../lib/api';
import { getAccessToken } from '../../lib/auth';

type Wan = {
  id: string; routerId: string; name: string; provider?: string | null; interfaceName?: string | null; gateway?: string | null;
  capacityMbps: number; configuredWeight: number; priority: number; failoverPriority: number; enabled: boolean; drainRequested: boolean;
  healthState: string; latencyMs: number | null; jitterMs: number | null; packetLossPercent: number | null; observedUtilizationPercent: number | null;
  observedUploadBps: string; observedDownloadBps: string; activeSessions: number; lastHealthCheckAt: string | null;
  routingCapabilities: { telemetry: boolean; gatewayHealth: boolean; policyRouting: boolean; weightedLoadBalancing: boolean; failover: boolean; routeRead: boolean; routeWrite: boolean };
};

type Policy = { id: string; routerId: string; name: string; strategy: string; enabled: boolean; capacityAware: boolean; memberCount: number; routingCapabilities: Wan['routingCapabilities'] };
type PolicyStatus = Policy & { members: Wan[]; decision: { eligibleMembers: Array<{ wanConnectionId: string; configuredWeight: number; effectiveWeight: number; priority: number; healthState: string; capacityMbps: number; utilizationPercent: number | null }>; failoverActive: boolean }; generatedAt: string; appliedToRouter: boolean; applyAvailable: boolean };
type ApplyResult = { applied: boolean; verified: boolean; protocol?: string; reason?: string };
type Collection<T> = { data: T[]; count: number };
type Router = { id: string; name: string; managementProtocol?: string; managementEnabled?: boolean; };
const STRATEGIES = ['WEIGHTED','PRIMARY_SECONDARY','LEAST_UTILIZED','CONNECTION_BASED','POLICY_BASED','SERVICE_BASED','DESTINATION_BASED','SOURCE_BASED','SUBNET_BASED','CUSTOMER_BASED'] as const;
type WanForm = { routerId: string; name: string; provider: string; interfaceName: string; gateway: string; capacityMbps: string; configuredWeight: string; priority: string; failoverPriority: string; };
type PolicyForm = { routerId: string; name: string; strategy: typeof STRATEGIES[number]; capacityAware: boolean; members: string[] };
const EMPTY_WAN_FORM: WanForm = { routerId: '', name: '', provider: '', interfaceName: '', gateway: '', capacityMbps: '', configuredWeight: '1', priority: '100', failoverPriority: '100' };
const EMPTY_POLICY_FORM: PolicyForm = { routerId: '', name: '', strategy: 'PRIMARY_SECONDARY', capacityAware: true, members: [] };

function fmt(value: number | null | undefined, suffix = '') { return value == null || !Number.isFinite(Number(value)) ? '—' : `${Number(value).toFixed(1)}${suffix}`; }
function formatBytesPerSecond(value: string | undefined) { const bytes = Number(value ?? 0); if (!Number.isFinite(bytes)) return '—'; const mbps = bytes * 8 / 1_000_000; return `${mbps >= 100 ? mbps.toFixed(0) : mbps.toFixed(1)} Mbps`; }
function badgeClass(state: string) { return `badge ${state.toLowerCase()}`; }

export default function LoadBalancingPage() {
  const [wans, setWans] = useState<Wan[]>([]); const [policies, setPolicies] = useState<Policy[]>([]); const [selectedPolicy, setSelectedPolicy] = useState<string>('');
  const [status, setStatus] = useState<PolicyStatus | null>(null); const [lastApply, setLastApply] = useState<ApplyResult | null>(null); const [routers, setRouters] = useState<Router[]>([]);
  const [loading, setLoading] = useState(true); const [statusLoading, setStatusLoading] = useState(false); const [working, setWorking] = useState(false); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  const [showProvisioning, setShowProvisioning] = useState(false); const [wanForm, setWanForm] = useState<WanForm>(EMPTY_WAN_FORM); const [policyForm, setPolicyForm] = useState<PolicyForm>(EMPTY_POLICY_FORM);

  const load = useCallback(async () => { const token = getAccessToken(); if (!token) { setError('Authentication required.'); setLoading(false); return; } setLoading(true); setError(null); try { const headers = { Authorization: `Bearer ${token}` }; const [wanResponse, policyResponse, routerResponse] = await Promise.all([
        apiFetch<Collection<Wan>>('/load-balancing/wan', { headers }),
        apiFetch<Collection<Policy>>('/load-balancing/policies', { headers }),
        apiFetch<{ data: Router[] }>('/routers', { headers }),
      ]);
      const nextRouters = routerResponse.data ?? [];
      setWans(wanResponse.data ?? []); setPolicies(policyResponse.data ?? []); setRouters(nextRouters);
      setSelectedPolicy((current) => current && (policyResponse.data ?? []).some((p) => p.id === current) ? current : policyResponse.data?.[0]?.id ?? '');
      setWanForm((current) => ({ ...current, routerId: current.routerId || nextRouters[0]?.id || '' }));
      setPolicyForm((current) => ({ ...current, routerId: current.routerId || nextRouters[0]?.id || '' })); } catch (cause: unknown) { setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Unable to load WAN operations.'); } finally { setLoading(false); } }, []);
  const loadStatus = useCallback(async (policyId: string) => { if (!policyId) { setStatus(null); return; } const token = getAccessToken(); if (!token) return; setStatusLoading(true); try { setStatus(await apiFetch<PolicyStatus>(`/load-balancing/policies/${policyId}/status`, { headers: { Authorization: `Bearer ${token}` } })); } catch (cause: unknown) { setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Unable to load load-balancing status.'); } finally { setStatusLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]); useEffect(() => { void loadStatus(selectedPolicy); }, [selectedPolicy, loadStatus]);

  async function createWan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getAccessToken();
    if (!token) return setError('Authentication required.');
    if (!wanForm.routerId || !wanForm.name.trim() || !wanForm.capacityMbps) return setError('Router, WAN name and capacity are required.');
    const capacity = Number(wanForm.capacityMbps);
    if (!Number.isFinite(capacity) || capacity <= 0) return setError('WAN capacity must be greater than zero.');
    setSaving(true); setError(null);
    try {
      await apiFetch('/load-balancing/wan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          routerId: wanForm.routerId, name: wanForm.name.trim(), provider: wanForm.provider.trim() || undefined,
          interfaceName: wanForm.interfaceName.trim() || undefined, gateway: wanForm.gateway.trim() || undefined,
          capacityMbps: capacity, configuredWeight: wanForm.configuredWeight.trim() ? Number(wanForm.configuredWeight) : 1,
          priority: wanForm.priority.trim() ? Number(wanForm.priority) : 100, failoverPriority: wanForm.failoverPriority.trim() ? Number(wanForm.failoverPriority) : 100, enabled: true,
        }),
      });
      setWanForm((current) => ({ ...EMPTY_WAN_FORM, routerId: current.routerId }));
      await load();
    } catch (cause: unknown) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Unable to create WAN connection.');
    } finally { setSaving(false); }
  }

  async function createPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getAccessToken();
    if (!token) return setError('Authentication required.');
    if (!policyForm.routerId || !policyForm.name.trim()) return setError('Router and policy name are required.');
    const members = wans.filter((wan) => wan.routerId === policyForm.routerId && policyForm.members.includes(wan.id)).map((wan) => ({
      wanConnectionId: wan.id, configuredWeight: wan.configuredWeight, priority: wan.priority, enabled: true,
    }));
    if (!members.length) return setError('Select at least one WAN member for the policy.');
    setSaving(true); setError(null);
    try {
      await apiFetch('/load-balancing/policies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ routerId: policyForm.routerId, name: policyForm.name.trim(), strategy: policyForm.strategy, capacityAware: policyForm.capacityAware, enabled: true, members }),
      });
      setPolicyForm((current) => ({ ...EMPTY_POLICY_FORM, routerId: current.routerId }));
      setShowProvisioning(false);
      await load();
    } catch (cause: unknown) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Unable to create load-balancing policy.');
    } finally { setSaving(false); }
  }

  async function toggleDrain(wan: Wan) {
    const token = getAccessToken();
    if (!token) return setError('Authentication required.');
    setWorking(true); setError(null);
    try {
      await apiFetch(`/load-balancing/wan/${wan.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ drainRequested: !wan.drainRequested }),
      });
      await load();
      if (selectedPolicy) await loadStatus(selectedPolicy);
    } catch (cause: unknown) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Unable to update WAN drain state.');
    } finally { setWorking(false); }
  }

  const summary = useMemo(() => { const available = wans.filter((wan) => wan.enabled && !wan.drainRequested && ['HEALTHY', 'DEGRADED', 'RECOVERING'].includes(wan.healthState)); const down = wans.filter((wan) => ['UNAVAILABLE', 'DISABLED'].includes(wan.healthState) || !wan.enabled).length; const utilization = available.map((wan) => wan.observedUtilizationPercent).filter((x): x is number => x != null && Number.isFinite(Number(x))); return { available: available.length, down, maxUtilization: utilization.length ? Math.max(...utilization) : null }; }, [wans]);

  async function rebalance() { if (!selectedPolicy) return; const token = getAccessToken(); if (!token) { setError('Authentication required.'); return; } setWorking(true); setError(null); try { const result = await apiFetch<{ networkApply?: ApplyResult }>(`/load-balancing/policies/${selectedPolicy}/rebalance`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ reason: 'operator_rebalance' }) }); setLastApply(result.networkApply ?? null); await loadStatus(selectedPolicy); } catch (cause: unknown) { setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Rebalance decision failed.'); } finally { setWorking(false); } }

  return <main className="shell">
    <header className="header"><div><div className="eyebrow">JASLYN NET / NOC</div><h1>WAN &amp; Load Balancing</h1><p>Configured policy and observed network state stay separate. Router changes are only available when the connected adapter exposes and implements the required capability.</p></div><div className="actions"><a href="/network" className="button secondary">Network inventory</a><button className="button" onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button></div></header>
    {error && <div className="error" role="alert">{error}</div>}
    <section className="panel provisioning-panel">
      <div className="panel-head">
        <div><span className="kicker">NETWORK PROVISIONING</span><h2>Build WAN topology</h2><p>Create real WAN connections and policies from the same tenant-scoped control plane.</p></div>
        <button type="button" className="button secondary" onClick={() => setShowProvisioning((value) => !value)}>{showProvisioning ? 'Hide provisioning' : '+ Add WAN / policy'}</button>
      </div>
      {showProvisioning && <div className="provision-grid">
        <form className="provision-card" onSubmit={createWan}>
          <div className="provision-title">WAN connection</div>
          <label>Router<select required value={wanForm.routerId} onChange={(e) => setWanForm((v) => ({ ...v, routerId: e.target.value }))}><option value="">Select router</option>{routers.map((router) => <option key={router.id} value={router.id}>{router.name} · {router.managementProtocol ?? 'protocol unset'}</option>)}</select></label>
          <label>Name<input required maxLength={120} value={wanForm.name} onChange={(e) => setWanForm((v) => ({ ...v, name: e.target.value }))} placeholder="Primary Fiber"/></label>
          <div className="form-two"><label>Provider<input maxLength={120} value={wanForm.provider} onChange={(e) => setWanForm((v) => ({ ...v, provider: e.target.value }))} placeholder="ISP"/></label><label>Interface<input maxLength={120} value={wanForm.interfaceName} onChange={(e) => setWanForm((v) => ({ ...v, interfaceName: e.target.value }))} placeholder="ether1"/></label></div>
          <div className="form-two"><label>Gateway<input maxLength={45} value={wanForm.gateway} onChange={(e) => setWanForm((v) => ({ ...v, gateway: e.target.value }))} placeholder="192.168.1.1"/></label><label>Capacity Mbps<input required type="number" min="0.001" step="0.001" value={wanForm.capacityMbps} onChange={(e) => setWanForm((v) => ({ ...v, capacityMbps: e.target.value }))} placeholder="100"/></label></div>
          <div className="form-three"><label>Weight<input type="number" min="1" max="100000" value={wanForm.configuredWeight} onChange={(e) => setWanForm((v) => ({ ...v, configuredWeight: e.target.value }))}/></label><label>Priority<input type="number" min="0" max="100000" value={wanForm.priority} onChange={(e) => setWanForm((v) => ({ ...v, priority: e.target.value }))}/></label><label>Failover priority<input type="number" min="0" max="100000" value={wanForm.failoverPriority} onChange={(e) => setWanForm((v) => ({ ...v, failoverPriority: e.target.value }))}/></label></div>
          <button className="button" type="submit" disabled={saving || !routers.length}>{saving ? 'Saving…' : 'Create WAN connection'}</button>
        </form>
        <form className="provision-card" onSubmit={createPolicy}>
          <div className="provision-title">Load-balancing policy</div>
          <label>Router<select required value={policyForm.routerId} onChange={(e) => setPolicyForm((v) => ({ ...v, routerId: e.target.value, members: [] }))}><option value="">Select router</option>{routers.map((router) => <option key={router.id} value={router.id}>{router.name}</option>)}</select></label>
          <label>Name<input required maxLength={120} value={policyForm.name} onChange={(e) => setPolicyForm((v) => ({ ...v, name: e.target.value }))} placeholder="Primary / Secondary WAN"/></label>
          <label>Strategy<select value={policyForm.strategy} onChange={(e) => setPolicyForm((v) => ({ ...v, strategy: e.target.value as PolicyForm['strategy'] }))}>{STRATEGIES.map((strategy) => <option key={strategy} value={strategy}>{strategy.replaceAll('_', ' ')}</option>)}</select></label>
          <label className="checkbox-row"><input type="checkbox" checked={policyForm.capacityAware} onChange={(e) => setPolicyForm((v) => ({ ...v, capacityAware: e.target.checked }))}/><span>Use capacity-aware decisioning</span></label>
          <fieldset><legend>WAN members</legend><div className="member-picker">{wans.filter((wan) => wan.routerId === policyForm.routerId).map((wan) => <label key={wan.id} className="member-option"><input type="checkbox" checked={policyForm.members.includes(wan.id)} onChange={(e) => setPolicyForm((v) => ({ ...v, members: e.target.checked ? [...v.members, wan.id] : v.members.filter((id) => id !== wan.id) }))}/><span><strong>{wan.name}</strong><small>{wan.provider ?? 'Provider unset'} · {wan.capacityMbps} Mbps · {wan.healthState}</small></span></label>)}{!wans.some((wan) => wan.routerId === policyForm.routerId) && <div className="member-empty">Create a WAN connection for this router first.</div>}</div></fieldset>
          <button className="button" type="submit" disabled={saving || !routers.length}>{saving ? 'Saving…' : 'Create policy'}</button>
        </form>
      </div>}
    </section>
    <section className="summary-grid" aria-label="WAN summary"><div className="card"><span>WAN members</span><strong>{wans.length}</strong><small>{summary.available} eligible now</small></div><div className="card"><span>Unavailable / disabled</span><strong>{summary.down}</strong><small>Observed state</small></div><div className="card"><span>Peak utilization</span><strong>{fmt(summary.maxUtilization, '%')}</strong><small>Current telemetry only</small></div><div className="card"><span>Policies</span><strong>{policies.length}</strong><small>Tenant scoped</small></div></section>
    <section className="panel"><div className="panel-head"><div><span className="kicker">WAN OVERVIEW</span><h2>Connectivity members</h2></div><span className="muted">{loading ? 'Loading live data…' : `${wans.length} configured`}</span></div><div className="wan-grid">{wans.map((wan) => <article className="wan-card" key={wan.id}><div className="wan-top"><div><strong>{wan.name}</strong><small>{wan.provider ?? 'Provider not set'} · {wan.interfaceName ?? 'Interface not set'}</small></div><span className={badgeClass(wan.healthState)}>{wan.healthState}</span></div><div className="metrics"><div><span>Capacity</span><strong>{wan.capacityMbps} Mbps</strong></div><div><span>Weight</span><strong>{wan.configuredWeight}</strong></div><div><span>Priority</span><strong>{wan.priority}</strong></div><div><span>Sessions</span><strong>{wan.activeSessions}</strong></div><div><span>Latency</span><strong>{fmt(wan.latencyMs, ' ms')}</strong></div><div><span>Loss</span><strong>{fmt(wan.packetLossPercent, '%')}</strong></div></div><div className="traffic"><div><span>Download</span><strong>{formatBytesPerSecond(wan.observedDownloadBps)}</strong></div><div><span>Upload</span><strong>{formatBytesPerSecond(wan.observedUploadBps)}</strong></div><div><span>Utilization</span><strong>{fmt(wan.observedUtilizationPercent, '%')}</strong></div></div><div className="capabilities"><span className={wan.routingCapabilities.weightedLoadBalancing ? 'cap supported' : 'cap'}>Weighted LB</span><span className={wan.routingCapabilities.failover ? 'cap supported' : 'cap'}>Failover</span><span className={wan.routingCapabilities.routeWrite ? 'cap supported' : 'cap'}>Route write</span><span className={wan.routingCapabilities.telemetry ? 'cap supported' : 'cap'}>Telemetry</span></div><div className="wan-foot"><span>{wan.gateway ? `Gateway ${wan.gateway}` : 'Gateway not configured'}</span><span>{wan.drainRequested ? 'Drain requested' : wan.enabled ? 'Enabled' : 'Disabled'}</span><button type="button" className="drain-button" onClick={() => void toggleDrain(wan)} disabled={working}>{wan.drainRequested ? 'Release drain' : 'Drain WAN'}</button></div></article>)}{!loading && !wans.length && <div className="empty">No WAN connections exist yet. The page is intentionally empty rather than inventing links.</div>}</div></section>
    <section className="panel"><div className="panel-head"><div><span className="kicker">LOAD BALANCE POLICY</span><h2>Deterministic path decision</h2></div><label className="policy-select">Policy<select value={selectedPolicy} onChange={(e) => { setSelectedPolicy(e.target.value); setLastApply(null); }}><option value="">Select policy</option>{policies.map((policy) => <option key={policy.id} value={policy.id}>{policy.name} · {policy.strategy}</option>)}</select></label></div>
      {!selectedPolicy ? <div className="empty">Create a load-balancing policy to inspect eligibility and distribution.</div> : statusLoading ? <div className="empty">Evaluating current WAN state…</div> : status ? <><div className="policy-banner"><div><strong>{status.name}</strong><span>{status.strategy} · {status.capacityAware ? 'capacity-aware' : 'configured-weight only'}</span></div><div className="policy-state"><span className={status.decision.failoverActive ? 'dot warning' : 'dot healthy'}/>{status.decision.failoverActive ? 'Failover/degradation state active' : 'Normal eligibility'}</div></div><div className="capability-banner"><div><strong>Router capability</strong><span>{status.routingCapabilities.routeWrite ? 'Route write exposed by adapter' : 'Route write not exposed by adapter'}</span></div><div><strong>Telemetry</strong><span>{status.routingCapabilities.telemetry ? 'Available' : 'Not available'}</span></div><div><strong>Failover</strong><span>{status.routingCapabilities.failover ? 'Available' : 'Not available'}</span></div></div><div className="distribution">{status.decision.eligibleMembers.map((member) => <div className="distribution-row" key={member.wanConnectionId}><div><strong>{status.members.find((wan) => wan.id === member.wanConnectionId)?.name ?? member.wanConnectionId}</strong><small>{member.healthState} · configured weight {member.configuredWeight}</small></div><div className="bar"><i style={{ width: `${Math.min(100, member.effectiveWeight / Math.max(...status.decision.eligibleMembers.map((x) => x.effectiveWeight), 1) * 100)}%` }}/></div><strong>{member.effectiveWeight.toFixed(2)}</strong><span>{fmt(member.utilizationPercent, '%')}</span></div>)}</div><div className="notice"><strong>{status.applyAvailable ? 'Adapter capability available' : 'Decision-only mode'}</strong><span>{status.applyAvailable ? 'Router write capability is exposed by the selected management protocol. The currently integrated automatic route application path is MikroTik PRIMARY_SECONDARY; other protocols remain decision-only until their vendor adapter is implemented.' : 'This policy is calculated and audited without claiming to have changed router routing.'}</span></div>{lastApply && <div className={`apply-result ${lastApply.applied && lastApply.verified ? 'success' : 'warning'}`} role="status"><strong>{lastApply.applied && lastApply.verified ? 'Router change verified' : 'Decision recorded without verified router application'}</strong><span>{lastApply.reason ?? `${lastApply.protocol ?? 'Adapter'} completed without a verification error.`}</span></div>}<div className="actions-row"><button className="button" onClick={() => void rebalance()} disabled={working || !status.decision.eligibleMembers.length}>{working ? 'Applying & verifying…' : 'Recalculate & apply rebalance'}</button><span className="muted">Generated {new Date(status.generatedAt).toLocaleString()}</span></div></> : <div className="empty">No status data returned.</div>}
    </section>
  </main>;
}
