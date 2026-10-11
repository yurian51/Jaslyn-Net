import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { NetworkDeviceConnection, NormalizedWifiClient } from './network-device.adapter';
import { NetworkCredentials } from '../../common/secure-network-credentials';

type JsonRecord = Record<string, unknown>;

/**
 * Ruijie/Reyee Cloud read-only client telemetry adapter.
 * Requires a Ruijie Cloud API token and group/project ID; credentials are never put in the URL.
 */
@Injectable()
export class RuijieReyeeNetworkAdapter {
  constructor(private readonly config: ConfigService) {}

  async readClients(connection: NetworkDeviceConnection): Promise<NormalizedWifiClient[]> {
    const endpoint = connection.controllerEndpoint ?? connection.endpoint;
    const meta = connection.capabilities ?? {};
    const groupId = this.value(meta, ['groupId', 'group_id', 'projectId']) ?? this.config.get<string>('JASLYN_RUIJIE_GROUP_ID');
    const token = connection.credentials?.accessToken ?? connection.credentials?.apiKey ?? this.config.get<string>('JASLYN_RUIJIE_ACCESS_TOKEN');
    if (!endpoint || !groupId || !token) throw new ServiceUnavailableException('Ruijie/Reyee requires Cloud API endpoint, groupId and access token');
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new ServiceUnavailableException('Ruijie Cloud endpoint must be HTTPS without embedded credentials, query or fragment');
    url.pathname = url.pathname.replace(/\/$/, '') || '';
    if (!url.pathname.endsWith('/service/api/open/v1/dev/user/current-user')) {
      url.pathname = `${url.pathname}/service/api/open/v1/dev/user/current-user`.replace(/\/+/g, '/');
    }
    url.searchParams.set('group_id', groupId);
    url.searchParams.set('access_token', token);
    const payload = await this.request(url.toString());
    const root = this.record(payload.data);
    const rows = this.rows(root).length ? this.rows(root) : this.rows(payload);
    return rows.map((row) => ({
      username: this.string(row, ['userName', 'username', 'user', 'name']),
      address: this.string(row, ['ip', 'ipAddress', 'address']),
      macAddress: this.string(row, ['mac', 'macAddress', 'macAddr']),
      bytesIn: this.counter(row, ['flowUp', 'bytesIn', 'uploadBytes', 'txBytes']),
      bytesOut: this.counter(row, ['flowDown', 'bytesOut', 'downloadBytes', 'rxBytes']),
    }));
  }

  private async request(rawUrl: string): Promise<JsonRecord> {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === 'metadata.google.internal') throw new ServiceUnavailableException('Ruijie Cloud API hostname is blocked');
    const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((entry) => entry.address);
    if (!addresses.length || addresses.some((address) => this.isPrivateAddress(address))) throw new ServiceUnavailableException('Ruijie Cloud API endpoint resolves to a restricted address');
    const configured = Number(this.config.get<string>('JASLYN_NETWORK_API_TIMEOUT_MS', '5000'));
    const timeout = Math.min(Math.max(Number.isFinite(configured) ? configured : 5000, 1000), 30000);
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal, redirect: 'error' });
      if (!response.ok) throw new ServiceUnavailableException(`Ruijie Cloud API request failed (${response.status})`);
      const body: unknown = await response.json();
      if (!this.isRecord(body)) throw new ServiceUnavailableException('Ruijie Cloud API returned invalid JSON');
      if (typeof body.code === 'number' && body.code !== 0) throw new ServiceUnavailableException('Ruijie Cloud API rejected the request');
      if (typeof body.errorCode === 'number' && body.errorCode !== 0) throw new ServiceUnavailableException('Ruijie Cloud API rejected the request');
      return body;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('Ruijie Cloud API request failed or timed out');
    } finally { clearTimeout(timer); }
  }
  private isPrivateAddress(address: string): boolean {
    if (isIP(address) === 4) { const [a,b] = address.split('.').map(Number); return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224; }
    const value = address.toLowerCase(); return value === '::1' || value === '::' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb') || value.startsWith('ff');
  }
  private rows(record: JsonRecord): JsonRecord[] { for (const key of ['list', 'rows', 'records', 'users', 'clients', 'currentUser', 'data']) { const value = record[key]; if (Array.isArray(value)) return value.filter((item): item is JsonRecord => this.isRecord(item)); } return []; }
  private record(value: unknown): JsonRecord { return this.isRecord(value) ? value : {}; }
  private isRecord(value: unknown): value is JsonRecord { return typeof value === 'object' && value !== null && !Array.isArray(value); }
  private string(record: JsonRecord, keys: string[]): string | undefined { for (const key of keys) if (typeof record[key] === 'string' && (record[key] as string).trim()) return record[key] as string; return undefined; }
  private value(record: JsonRecord, keys: string[]): string | undefined { return this.string(record, keys) ?? keys.map((key) => record[key]).find((value): value is number => typeof value === 'number')?.toString(); }
  private counter(record: JsonRecord, keys: string[]): string { for (const key of keys) { const value = record[key]; if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value); if (typeof value === 'string' && /^\d+$/.test(value)) return value; } return '0'; }
}
