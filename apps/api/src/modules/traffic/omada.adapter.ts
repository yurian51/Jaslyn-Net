import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { NetworkDeviceConnection, NormalizedWifiClient } from './network-device.adapter';
import { NetworkCredentials } from '../../common/secure-network-credentials';

type JsonRecord = Record<string, unknown>;
const MAX_PAGES = 100;

/** TP-Link Omada SDN Open API client telemetry adapter. Uses controller OAuth client credentials. */
@Injectable()
export class OmadaNetworkAdapter {
  constructor(private readonly config: ConfigService) {}

  async readClients(connection: NetworkDeviceConnection): Promise<NormalizedWifiClient[]> {
    const endpoint = connection.controllerEndpoint ?? connection.endpoint;
    const meta = connection.capabilities ?? {};
    const omadacId = connection.credentials?.omadacId ?? this.value(meta, ['omadacId', 'omadaId', 'controllerId']) ?? this.config.get<string>('JASLYN_OMADA_ID');
    const siteId = connection.credentials?.siteId ?? this.value(meta, ['siteId', 'omadaSiteId']) ?? this.config.get<string>('JASLYN_OMADA_SITE_ID');
    const clientId = connection.credentials?.clientId ?? this.config.get<string>('JASLYN_OMADA_CLIENT_ID');
    const clientSecret = connection.credentials?.clientSecret ?? this.config.get<string>('JASLYN_OMADA_CLIENT_SECRET');
    if (!endpoint || !omadacId || !siteId || !clientId || !clientSecret) {
      throw new ServiceUnavailableException('Omada requires controller endpoint, omadacId, siteId, clientId and clientSecret');
    }
    const root = this.base(endpoint);
    const tokenPayload = await this.request(new URL('/openapi/authorize/token?grant_type=client_credentials', root).toString(), {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ omadacId, client_id: clientId, client_secret: clientSecret }),
    });
    const tokenResult = this.record(tokenPayload.result);
    const token = this.string(tokenResult, ['accessToken', 'access_token']);
    if (tokenPayload.errorCode !== 0 || !token) throw new ServiceUnavailableException('Omada OAuth token request was rejected by the controller');

    const clients: NormalizedWifiClient[] = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const url = new URL(`/openapi/v1/${encodeURIComponent(omadacId)}/sites/${encodeURIComponent(siteId)}/clients`, root);
      url.searchParams.set('page', String(page));
      url.searchParams.set('pageSize', '100');
      const payload = await this.request(url.toString(), { headers: { Accept: 'application/json', Authorization: `AccessToken=${token}` } });
      if (payload.errorCode !== 0) throw new ServiceUnavailableException('Omada client telemetry API returned an application error');
      const rows = this.rows(payload.result);
      clients.push(...rows.map((row) => this.normalize(row)));
      const totalPages = Number(result.totalPages ?? result.pageCount ?? result.totalPage);
      if (rows.length === 0 || (Number.isFinite(totalPages) && totalPages > 0 && page >= totalPages) || rows.length < 100) return clients;
    }
    throw new ServiceUnavailableException(`Omada client pagination exceeded ${MAX_PAGES} pages`);
  }

  private normalize(row: JsonRecord): NormalizedWifiClient {
    return {
      username: this.string(row, ['name', 'userName', 'username', 'clientName']),
      address: this.string(row, ['ip', 'ipAddress', 'ipAddr', 'address']),
      macAddress: this.string(row, ['mac', 'macAddress', 'macAddr']),
      bytesIn: this.counter(row, ['uploadBytes', 'bytesIn', 'txBytes', 'trafficUp']),
      bytesOut: this.counter(row, ['downloadBytes', 'bytesOut', 'rxBytes', 'trafficDown']),
    };
  }
  private base(endpoint: string): string {
    let url: URL;
    try { url = new URL(endpoint); } catch { throw new ServiceUnavailableException('Omada controller endpoint is invalid'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new ServiceUnavailableException('Omada controller endpoint must be HTTPS without embedded credentials, query or fragment');
    return url.origin;
  }
  private async request(url: string, init: RequestInit = {}): Promise<JsonRecord> {
    await this.assertSafeUrl(url);
    const configured = Number(this.config.get<string>('JASLYN_NETWORK_API_TIMEOUT_MS', '5000'));
    const timeout = Math.min(Math.max(Number.isFinite(configured) ? configured : 5000, 1000), 30000);
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal, redirect: 'error' });
      if (!response.ok) throw new ServiceUnavailableException(`Omada API request failed (${response.status})`);
      const body: unknown = await response.json();
      if (!this.isRecord(body)) throw new ServiceUnavailableException('Omada API returned invalid JSON');
      return body;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('Omada API request failed or timed out');
    } finally { clearTimeout(timer); }
  }
  private async assertSafeUrl(raw: string): Promise<void> {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) throw new ServiceUnavailableException('Omada API requests must use HTTPS without URL credentials');
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === 'metadata.google.internal') throw new ServiceUnavailableException('Omada API hostname is blocked');
    const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((entry) => entry.address);
    if (!addresses.length || addresses.some((address) => this.isPrivateAddress(address))) throw new ServiceUnavailableException('Omada API endpoint resolves to a restricted address');
  }
  private isPrivateAddress(address: string): boolean {
    if (isIP(address) === 4) { const [a,b] = address.split('.').map(Number); return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224; }
    const value = address.toLowerCase(); return value === '::1' || value === '::' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb') || value.startsWith('ff');
  }
  private rows(value: unknown): JsonRecord[] {
    if (Array.isArray(value)) return value.filter((item): item is JsonRecord => this.isRecord(item));
    if (!this.isRecord(value)) return [];
    for (const key of ['data', 'clients', 'clientList', 'items']) if (Array.isArray(value[key])) return (value[key] as unknown[]).filter((item): item is JsonRecord => this.isRecord(item));
    return [];
  }
  private record(value: unknown): JsonRecord { return this.isRecord(value) ? value : {}; }
  private isRecord(value: unknown): value is JsonRecord { return typeof value === 'object' && value !== null && !Array.isArray(value); }
  private string(record: JsonRecord, keys: string[]): string | undefined { for (const key of keys) if (typeof record[key] === 'string' && (record[key] as string).trim()) return record[key] as string; return undefined; }
  private value(record: JsonRecord, keys: string[]): string | undefined { return this.string(record, keys) ?? keys.map((key) => record[key]).find((value): value is number => typeof value === 'number')?.toString(); }
  private counter(record: JsonRecord, keys: string[]): string { for (const key of keys) { const value = record[key]; if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value); if (typeof value === 'string' && /^\d+$/.test(value)) return value; } return '0'; }
}
