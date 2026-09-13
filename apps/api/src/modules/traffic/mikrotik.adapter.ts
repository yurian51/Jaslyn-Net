import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isIP } from 'node:net';
import { BandwidthEnforcementCommand, TrafficEnforcementAdapter } from './enforcement.adapter';

interface RouterQueueRecord {
  ['.id']?: string;
  name?: string;
}

@Injectable()
export class MikroTikTrafficEnforcementAdapter implements TrafficEnforcementAdapter {
  constructor(private readonly config: ConfigService) {}

  async apply(commands: BandwidthEnforcementCommand[]): Promise<void> {
    for (const command of commands) {
      await this.applyOne(command);
    }
  }

  private async applyOne(command: BandwidthEnforcementCommand) {
    if (!command.apiEndpoint) throw new ServiceUnavailableException(`Router API endpoint is not configured for ${command.routerId}`);
    if (!command.targetAddress || !isIP(command.targetAddress)) {
      throw new ServiceUnavailableException(`A valid client IP is required for session ${command.sessionId ?? command.customerId}`);
    }

    const username = this.config.get<string>('JASLYN_ROUTER_API_USERNAME');
    const password = this.config.get<string>('JASLYN_ROUTER_API_PASSWORD');
    if (!username || password === undefined) {
      throw new ServiceUnavailableException('JASLYN router API credentials are not configured');
    }

    const base = this.normalizeEndpoint(command.apiEndpoint);
    const queueName = this.queueName(command);
    const auth = Buffer.from(`${username}:${password}`).toString('base64');
    const headers = {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    const queryResponse = await this.request(`${base}/queue/simple/print`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ '.proplist': ['.id', 'name'], '.query': [`name=${queueName}`] }),
    });
    const records = (await queryResponse.json()) as RouterQueueRecord[];
    const existing = records.find((record) => record.name === queueName && record['.id']);
    const payload = {
      name: queueName,
      target: `${command.targetAddress}/${isIP(command.targetAddress) === 4 ? 32 : 128}`,
      'max-limit': `${this.mbps(command.maxUploadMbps)}/${this.mbps(command.maxDownloadMbps)}`,
      priority: String(Math.min(8, Math.max(1, command.priority))),
      comment: 'JASLYN NET traffic fairness',
    };

    if (existing?.['.id']) {
      await this.request(`${base}/queue/simple/${encodeURIComponent(existing['.id'])}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload),
      });
      return;
    }

    await this.request(`${base}/queue/simple`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(payload),
    });
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    const timeoutMs = Math.min(Math.max(this.config.get<number>('JASLYN_ROUTER_API_TIMEOUT_MS', 5000), 1000), 30000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new ServiceUnavailableException(`Router API request failed (${response.status}): ${body.slice(0, 500)}`);
      }
      return response;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('Router API request failed or timed out');
    } finally {
      clearTimeout(timer);
    }
  }

  private normalizeEndpoint(value: string): string {
    const raw = value.trim().replace(/\/+$/, '');
    const url = new URL(raw);
    if (url.protocol !== 'https:' && this.config.get<string>('JASLYN_ROUTER_API_ALLOW_HTTP', 'false').toLowerCase() !== 'true') {
      throw new ServiceUnavailableException('Router API must use HTTPS in production');
    }
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}/rest`;
  }

  private queueName(command: BandwidthEnforcementCommand): string {
    const identity = command.sessionId ?? command.customerId;
    return `JASLYN-${identity}`.slice(0, 60);
  }

  private mbps(value: number): string {
    return `${Math.max(0.001, Number(value.toFixed(3)))}M`;
  }
}
