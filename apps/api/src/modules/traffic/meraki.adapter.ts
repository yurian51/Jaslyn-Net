import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BandwidthEnforcementCommand, EnforcementReconcileOptions, TrafficEnforcementAdapter } from './enforcement.adapter';
import { NetworkCredentials } from '../../common/secure-network-credentials';

const MANAGED_POLICY_PREFIX = 'JASLYN-NET-';
const GROUP_POLICY_DEVICE_POLICY = 'Group policy';

type MerakiContext = { base: string; networkId: string; apiKey: string };
type MerakiPolicy = { groupPolicyId?: string; name?: string };
type MerakiClientPolicy = { clientId?: string; mac?: string; ip?: string; groupPolicyId?: string };

@Injectable()
export class MerakiTrafficEnforcementAdapter implements TrafficEnforcementAdapter {
  constructor(private readonly config: ConfigService) {}

  async apply(commands: BandwidthEnforcementCommand[], credentials?: NetworkCredentials): Promise<void> {
    if (!commands.length) return;
    const grouped = new Map<string, BandwidthEnforcementCommand>();
    for (const command of commands) {
      const key = `${command.maxDownloadMbps}:${command.maxUploadMbps}`;
      if (!grouped.has(key)) grouped.set(key, command);
    }
    const context = this.connection(commands[0].apiEndpoint, credentials);
    const policies = await this.listGroupPolicies(context);
    const policyIds = new Map<string, string>();
    for (const command of grouped.values()) {
      const policyId = await this.ensureBandwidthPolicy(context, policies, command.maxDownloadMbps, command.maxUploadMbps, policyIds);
      for (const candidate of commands.filter((item) => item.maxDownloadMbps === command.maxDownloadMbps && item.maxUploadMbps === command.maxUploadMbps)) {
        const clientId = candidate.targetMacAddress ?? candidate.targetAddress;
        if (!clientId) throw new ServiceUnavailableException(`Meraki client MAC/IP is required for ${candidate.sessionId ?? candidate.customerId}`);
        await this.setClientPolicy(context, clientId, { devicePolicy: GROUP_POLICY_DEVICE_POLICY, groupPolicyId: policyId });
      }
    }
  }

  async clearManaged(apiEndpoint: string, credentials?: NetworkCredentials, _options?: EnforcementReconcileOptions): Promise<number> {
    const context = this.connection(apiEndpoint, credentials);
    const managedIds = new Set((await this.listGroupPolicies(context)).filter((policy) => this.isManagedPolicy(policy.name) && policy.groupPolicyId).map((policy) => policy.groupPolicyId as string));
    if (!managedIds.size) return 0;
    return this.clearAssignedManagedClients(context, managedIds, new Set());
  }

  async reconcileManaged(apiEndpoint: string, keepQueueNames: string[], credentials?: NetworkCredentials, _options?: EnforcementReconcileOptions): Promise<number> {
    const context = this.connection(apiEndpoint, credentials);
    const managedIds = new Set((await this.listGroupPolicies(context)).filter((policy) => this.isManagedPolicy(policy.name) && policy.groupPolicyId).map((policy) => policy.groupPolicyId as string));
    if (!managedIds.size) return 0;
    const keep = new Set(keepQueueNames.map((value) => this.normalizeIdentity(value)).filter(Boolean));
    return this.clearAssignedManagedClients(context, managedIds, keep);
  }

  private async clearAssignedManagedClients(context: MerakiContext, managedIds: Set<string>, keep: Set<string>): Promise<number> {
    const clients = await this.listPolicyClients(context);
    let cleared = 0;
    for (const client of clients) {
      const identities = [client.mac, client.ip].map((value) => this.normalizeIdentity(value)).filter(Boolean);
      const identityMatches = identities.some((value) => keep.has(value));
      if (!client.clientId || !client.groupPolicyId || !managedIds.has(client.groupPolicyId) || identityMatches) continue;
      await this.setClientPolicy(context, client.clientId, { devicePolicy: 'Normal' });
      cleared += 1;
    }
    return cleared;
  }

  private async ensureBandwidthPolicy(context: MerakiContext, policies: MerakiPolicy[], downloadMbps: number, uploadMbps: number, cache: Map<string, string>): Promise<string> {
    const limitDown = this.kbps(downloadMbps);
    const limitUp = this.kbps(uploadMbps);
    const name = `${MANAGED_POLICY_PREFIX}${limitDown}D-${limitUp}U`;
    const cached = cache.get(name);
    if (cached) return cached;
    const existing = policies.find((policy) => policy.name === name && policy.groupPolicyId);
    if (existing?.groupPolicyId) {
      await this.updateGroupPolicy(context, existing.groupPolicyId, name, limitDown, limitUp);
      cache.set(name, existing.groupPolicyId);
      return existing.groupPolicyId;
    }
    const response = await this.request(`${context.base}/networks/${encodeURIComponent(context.networkId)}/groupPolicies`, {
      method: 'POST', headers: this.headers(context.apiKey), body: JSON.stringify({
        name,
        bandwidth: { settings: 'custom', bandwidthLimits: { limitUp, limitDown } },
      }),
    });
    const body = await response.json() as unknown;
    const groupPolicyId = this.stringRecord(body, 'groupPolicyId');
    if (!groupPolicyId) throw new ServiceUnavailableException(`Meraki did not return a group policy ID for ${name}`);
    cache.set(name, groupPolicyId);
    return groupPolicyId;
  }

  private async updateGroupPolicy(context: MerakiContext, groupPolicyId: string, name: string, limitDown: number, limitUp: number): Promise<void> {
    await this.request(`${context.base}/networks/${encodeURIComponent(context.networkId)}/groupPolicies/${encodeURIComponent(groupPolicyId)}`, {
      method: 'PUT', headers: this.headers(context.apiKey), body: JSON.stringify({
        name,
        bandwidth: { settings: 'custom', bandwidthLimits: { limitUp, limitDown } },
      }),
    });
  }

  private connection(endpoint: string | undefined, credentials?: NetworkCredentials): MerakiContext {
    const networkId = this.readNetworkId(endpoint);
    const apiKey = credentials?.apiKey ?? credentials?.accessToken ?? this.config.get<string>('JASLYN_MERAKI_API_KEY');
    if (!apiKey) throw new ServiceUnavailableException('Meraki API credentials are not configured');
    return { base: this.baseUrl(endpoint!), networkId, apiKey };
  }

  private async listGroupPolicies(context: MerakiContext): Promise<MerakiPolicy[]> {
    const response = await this.request(`${context.base}/networks/${encodeURIComponent(context.networkId)}/groupPolicies`, { headers: this.headers(context.apiKey) });
    const body = await response.json() as unknown;
    if (!Array.isArray(body)) throw new ServiceUnavailableException('Meraki group policy response is invalid');
    return body.filter((value): value is MerakiPolicy => this.isRecord(value));
  }

  private async listPolicyClients(context: MerakiContext): Promise<MerakiClientPolicy[]> {
    const records: MerakiClientPolicy[] = [];
    let nextUrl = `${context.base}/networks/${encodeURIComponent(context.networkId)}/policies/byClient?perPage=1000`;
    for (let page = 0; page < 10 && nextUrl; page += 1) {
      const response = await this.request(nextUrl, { headers: this.headers(context.apiKey) });
      const body = await response.json() as unknown;
      if (!Array.isArray(body)) throw new ServiceUnavailableException('Meraki policy-by-client response is invalid');
      for (const value of body) {
        if (!this.isRecord(value)) continue;
        const clientId = this.stringRecord(value, 'clientId');
        const mac = this.stringRecord(value, 'mac') ?? this.stringRecord(value, 'clientMac');
        const ip = this.stringRecord(value, 'ip') ?? this.stringRecord(value, 'ip6');
        const assigned = Array.isArray(value.assigned) ? value.assigned : [];
        for (const policy of assigned) {
          if (!this.isRecord(policy)) continue;
          const groupPolicyId = this.stringRecord(policy, 'groupPolicyId');
          if (groupPolicyId && (clientId || mac || ip)) records.push({ clientId, mac, ip, groupPolicyId });
        }
      }
      nextUrl = this.nextLink(response.headers.get('link'));
    }
    return records;
  }

  private async setClientPolicy(context: MerakiContext, clientId: string, body: Record<string, string>): Promise<void> {
    await this.request(`${context.base}/networks/${encodeURIComponent(context.networkId)}/clients/${encodeURIComponent(clientId)}/policy`, {
      method: 'PUT', headers: this.headers(context.apiKey), body: JSON.stringify(body),
    });
  }

  private headers(apiKey: string): Record<string, string> {
    return { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Cisco-Meraki-API-Key': apiKey };
  }

  private nextLink(link: string | null): string {
    const match = link?.match(/<([^>]+)>;\s*rel="next"/i);
    return match?.[1] ?? '';
  }

  private readNetworkId(endpoint?: string): string {
    if (!endpoint) throw new ServiceUnavailableException('Meraki network endpoint is not configured');
    try {
      const url = new URL(endpoint);
      const match = url.pathname.match(/\/networks\/([^/]+)(?:\/)?$/);
      if (match?.[1]) return decodeURIComponent(match[1]);
      const networkId = url.searchParams.get('networkId');
      if (networkId) return networkId;
    } catch {
      throw new ServiceUnavailableException('Meraki API endpoint is not a valid URL');
    }
    throw new ServiceUnavailableException('Meraki endpoint must identify a networkId');
  }

  private baseUrl(endpoint: string): string {
    let url: URL;
    try { url = new URL(endpoint); } catch { throw new ServiceUnavailableException('Meraki API endpoint is not a valid URL'); }
    if (url.username || url.password) throw new ServiceUnavailableException('Meraki API endpoint must not contain embedded credentials');
    if (url.protocol !== 'https:' && this.config.get<string>('JASLYN_NETWORK_ALLOW_HTTP', 'false') !== 'true') throw new ServiceUnavailableException('Meraki API must use HTTPS in production');
    const origin = url.origin;
    const path = url.pathname.replace(/\/+$/, '');
    if (path.endsWith('/api/v1')) return origin + path;
    if (path.endsWith('/api')) return `${origin}${path}/v1`;
    return `${origin}/api/v1`;
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    const configured = Number(this.config.get<string>('JASLYN_NETWORK_API_TIMEOUT_MS', '5000'));
    const timeoutMs = Math.min(Math.max(Number.isFinite(configured) ? configured : 5000, 1000), 30000);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, { ...init, signal: controller.signal, redirect: 'error' });
        if (response.status === 429 && attempt < 2) {
          const retryAfter = Number(response.headers.get('retry-after') ?? '1');
          const delayMs = Math.min(Math.max(Number.isFinite(retryAfter) ? retryAfter * 1000 : 1000, 250), 10000);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        if (!response.ok) {
          const body = await response.text().catch(() => '');
          throw new ServiceUnavailableException(`Meraki API request failed (${response.status}): ${body.slice(0, 500)}`);
        }
        return response;
      } catch (error) {
        if (error instanceof ServiceUnavailableException) throw error;
        throw new ServiceUnavailableException('Meraki API request failed or timed out');
      } finally {
        clearTimeout(timer);
      }
    }
    throw new ServiceUnavailableException('Meraki API rate limit retry budget exhausted');
  }

  private kbps(value: number): number {
    const kbps = Math.round(Number(value) * 1000);
    if (!Number.isFinite(kbps) || kbps < 1) throw new ServiceUnavailableException('Meraki bandwidth allocation must be at least 1 Kbps');
    return kbps;
  }

  private isManagedPolicy(name?: string): boolean { return typeof name === 'string' && name.startsWith(MANAGED_POLICY_PREFIX); }
  private normalizeIdentity(value?: string): string { return typeof value === 'string' ? value.replace(/[:-]/g, '').trim().toLowerCase() : ''; }
  private isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
  private stringRecord(record: unknown, key: string): string | undefined { return this.isRecord(record) && typeof record[key] === 'string' && record[key].trim() ? record[key] as string : undefined; }
}
