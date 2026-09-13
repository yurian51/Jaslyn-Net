import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isIP } from 'node:net';
import { BandwidthEnforcementCommand, TrafficEnforcementAdapter } from './enforcement.adapter';
import { NetworkCredentials } from '../../common/secure-network-credentials';

interface RouterQueueRecord { ['.id']?: string; name?: string; comment?: string; }
export interface MikroTikHotspotActiveRecord { user?: string; address?: string; ['mac-address']?: string; ['bytes-in']?: string; ['bytes-out']?: string; }
const MANAGED_COMMENT = 'JASLYN NET traffic fairness';

@Injectable()
export class MikroTikTrafficEnforcementAdapter implements TrafficEnforcementAdapter {
  constructor(private readonly config: ConfigService) {}

  async apply(commands: BandwidthEnforcementCommand[]): Promise<void> { for (const command of commands) await this.applyOne(command); }

  async clearManaged(apiEndpoint: string): Promise<number> {
    const { headers, base } = this.connection(apiEndpoint);
    const records = await this.managedQueues(base, headers);
    let deleted = 0;
    for (const record of records) {
      if (!record['.id'] || record.comment !== MANAGED_COMMENT || !this.isManagedName(record.name)) continue;
      await this.request(`${base}/queue/simple/${encodeURIComponent(record['.id'])}`, { method: 'DELETE', headers });
      deleted += 1;
    }
    return deleted;
  }

  async reconcileManaged(apiEndpoint: string, keepQueueNames: string[]): Promise<number> {
    const { headers, base } = this.connection(apiEndpoint);
    const keep = new Set(keepQueueNames.filter((name) => this.isManagedName(name)));
    const records = await this.managedQueues(base, headers);
    let deleted = 0;
    for (const record of records) {
      if (!record['.id'] || record.comment !== MANAGED_COMMENT || !this.isManagedName(record.name)) continue;
      if (keep.has(record.name ?? '')) continue;
      await this.request(`${base}/queue/simple/${encodeURIComponent(record['.id'])}`, { method: 'DELETE', headers });
      deleted += 1;
    }
    return deleted;
  }

  async readHotspotActive(apiEndpoint: string, credentials?: NetworkCredentials): Promise<MikroTikHotspotActiveRecord[]> {
    const { headers, base } = this.connection(apiEndpoint, credentials);
    const response = await this.request(`${base}/ip/hotspot/active/print`, {
      method: 'POST', headers,
      body: JSON.stringify({ '.proplist': ['user', 'address', 'mac-address', 'bytes-in', 'bytes-out'] }),
    });
    const records = (await response.json()) as MikroTikHotspotActiveRecord[];
    if (!Array.isArray(records)) throw new ServiceUnavailableException('Router returned an invalid hotspot active response');
    return records;
  }

  private async managedQueues(base: string, headers: Record<string, string>): Promise<RouterQueueRecord[]> {
    const response = await this.request(`${base}/queue/simple/print`, { method: 'POST', headers, body: JSON.stringify({ '.proplist': ['.id', 'name', 'comment'], '.query': [`comment=${MANAGED_COMMENT}`] }) });
    return (await response.json()) as RouterQueueRecord[];
  }

  private async applyOne(command: BandwidthEnforcementCommand) {
    if (!command.apiEndpoint) throw new ServiceUnavailableException(`Router API endpoint is not configured for ${command.routerId}`);
    if (!command.targetAddress || !isIP(command.targetAddress)) throw new ServiceUnavailableException(`A valid client IP is required for session ${command.sessionId ?? command.customerId}`);
    const { headers, base } = this.connection(command.apiEndpoint);
    const queueName = this.queueName(command);
    const queryResponse = await this.request(`${base}/queue/simple/print`, { method: 'POST', headers, body: JSON.stringify({ '.proplist': ['.id', 'name', 'comment'], '.query': [`name=${queueName}`] }) });
    const records = (await queryResponse.json()) as RouterQueueRecord[];
    const existing = records.find((record) => record.name === queueName && record.comment === MANAGED_COMMENT && record['.id']);
    const payload = { name: queueName, target: `${command.targetAddress}/${isIP(command.targetAddress) === 4 ? 32 : 128}`, 'max-limit': `${this.mbps(command.maxUploadMbps)}/${this.mbps(command.maxDownloadMbps)}`, priority: String(Math.min(8, Math.max(1, command.priority))), comment: MANAGED_COMMENT };
    if (existing?.['.id']) {
      await this.request(`${base}/queue/simple/${encodeURIComponent(existing['.id'])}`, { method: 'PATCH', headers, body: JSON.stringify(payload) });
      return;
    }
    await this.request(`${base}/queue/simple`, { method: 'PUT', headers, body: JSON.stringify(payload) });
  }

  private connection(endpoint: string, credentials?: NetworkCredentials) {
    const username = credentials?.username ?? this.config.get<string>('JASLYN_ROUTER_API_USERNAME');
    const password = credentials?.password ?? this.config.get<string>('JASLYN_ROUTER_API_PASSWORD');
    if (!username || password === undefined) throw new ServiceUnavailableException('Router API credentials are not configured');
    const base = this.normalizeEndpoint(endpoint);
    const auth = Buffer.from(`${username}:${password}`).toString('base64');
    return { base, headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json', Accept: 'application/json' } };
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    const configured = Number(this.config.get<string>('JASLYN_ROUTER_API_TIMEOUT_MS', '5000'));
    const timeoutMs = Math.min(Math.max(Number.isFinite(configured) ? configured : 5000, 1000), 30000);
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (!response.ok) { const body = await response.text().catch(() => ''); throw new ServiceUnavailableException(`Router API request failed (${response.status}): ${body.slice(0, 500)}`); }
      return response;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('Router API request failed or timed out');
    } finally { clearTimeout(timer); }
  }

  private normalizeEndpoint(value: string): string {
    const url = new URL(value.trim());
    if (url.username || url.password) throw new ServiceUnavailableException('Router API URL must not contain credentials');
    if (url.protocol !== 'https:' && this.config.get<string>('JASLYN_ROUTER_API_ALLOW_HTTP', 'false').toLowerCase() !== 'true') throw new ServiceUnavailableException('Router API must use HTTPS in production');
    const pathname = url.pathname.replace(/\/+$/, '');
    const restPath = pathname === '/rest' || pathname.endsWith('/rest') ? pathname : `${pathname}/rest`;
    return `${url.origin}${restPath}`;
  }
  private queueName(command: BandwidthEnforcementCommand): string { return `JASLYN-${command.sessionId ?? command.customerId}`.slice(0, 60); }
  private isManagedName(name?: string): boolean { return typeof name === 'string' && name.startsWith('JASLYN-'); }
  private mbps(value: number): string { return `${Math.max(0.001, Number(value.toFixed(3)))}M`; }
}
