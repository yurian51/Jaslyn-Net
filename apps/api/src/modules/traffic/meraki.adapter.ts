import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BandwidthEnforcementCommand, TrafficEnforcementAdapter } from './enforcement.adapter';
import { NetworkCredentials } from '../../common/secure-network-credentials';

const MANAGED_DEVICE_POLICY = 'Group policy';

@Injectable()
export class MerakiTrafficEnforcementAdapter implements TrafficEnforcementAdapter {
  constructor(private readonly config: ConfigService) {}

  async apply(commands: BandwidthEnforcementCommand[], credentials?: NetworkCredentials): Promise<void> {
    for (const command of commands) await this.applyOne(command, credentials);
  }

  async clearManaged(apiEndpoint: string, credentials?: NetworkCredentials): Promise<number> {
    throw new ServiceUnavailableException(`Meraki managed-policy clearing requires explicit client targets for ${apiEndpoint}; refusing broad policy mutation`);
  }

  async reconcileManaged(apiEndpoint: string, _keepQueueNames: string[], _credentials?: NetworkCredentials): Promise<number> {
    throw new ServiceUnavailableException(`Meraki managed-policy reconciliation requires explicit client state for ${apiEndpoint}; refusing broad policy mutation`);
  }

  private async applyOne(command: BandwidthEnforcementCommand, credentials?: NetworkCredentials): Promise<void> {
    const networkId = this.readNetworkId(command.apiEndpoint);
    const clientId = command.targetMacAddress ?? command.targetAddress;
    const groupPolicyId = command.merakiGroupPolicyId;
    if (!clientId) throw new ServiceUnavailableException(`Meraki client MAC/IP is required for ${command.sessionId ?? command.customerId}`);
    if (!groupPolicyId) throw new ServiceUnavailableException(`Meraki group policy ID is required for ${command.routerId}`);

    const apiKey = credentials?.apiKey ?? credentials?.accessToken ?? this.config.get<string>('JASLYN_MERAKI_API_KEY');
    if (!apiKey) throw new ServiceUnavailableException('Meraki API credentials are not configured');

    const base = this.baseUrl(command.apiEndpoint);
    await this.request(
      `${base}/networks/${encodeURIComponent(networkId)}/clients/${encodeURIComponent(clientId)}/policy`,
      {
        method: 'PUT',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Cisco-Meraki-API-Key': apiKey,
        },
        body: JSON.stringify({ devicePolicy: MANAGED_DEVICE_POLICY, groupPolicyId }),
      },
    );
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
      // normalized by baseUrl below
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
}
