import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BandwidthEnforcementCommand, EnforcementReconcileOptions, TrafficEnforcementAdapter } from './enforcement.adapter';
import { NetworkCredentials } from '../../common/secure-network-credentials';

const MANAGED_DEVICE_POLICY = 'Group policy';

@Injectable()
export class MerakiTrafficEnforcementAdapter implements TrafficEnforcementAdapter {
  constructor(private readonly config: ConfigService) {}

  async apply(commands: BandwidthEnforcementCommand[], credentials?: NetworkCredentials): Promise<void> {
    for (const command of commands) await this.applyOne(command, credentials);
  }

  async clearManaged(apiEndpoint: string, credentials?: NetworkCredentials, options?: EnforcementReconcileOptions): Promise<number> {
    const context = this.connection(apiEndpoint, credentials, options?.merakiGroupPolicyId);
    const clients = await this.listPolicyClients(context);
    let cleared = 0;
    for (const client of clients) {
      if (client.groupPolicyId !== context.groupPolicyId || !client.clientId) continue;
      await this.setClientPolicy(context, client.clientId, { devicePolicy: 'Normal' });
      cleared += 1;
    }
    return cleared;
  }

  async reconcileManaged(apiEndpoint: string, keepQueueNames: string[], credentials?: NetworkCredentials, options?: EnforcementReconcileOptions): Promise<number> {
    const context = this.connection(apiEndpoint, credentials, options?.merakiGroupPolicyId);
    const keep = new Set(keepQueueNames.map((value) => this.normalizeMac(value)).filter(Boolean));
    const clients = await this.listPolicyClients(context);
    let cleared = 0;
    for (const client of clients) {
      const mac = this.normalizeMac(client.mac);
      if (client.groupPolicyId !== context.groupPolicyId || !client.clientId || !mac || keep.has(mac)) continue;
      await this.setClientPolicy(context, client.clientId, { devicePolicy: 'Normal' });
      cleared += 1;
    }
    return cleared;
  }

  private async applyOne(command: BandwidthEnforcementCommand, credentials?: NetworkCredentials): Promise<void> {
    const context = this.connection(command.apiEndpoint, credentials, command.merakiGroupPolicyId);
    const clientId = command.targetMacAddress ?? command.targetAddress;
    if (!clientId) throw new ServiceUnavailableException(`Meraki client MAC/IP is required for ${command.sessionId ?? command.customerId}`);
    await this.setClientPolicy(context, clientId, { devicePolicy: MANAGED_DEVICE_POLICY, groupPolicyId: context.groupPolicyId });
  }

  private connection(endpoint: string | undefined, credentials?: NetworkCredentials, groupPolicyId?: string) {
    const networkId = this.readNetworkId(endpoint);
    const apiKey = credentials?.apiKey ?? credentials?.accessToken ?? this.config.get<string>('JASLYN_MERAKI_API_KEY');
    if (!apiKey) throw new ServiceUnavailableException('Meraki API credentials are not configured');
    const configuredPolicy = groupPolicyId ?? this.config.get<string>('JASLYN_MERAKI_GROUP_POLICY_ID');
    if (!configuredPolicy) throw new ServiceUnavailableException('Meraki managed group policy ID is not configured');
    return { base: this.baseUrl(endpoint!), networkId, apiKey, groupPolicyId: configuredPolicy };
  }

  private async listPolicyClients(context: { base: string; networkId: string; apiKey: string; groupPolicyId: string }) {
    const records: Array<{ clientId?: string; mac?: string; groupPolicyId?: string }> = [];
    let nextUrl = `${context.base}/networks/${encodeURIComponent(context.networkId)}/policies/byClient?perPage=1000`;
    for (let page = 0; page < 10 && nextUrl; page += 1) {
      const response = await this.request(nextUrl, { headers: this.headers(context.apiKey) });
      const body = await response.json() as unknown;
      if (!Array.isArray(body)) throw new ServiceUnavailableException('Meraki policy-by-client response is invalid');
      for (const value of body) {
        if (!this.isRecord(value)) continue;
        const assigned = Array.isArray(value.assigned) ? value.assigned : [];
        for (const policy of assigned) {
          if (!this.isRecord(policy)) continue;
          const clientId = this.string(value, 'clientId');
          const mac = this.string(value, 'mac') ?? this.string(value, 'clientMac');
          const policyId = this.string(policy, 'groupPolicyId');
          if (!policyId || (!clientId && !mac)) continue;
          records.push({ clientId, mac, groupPolicyId: policyId });
        }
      }
      nextUrl = this.nextLink(response.headers.get('link'));
    }
    return records;
  }

  private async setClientPolicy(context: { base: string; networkId: string; apiKey: string }, clientId: string, body: Record<string, string>): Promise<void> {
    await this.request(
      `${context.base}/networks/${encodeURIComponent(context.networkId)}/clients/${encodeURIComponent(clientId)}/policy`,
      { method: 'PUT', headers: this.headers(context.apiKey), body: JSON.stringify(body) },
    );
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal, redirect: 'error' });
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

  private normalizeMac(value?: string): string {
    return typeof value === 'string' ? value.replace(/[:-]/g, '').toLowerCase() : '';
  }

  private isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
  private string(record: Record<string, unknown>, key: string): string | undefined { return typeof record[key] === 'string' && record[key].trim() ? record[key] as string : undefined; }
}
