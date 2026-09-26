'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, apiFetch } from '../../lib/api';
import { getAccessToken } from '../../lib/auth';
import BrandLogo from '../brand-logo';

type Wan = {
  id: string; routerId: string; name: string; provider?: string | null; interfaceName?: string | null; gateway?: string | null;
  capacityMbps: number; configuredWeight: number; priority: number; failoverPriority: number; enabled: boolean; drainRequested: boolean;
  healthState: string; latencyMs: number | null; jitterMs: number | null; packetLossPercent: number | null; observedUtilizationPercent: number | null;
  observedUploadBps: string; observedDownloadBps: string; activeSessions: number; lastHealthCheckAt: string | null;
  routingCapabilities: { telemetry: boolean; gatewayHealth: boolean; policyRouting: boolean; weightedLoadBalancing: boolean; failover: boolean; routeRead: boolean; routeWrite: boolean };
};

type Policy = {
  id: string; routerId: string; name: string; strategy: string; enabled: boolean; capacityAware: boolean;
  memberCount: number; routingCapabilities: Wan['routingCapabilities'];
};

type PolicyStatus = Policy & {
  members: Wan[];
  decision: {
    eligibleMembers: Array<{
      wanConnectionId: string; configuredWeight: number; effectiveWeight: number; priority: number; healthState: string;
      capacityMbps: number; utilizationPercent: number | null;
    }>;
    failoverActive: boolean;
  };
  generatedAt: string;
  appliedToRouter: boolean;
  applyAvailable: boolean;
};

type ApplyResult = { applied: boolean; verified: boolean; protocol?: string; reason?: string };
type Collection<T> = { data: T[]; count: number };
type Router = { id: string; name: string; managementProtocol?: string; managementEnabled?: boolean };

const STRATEGIES = [
  'WEIGHTED', 'PRIMARY_SECONDARY', 'LEAST_UTILIZED', 'CONNECTION_BASED', 'POLICY_BASED',
  'SERVICE_BASED', 'DESTINATION_BASED', 'SOURCE_BASED', 'SUBNET_BASED', 'CUSTOMER_BASED',
] as const;

type WanForm = {
  routerId: string; name: string; provider: string; interfaceName: string; gateway: string;
  capacityMbps: string; configuredWeight: string; priority: string; failoverPriority: string;
};

type PolicyForm = {
  routerId: string; name: string; strategy: typeof STRATEGIES[number]; capacityAware: boolean; members: string[];
};

const EMPTY_WAN_FORM: WanForm = {
  routerId: '', name: '', provider: '', interfaceName: '', gateway: '', capacityMbps: '',
  configuredWeight: '1', priority: '100', failoverPriority: '100',
};

const EMPTY_POLICY_FORM: PolicyForm = {
  routerId: '', name: '', strategy: 'PRIMARY_SECONDARY', capacityAware: true, members: [],
};

function fmt(value: number | null | undefined, suffix = '') {
  return value == null || !Number.isFinite(Number(value)) ? '—' : `${Number(value).toFixed(1)}${suffix}`;
}

function formatBytesPerSecond(value: string | undefined) {
  const bytes = Number(value ?? 0);
  if (!Number.isFinite(bytes)) return '—';
  const mbps = (bytes * 8) / 1_000_000;
  return `${mbps >= 100 ? mbps.toFixed(0) : mbps.toFixed(1)} Mbps`;
}

function stateClass(state: string) {
  return state.toLowerCase().replace(/[^a-z]+/g, '-');
}

function Icon({ name }: { name: 'refresh' | 'plus' | 'wan' | 'policy' | 'activity' | 'warning' | 'drain' | 'search' | 'router' | 'check' | 'route' }) {
  const paths = {
    refresh: <><path d="M20 11a8 8 0 0 0-14.8-4.1L4 9" /><path d="M4 5v4h4" /><path d="M4 13a8 8 0 0 0 14.8 4.1L20 15" /><path d="M20 19v-4h-4" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    wan: <><circle cx="6" cy="7" r="2" /><circle cx="18" cy="17" r="2" /><path d="M8 8.5 16 15.5M18 7v4M18 11l-2-2M18 11l2-2M6 17v-4M6 13l-2 2M6 13l2 2" /></>,
    policy: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    activity: <><path d="M3 12h4l2.2-5 4 10L16 12h5" /></>,
    warning: <><path d="m12 3 9 17H3L12 3Z" /><path d="M12 9v4M12 16h.01" /></>,
    drain: <><path d="M5 6h14M7 11h10M9 16h6" /><path d="M12 4v16" /></>,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
    router: <><rect x="4" y="7" width="16" height="10" rx="2" /><path d="M8 11h.01M12 11h.01M16 11h.01M8 14h8" /></>,
    check: <path d="m5 12 4 4 10-10" />,
    route: <><circle cx="6" cy="6" r="2" /><circle cx="18" cy="18" r="2" /><path d="m8 7 8 10" /><path d="M14 8h5v5" /></>,
  } as const;

  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export default function LoadBalancingPage() {
  const [wans, setWans] = useState<Wan[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [routers, setRouters] = useState<Router[]>([]);
  const [selectedPolicy, setSelectedPolicy] = useState('');
  const [status, setStatus] = useState<PolicyStatus | null>(null);
  const [lastApply, setLastApply] = useState<ApplyResult | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [statusLoading, setStatusLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showProvisioning, setShowProvisioning] = useState(false);
  const [wanForm, setWanForm] = useState<WanForm>(EMPTY_WAN_FORM);
  const [policyForm, setPolicyForm] = useState<PolicyForm>(EMPTY_POLICY_FORM);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setError('Authentication required.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [wanResponse, policyResponse, routerResponse] = await Promise.all([
        apiFetch<Collection<Wan>>('/load-balancing/wan', { headers }),
        apiFetch<Collection<Policy>>('/load-balancing/policies', { headers }),
        apiFetch<{ data: Router[] }>('/routers', { headers }),
      ]);

      const nextRouters = routerResponse.data ?? [];
      setWans(wanResponse.data ?? []);
      setPolicies(policyResponse.data ?? []);
      setRouters(nextRouters);
      setSelectedPolicy((current) =>
        current && (policyResponse.data ?? []).some((policy) => policy.id === current)
          ? current
          : policyResponse.data?.[0]?.id ?? '',
      );
      setWanForm((current) => ({ ...current, routerId: current.routerId || nextRouters[0]?.id || '' }));
      setPolicyForm((current) => ({ ...current, routerId: current.routerId || nextRouters[0]?.id || '' }));
    } catch (cause: unknown) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Unable to load WAN operations.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStatus = useCallback(async (policyId: string) => {
    if (!policyId) {
      setStatus(null);
      return;
    }

    const token = getAccessToken();
    if (!token) return;

    setStatusLoading(true);
    try {
      setStatus(await apiFetch<PolicyStatus>(`/load-balancing/policies/${policyId}/status`, {
        headers: { Authorization: `Bearer ${token}` },
      }));
    } catch (cause: unknown) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Unable to load load-balancing status.');
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadStatus(selectedPolicy);
  }, [selectedPolicy, loadStatus]);

  async function createWan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getAccessToken();
    if (!token) {
      setError('Authentication required.');
      return;
    }

    if (!wanForm.routerId || !wanForm.name.trim() || !wanForm.capacityMbps) {
      setError('Router, WAN name and capacity are required.');
      return;
    }

    const capacity = Number(wanForm.capacityMbps);
    if (!Number.isFinite(capacity) || capacity <= 0) {
      setError('WAN capacity must be greater than zero.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await apiFetch('/load-balancing/wan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          routerId: wanForm.routerId,
          name: wanForm.name.trim(),
          provider: wanForm.provider.trim() || undefined,
          interfaceName: wanForm.interfaceName.trim() || undefined,
          gateway: wanForm.gateway.trim() || undefined,
          capacityMbps: capacity,
          configuredWeight: wanForm.configuredWeight.trim() ? Number(wanForm.configuredWeight) : 1,
          priority: wanForm.priority.trim() ? Number(wanForm.priority) : 100,
          failoverPriority: wanForm.failoverPriority.trim() ? Number(wanForm.failoverPriority) : 100,
          enabled: true,
        }),
      });
      setWanForm((current) => ({ ...EMPTY_WAN_FORM, routerId: current.routerId }));
      await load();
    } catch (cause: unknown) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Unable to create WAN connection.');
    } finally {
      setSaving(false);
    }
  }

  async function createPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getAccessToken();
    if (!token) {
      setError('Authentication required.');
      return;
    }

    if (!policyForm.routerId || !policyForm.name.trim()) {
      setError('Router and policy name are required.');
      return;
    }

    const members = wans
      .filter((wan) => wan.routerId === policyForm.routerId && policyForm.members.includes(wan.id))
      .map((wan) => ({
        wanConnectionId: wan.id,
        configuredWeight: wan.configuredWeight,
        priority: wan.priority,
        enabled: true,
      }));

    if (!members.length) {
      setError('Select at least one WAN member for the policy.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await apiFetch('/load-balancing/policies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          routerId: policyForm.routerId,
          name: policyForm.name.trim(),
          strategy: policyForm.strategy,
          capacityAware: policyForm.capacityAware,
          enabled: true,
          members,
        }),
      });
      setPolicyForm((current) => ({ ...EMPTY_POLICY_FORM, routerId: current.routerId }));
      setShowProvisioning(false);
      await load();
    } catch (cause: unknown) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Unable to create load-balancing policy.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleDrain(wan: Wan) {
    const token = getAccessToken();
    if (!token) {
      setError('Authentication required.');
      return;
    }

    setWorking(true);
    setError(null);

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
    } finally {
      setWorking(false);
    }
  }

  async function rebalance() {
    if (!selectedPolicy) return;

    const token = getAccessToken();
    if (!token) {
      setError('Authentication required.');
      return;
    }

    setWorking(true);
    setError(null);

    try {
      const result = await apiFetch<{ networkApply?: ApplyResult }>(
        `/load-balancing/policies/${selectedPolicy}/rebalance`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ reason: 'operator_rebalance' }),
        },
      );
      setLastApply(result.networkApply ?? null);
      await loadStatus(selectedPolicy);
    } catch (cause: unknown) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Rebalance decision failed.');
    } finally {
      setWorking(false);
    }
  }

  const summary = useMemo(() => {
    const eligible = wans.filter((wan) =>
      wan.enabled &&
      !wan.drainRequested &&
      ['HEALTHY', 'DEGRADED', 'RECOVERING'].includes(wan.healthState),
    );
    const down = wans.filter((wan) => ['UNAVAILABLE', 'DISABLED'].includes(wan.healthState) || !wan.enabled).length;
    const utilization = eligible
      .map((wan) => wan.observedUtilizationPercent)
      .filter((value): value is number => value != null && Number.isFinite(Number(value)));

    return {
      eligible: eligible.length,
      down,
      policies: policies.length,
      peakUtilization: utilization.length ? Math.max(...utilization) : null,
    };
  }, [wans, policies]);

  const filteredWans = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return wans;
    return wans.filter((wan) =>
      `${wan.name} ${wan.provider ?? ''} ${wan.interfaceName ?? ''} ${wan.gateway ?? ''} ${wan.healthState} ${wan.id}`.toLowerCase().includes(normalized),
    );
  }, [query, wans]);

  return (
    <main className="lb-page">
      <header className="lb-header">
        <div className="lb-title">
          <div className="lb-brand"><BrandLogo alt="JASLYN NET" /></div>
          <div>
            <span>JASLYN NET · NETWORK · WAN</span>
            <h1>WAN &amp; Load Balancing</h1>
            <p>Observe WAN health, capacity, routing policy and failover decisions from one tenant-scoped control surface.</p>
          </div>
        </div>
        <div className="lb-actions">
          <a className="lb-button secondary" href="/network"><Icon name="router" /><span>Network</span></a>
          <button className="lb-button secondary" type="button" onClick={() => void load()} disabled={loading}><Icon name="refresh" /><span>{loading ? 'Refreshing…' : 'Refresh'}</span></button>
          <button className="lb-button primary" type="button" onClick={() => setShowProvisioning((value) => !value)}><Icon name="plus" /><span>{showProvisioning ? 'Hide tools' : 'Add WAN / policy'}</span></button>
        </div>
      </header>

      {error ? <div className="lb-error" role="alert"><Icon name="warning" /><span>{error}</span></div> : null}

      <section className="lb-summary" aria-label="WAN and load-balancing summary">
        <div className="lb-summary-intro">
          <span>CONTROL FABRIC</span>
          <strong>Connectivity posture</strong>
          <small>Observed telemetry and configured routing state.</small>
        </div>
        <div className="lb-stat-grid">
          <article className="lb-stat"><div className="lb-stat-icon"><Icon name="wan" /></div><strong>{loading ? '—' : wans.length}</strong><span>WAN members</span><small>configured links</small></article>
          <article className="lb-stat healthy"><div className="lb-stat-icon"><Icon name="activity" /></div><strong>{loading ? '—' : summary.eligible}</strong><span>Eligible</span><small>available for routing</small></article>
          <article className="lb-stat alert"><div className="lb-stat-icon"><Icon name="warning" /></div><strong>{loading ? '—' : summary.down}</strong><span>Unavailable</span><small>disabled or unhealthy</small></article>
          <article className="lb-stat"><div className="lb-stat-icon"><Icon name="policy" /></div><strong>{loading ? '—' : summary.policies}</strong><span>Policies</span><small>tenant scoped</small></article>
          <article className="lb-stat"><div className="lb-stat-icon"><Icon name="activity" /></div><strong>{loading ? '—' : fmt(summary.peakUtilization, '%')}</strong><span>Peak utilization</span><small>current telemetry</small></article>
        </div>
      </section>

      {showProvisioning ? (
        <section className="lb-provisioning">
          <div className="lb-section-head">
            <div>
              <span>NETWORK PROVISIONING</span>
              <h2>Build WAN topology</h2>
              <p>Create a real WAN member or a routing policy using the existing tenant-scoped API.</p>
            </div>
          </div>

          <div className="lb-provision-grid">
            <form className="lb-provision-card" onSubmit={createWan}>
              <div className="lb-provision-card-head">
                <div className="lb-card-icon"><Icon name="wan" /></div>
                <div><strong>WAN connection</strong><span>Register a carrier, interface and capacity.</span></div>
              </div>
              <div className="lb-form-grid two">
                <label>Router<select required value={wanForm.routerId} onChange={(event) => setWanForm((value) => ({ ...value, routerId: event.target.value }))}><option value="">Select router</option>{routers.map((router) => <option key={router.id} value={router.id}>{router.name}</option>)}</select></label>
                <label>Name<input required maxLength={120} value={wanForm.name} onChange={(event) => setWanForm((value) => ({ ...value, name: event.target.value }))} placeholder="Primary Fiber" /></label>
                <label>Provider<input maxLength={120} value={wanForm.provider} onChange={(event) => setWanForm((value) => ({ ...value, provider: event.target.value }))} placeholder="Carrier / ISP" /></label>
                <label>Interface<input maxLength={120} value={wanForm.interfaceName} onChange={(event) => setWanForm((value) => ({ ...value, interfaceName: event.target.value }))} placeholder="ether1" /></label>
                <label>Gateway<input maxLength={45} value={wanForm.gateway} onChange={(event) => setWanForm((value) => ({ ...value, gateway: event.target.value }))} placeholder="192.168.1.1" /></label>
                <label>Capacity Mbps<input required type="number" min="0.001" step="0.001" value={wanForm.capacityMbps} onChange={(event) => setWanForm((value) => ({ ...value, capacityMbps: event.target.value }))} placeholder="100" /></label>
              </div>
              <div className="lb-form-grid three">
                <label>Weight<input type="number" min="1" max="100000" value={wanForm.configuredWeight} onChange={(event) => setWanForm((value) => ({ ...value, configuredWeight: event.target.value }))} /></label>
                <label>Priority<input type="number" min="0" max="100000" value={wanForm.priority} onChange={(event) => setWanForm((value) => ({ ...value, priority: event.target.value }))} /></label>
                <label>Failover priority<input type="number" min="0" max="100000" value={wanForm.failoverPriority} onChange={(event) => setWanForm((value) => ({ ...value, failoverPriority: event.target.value }))} /></label>
              </div>
              <button className="lb-button primary" type="submit" disabled={saving || !routers.length}><Icon name="plus" /><span>{saving ? 'Saving…' : 'Create WAN connection'}</span></button>
            </form>

            <form className="lb-provision-card" onSubmit={createPolicy}>
              <div className="lb-provision-card-head">
                <div className="lb-card-icon"><Icon name="policy" /></div>
                <div><strong>Load-balancing policy</strong><span>Define deterministic path selection for a router.</span></div>
              </div>
              <div className="lb-form-grid two">
                <label>Router<select required value={policyForm.routerId} onChange={(event) => setPolicyForm((value) => ({ ...value, routerId: event.target.value, members: [] }))}><option value="">Select router</option>{routers.map((router) => <option key={router.id} value={router.id}>{router.name}</option>)}</select></label>
                <label>Name<input required maxLength={120} value={policyForm.name} onChange={(event) => setPolicyForm((value) => ({ ...value, name: event.target.value }))} placeholder="Primary / Secondary WAN" /></label>
                <label>Strategy<select value={policyForm.strategy} onChange={(event) => setPolicyForm((value) => ({ ...value, strategy: event.target.value as PolicyForm['strategy'] }))}>{STRATEGIES.map((strategy) => <option key={strategy} value={strategy}>{strategy.replaceAll('_', ' ')}</option>)}</select></label>
                <label className="lb-check-row"><input type="checkbox" checked={policyForm.capacityAware} onChange={(event) => setPolicyForm((value) => ({ ...value, capacityAware: event.target.checked }))}/><span>Capacity-aware decisioning</span></label>
              </div>
              <fieldset>
                <legend>WAN members</legend>
                <div className="lb-member-picker">
                  {wans.filter((wan) => wan.routerId === policyForm.routerId).map((wan) => (
                    <label className="lb-member-option" key={wan.id}>
                      <input type="checkbox" checked={policyForm.members.includes(wan.id)} onChange={(event) => setPolicyForm((value) => ({ ...value, members: event.target.checked ? [...value.members, wan.id] : value.members.filter((id) => id !== wan.id) }))}/>
                      <span><strong>{wan.name}</strong><small>{wan.provider ?? 'Provider unset'} · {wan.capacityMbps} Mbps · {wan.healthState}</small></span>
                    </label>
                  ))}
                  {!wans.some((wan) => wan.routerId === policyForm.routerId) ? <div className="lb-member-empty">Create a WAN connection for this router first.</div> : null}
                </div>
              </fieldset>
              <button className="lb-button primary" type="submit" disabled={saving || !routers.length}><Icon name="policy" /><span>{saving ? 'Saving…' : 'Create policy'}</span></button>
            </form>
          </div>
        </section>
      ) : null}

      <section className="lb-surface">
        <div className="lb-surface-head">
          <div>
            <span>WAN MEMBERS</span>
            <h2>Connectivity members</h2>
            <p>Health, traffic, capacity and adapter capability for every configured WAN.</p>
          </div>
          <label className="lb-search">
            <Icon name="search" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search WAN members" aria-label="Search WAN members" />
            {query ? <button type="button" onClick={() => setQuery('')} aria-label="Clear search">×</button> : null}
          </label>
        </div>

        <div className="lb-wan-grid">
          {filteredWans.map((wan) => (
            <article className="lb-wan-card" key={wan.id}>
              <div className="lb-wan-head">
                <div className="lb-wan-name">
                  <div className="lb-wan-icon"><Icon name="wan" /></div>
                  <div><strong>{wan.name}</strong><span>{wan.provider ?? 'Provider not set'} · {wan.interfaceName ?? 'Interface not set'}</span></div>
                </div>
                <span className={`lb-badge ${stateClass(wan.healthState)}`}><i />{wan.healthState}</span>
              </div>

              <div className="lb-metric-grid">
                <div><span>Capacity</span><strong>{wan.capacityMbps} Mbps</strong></div>
                <div><span>Weight</span><strong>{wan.configuredWeight}</strong></div>
                <div><span>Priority</span><strong>{wan.priority}</strong></div>
                <div><span>Sessions</span><strong>{wan.activeSessions}</strong></div>
                <div><span>Latency</span><strong>{fmt(wan.latencyMs, ' ms')}</strong></div>
                <div><span>Packet loss</span><strong>{fmt(wan.packetLossPercent, '%')}</strong></div>
              </div>

              <div className="lb-traffic">
                <div><span>Download</span><strong>{formatBytesPerSecond(wan.observedDownloadBps)}</strong></div>
                <div><span>Upload</span><strong>{formatBytesPerSecond(wan.observedUploadBps)}</strong></div>
                <div><span>Utilization</span><strong>{fmt(wan.observedUtilizationPercent, '%')}</strong></div>
              </div>

              <div className="lb-capabilities">
                {[
                  ['weightedLoadBalancing', 'Weighted LB'],
                  ['failover', 'Failover'],
                  ['routeWrite', 'Route write'],
                  ['telemetry', 'Telemetry'],
                ].map(([key, label]) => (
                  <span key={key} className={wan.routingCapabilities[key as keyof Wan['routingCapabilities']] ? 'supported' : ''}>{wan.routingCapabilities[key as keyof Wan['routingCapabilities']] ? '✓ ' : ''}{label}</span>
                ))}
              </div>

              <div className="lb-wan-foot">
                <div><span>{wan.gateway ? `Gateway ${wan.gateway}` : 'Gateway not configured'}</span><small>{wan.drainRequested ? 'Drain requested' : wan.enabled ? 'Enabled' : 'Disabled'}</small></div>
                <button type="button" className="lb-drain" onClick={() => void toggleDrain(wan)} disabled={working}><Icon name="drain" /><span>{wan.drainRequested ? 'Release drain' : 'Drain WAN'}</span></button>
              </div>
            </article>
          ))}
        </div>

        {!loading && !filteredWans.length ? <div className="lb-empty"><div className="lb-empty-icon"><Icon name="wan" /></div><strong>{query ? 'No matching WAN members' : 'No WAN connections configured'}</strong><span>{query ? 'Try a broader search term.' : 'Register the first WAN member using the provisioning tools above.'}</span></div> : null}
        {loading ? <div className="lb-empty"><div className="lb-empty-icon"><Icon name="refresh" /></div><strong>Loading WAN inventory…</strong><span>Reading current health and telemetry.</span></div> : null}
      </section>

      <section className="lb-surface">
        <div className="lb-policy-head">
          <div>
            <span>ROUTING POLICY</span>
            <h2>Decision engine</h2>
            <p>Configured policy and current eligibility remain separate so the UI does not imply a router change before it is verified.</p>
          </div>
          <label className="lb-policy-select">Policy<select value={selectedPolicy} onChange={(event) => { setSelectedPolicy(event.target.value); setLastApply(null); }}><option value="">Select policy</option>{policies.map((policy) => <option key={policy.id} value={policy.id}>{policy.name} · {policy.strategy}</option>)}</select></label>
        </div>

        {!selectedPolicy ? (
          <div className="lb-empty"><div className="lb-empty-icon"><Icon name="policy" /></div><strong>No policy selected</strong><span>Create or select a routing policy to inspect eligibility and rebalance state.</span></div>
        ) : statusLoading ? (
          <div className="lb-empty"><div className="lb-empty-icon"><Icon name="activity" /></div><strong>Evaluating WAN state…</strong><span>Reading eligibility and adapter capabilities.</span></div>
        ) : status ? (
          <>
            <div className="lb-policy-summary">
              <div><strong>{status.name}</strong><span>{status.strategy} · {status.capacityAware ? 'capacity-aware' : 'configured-weight only'}</span></div>
              <span className={status.decision.failoverActive ? 'lb-decision warning' : 'lb-decision healthy'}><i />{status.decision.failoverActive ? 'Failover / degraded state active' : 'Normal eligibility'}</span>
            </div>

            <div className="lb-capability-grid">
              <div><span>Router capability</span><strong><Icon name="router" />{status.routingCapabilities.routeWrite ? 'Route write exposed' : 'Route write not exposed'}</strong></div>
              <div><span>Telemetry</span><strong><Icon name="activity" />{status.routingCapabilities.telemetry ? 'Available' : 'Not available'}</strong></div>
              <div><span>Failover</span><strong><Icon name="route" />{status.routingCapabilities.failover ? 'Available' : 'Not available'}</strong></div>
            </div>

            <div className="lb-distribution-head"><span>Eligible member distribution</span><small>{status.decision.eligibleMembers.length} eligible</small></div>
            <div className="lb-distribution">
              {status.decision.eligibleMembers.map((member) => {
                const maxWeight = Math.max(...status.decision.eligibleMembers.map((item) => item.effectiveWeight), 1);
                const width = Math.min(100, (member.effectiveWeight / maxWeight) * 100);
                return (
                  <div className="lb-distribution-row" key={member.wanConnectionId}>
                    <div><strong>{status.members.find((wan) => wan.id === member.wanConnectionId)?.name ?? member.wanConnectionId}</strong><small>{member.healthState} · configured weight {member.configuredWeight}</small></div>
                    <div className="lb-bar"><i style={{ width: `${width}%` }} /></div>
                    <strong>{member.effectiveWeight.toFixed(2)}</strong>
                    <span>{fmt(member.utilizationPercent, '%')}</span>
                  </div>
                );
              })}
            </div>

            <div className={`lb-adapter-note ${status.applyAvailable ? 'available' : 'decision-only'}`}>
              <div><strong>{status.applyAvailable ? 'Adapter capability available' : 'Decision-only mode'}</strong><span>{status.applyAvailable ? 'The selected adapter exposes router write capability. Current automatic route application remains limited to the integrated supported protocol path.' : 'The policy is calculated and audited without claiming that router routing has changed.'}</span></div>
              <Icon name={status.applyAvailable ? 'check' : 'warning'} />
            </div>

            {lastApply ? <div className={`lb-apply-result ${lastApply.applied && lastApply.verified ? 'success' : 'warning'}`} role="status"><strong>{lastApply.applied && lastApply.verified ? 'Router change verified' : 'Decision recorded without verified router application'}</strong><span>{lastApply.reason ?? `${lastApply.protocol ?? 'Adapter'} completed without a verification error.`}</span></div> : null}

            <div className="lb-policy-actions">
              <button className="lb-button primary" type="button" onClick={() => void rebalance()} disabled={working || !status.decision.eligibleMembers.length}><Icon name="activity" /><span>{working ? 'Applying & verifying…' : 'Recalculate & apply rebalance'}</span></button>
              <span>Generated {new Date(status.generatedAt).toLocaleString()}</span>
            </div>
          </>
        ) : (
          <div className="lb-empty"><div className="lb-empty-icon"><Icon name="warning" /></div><strong>No policy status returned</strong><span>The control plane did not return a status payload for the selected policy.</span></div>
        )}
      </section>

      <footer className="lb-footer">
        <span>JASLYN NET · WAN &amp; Load Balancing</span>
        <span>Tenant-scoped control surface</span>
      </footer>
    </main>
  );
}
