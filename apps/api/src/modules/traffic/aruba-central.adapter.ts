import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { NetworkCredentials } from '../../common/secure-network-credentials';
import type { NetworkDeviceConnection, NormalizedWifiClient } from './network-device.adapter';
import {
  BandwidthEnforcementCommand,
  DisconnectResult,
  EnforcementVerification,
  NetworkDisconnectCommand,
  TrafficEnforcementAdapter,
} from './enforcement.adapter';
import { isRestrictedNetworkAddress } from './network-endpoint-security';

type JsonRecord = Record<string, unknown>;
const TOKEN_URL = 'https://sso.common.cloud.hpe.com/as/token.oauth2';
const MAX_PAGES = 100;

/**
 * HPE Aruba Networking Central (Classic Central API family).
 *
 * Native operations implemented here:
 * - client telemetry from the documented monitoring client collection;
 * - per-client disconnect through the documented device-management action.
 *
 * Aruba's bandwidth-usage APIs are telemetry, not enforcement. This adapter
 * deliberately refuses to pretend they can enforce per-subscriber speed limits.
 * Use an Aruba-supported role/SSID policy integration when that contract is
 * explicitly configured for the customer's Central release.
 */
@Injectable()
export class ArubaCentralNetworkAdapter implements TrafficEnforcementAdapter {
  constructor(private readonly config: ConfigService) {}

  async readClients(connection: NetworkDeviceConnection): Promise<NormalizedWifiClient[]> {
    const { base, token } = await this.context(connection.controllerEndpoint ?? connection.endpoint, connection.credentials);
    const clients: NormalizedWifiClient[] = [];
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const url = new URL('/monitoring/v2/clients', base);
      url.searchParams.set('limit', '100');
      url.searchParams.set('offset', String(page * 100));
      const payload = await this.getJson(url.toString(), token);
      const rows = this.records(payload, ['clients', 'client_list', 'data']);
      clients.push(...rows.map((row) => this.normalize(row)));
      const total = this.number(payload, ['total', 'count', 'total_count']);
      if (rows.length < 100 || (total !== undefined && clients.length >= total)) return clients;
    }
    throw new ServiceUnavailableException('Aruba Central client pagination exceeded 100 pages');
  }

  async disconnect(commands: NetworkDisconnectCommand[], credentials?: NetworkCredentials): Promise<DisconnectResult[]> {
    return Promise.all(commands.map(async (command) => {
      const mac = this.mac(command.targetMacAddress);
      const endpoint = command.apiEndpoint;
      if (!endpoint) throw new ServiceUnavailableException('Aruba Central disconnect action endpoint is required');
      const { base, token } = await this.context(endpoint, credentials);
      const serial = this.serialFromEndpoint(endpoint);
      const actionUrl = new URL(`/device_management/v1/device/${encodeURIComponent(serial)}/action/disconnect_user`, base);
      const response = await this.request(actionUrl.toString(), token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disconnect_user_mac: mac }),
      });
      if (!response.ok) throw new ServiceUnavailableException(`Aruba Central disconnect request failed (${response.status})`);
      return { disconnected: true, details: { acceptedByController: true, serial, macAddress: mac, verificationPending: true } };
    }));
  }

  async verifyDisconnected(commands: NetworkDisconnectCommand[], credentials?: NetworkCredentials): Promise<EnforcementVerification[]> {
    return Promise.all(commands.map(async (command) => {
      try {
        const mac = this.mac(command.targetMacAddress);
        const { base, token } = await this.context(command.apiEndpoint, credentials);
        const url = new URL(`/monitoring/v2/clients/${encodeURIComponent(mac)}`, base);
        const response = await this.request(url.toString(), token);
        if (response.status === 404 || response.status === 410) {
          return { verified: true, details: { macAddress: mac, state: 'NOT_PRESENT' } };
        }
        if (!response.ok) return { verified: false, details: { reason: 'CLIENT_STATUS_REQUEST_FAILED', status: response.status } };
        const body: unknown = await response.json();
        const client = this.record(body);
        const connected = this.boolean(client, ['is_connected', 'isConnected', 'connected', 'is_online', 'online']);
        const status = this.string(client, ['status', 'connection_status', 'state'])?.toLowerCase();
        const verified = connected === false || ['disconnected', 'offline', 'not_connected'].includes(status ?? '');
        return { verified, details: { macAddress: mac, connected, status: status ?? null, reason: verified ? 'DISCONNECTED' : 'CONTROLLER_STILL_REPORTS_CONNECTED_OR_UNKNOWN' } };
      } catch {
        return { verified: false, details: { reason: 'ARUBA_DISCONNECT_VERIFICATION_FAILED' } };
      }
    }));
  }

  async apply(_commands: BandwidthEnforcementCommand[], _credentials?: NetworkCredentials): Promise<void> {
    throw new ServiceUnavailableException('Aruba Central per-client bandwidth enforcement is not enabled: documented bandwidth-usage APIs are telemetry only. Configure a verified Aruba role/SSID policy integration before applying speed limits.');
  }

  async verify(commands: BandwidthEnforcementCommand[]): Promise<EnforcementVerification[]> {
    return commands.map(() => ({ verified: false, details: { reason: 'ARUBA_PER_CLIENT_BANDWIDTH_POLICY_NOT_CONFIGURED' } }));
  }

  async clearManaged(_apiEndpoint: string, _credentials?: NetworkCredentials): Promise<number> {
    throw new ServiceUnavailableException('Aruba Central managed bandwidth policy cleanup is unavailable until a supported policy adapter is configured');
  }

  async reconcileManaged(_apiEndpoint: string, _keepQueueNames: string[], _credentials?: NetworkCredentials): Promise<number> {
    throw new ServiceUnavailableException('Aruba Central managed bandwidth policy reconciliation is unavailable until a supported policy adapter is configured');
  }

  private async context(endpoint: string | undefined, credentials?: NetworkCredentials): Promise<{ base: string; token: string }> {
    if (!endpoint) throw new ServiceUnavailableException('Aruba Central API base URL is required');
    const base = this.base(endpoint);
    if (credentials?.clientId && credentials.clientSecret) return { base, token: await this.issueToken(credentials) };
    if (credentials?.accessToken) return { base, token: credentials.accessToken };
    throw new ServiceUnavailableException('Aruba Central requires encrypted clientId/clientSecret credentials or a current accessToken');
  }

  private async issueToken(credentials: NetworkCredentials): Promise<string> {
    const form = new URLSearchParams({ grant_type: 'client_credentials', client_id: credentials.clientId!, client_secret: credentials.clientSecret! });
    const response = await this.request(TOKEN_URL, undefined, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    if (!response.ok) throw new ServiceUnavailableException(`Aruba Central OAuth token request failed (${response.status})`);
    const body: unknown = await response.json();
    const token = this.string(this.record(body), ['access_token']);
    if (!token) throw new ServiceUnavailableException('Aruba Central OAuth response did not contain access_token');
    return token;
  }

  private async getJson(url: string, token: string): Promise<unknown> {
    const response = await this.request(url, token);
    if (!response.ok) throw new ServiceUnavailableException(`Aruba Central API request failed (${response.status})`);
    try { return await response.json() as unknown; }
    catch { throw new ServiceUnavailableException('Aruba Central API returned invalid JSON'); }
  }

  private async request(url: string, token?: string, init: RequestInit = {}): Promise<Response> {
    await this.assertSafeUrl(url);
    const configured = Number(this.config.get<string>('JASLYN_NETWORK_API_TIMEOUT_MS', '5000'));
    const timeout = Math.min(Math.max(Number.isFinite(configured) ? configured : 5000, 1000), 30000);
    const headers: Record<string, string> = { Accept: 'application/json', ...(init.headers as Record<string, string> | undefined) };
    if (token) headers.Authorization = `Bearer ${token}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      return await fetch(url, { ...init, headers, signal: controller.signal, redirect: 'error' });
    } catch {
      throw new ServiceUnavailableException('Aruba Central API request failed or timed out');
    } finally { clearTimeout(timer); }
  }

  private base(endpoint: string): string {
    let url: URL;
    try { url = new URL(endpoint); } catch { throw new ServiceUnavailableException('Aruba Central API base URL is invalid'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
      throw new ServiceUnavailableException('Aruba Central endpoint must be an HTTPS base URL without embedded credentials, query or fragment');
    }
    return url.origin;
  }

  private async assertSafeUrl(raw: string): Promise<void> {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) throw new ServiceUnavailableException('Aruba Central API requests must use HTTPS');
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === 'metadata.google.internal') {
      throw new ServiceUnavailableException('Aruba Central API hostname is blocked');
    }
    const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((entry) => entry.address);
    if (!addresses.length || addresses.some((address) => isRestrictedNetworkAddress(address))) {
      throw new ServiceUnavailableException('Aruba Central API endpoint resolves to a restricted address');
    }
  }

  private serialFromEndpoint(endpoint: string): string {
    const url = this.base(endpoint);
    const parsed = new URL(endpoint);
    const match = parsed.pathname.match(/\/device_management\/v1\/device\/([^/]+)\/action\/disconnect_user\/?$/);
    const serial = match?.[1] ? decodeURIComponent(match[1]) : undefined;
    if (!serial) throw new ServiceUnavailableException('For Aruba disconnect, apiEndpoint must include /device_management/v1/device/{serial}/action/disconnect_user');
    return serial;
  }

  private mac(value: string | undefined): string {
    if (!value || !/^(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(value)) throw new ServiceUnavailableException('A valid target MAC address is required for Aruba Central disconnect');
    return value.replace(/-/g, ':').toLowerCase();
  }

  private records(value: unknown, keys: string[]): JsonRecord[] {
    const body = this.record(value);
    for (const key of keys) if (Array.isArray(body[key])) return (body[key] as unknown[]).filter((row): row is JsonRecord => this.isRecord(row));
    if (Array.isArray(value)) return value.filter((row): row is JsonRecord => this.isRecord(row));
    throw new ServiceUnavailableException('Aruba Central response did not contain a recognized client collection');
  }
  private normalize(row: JsonRecord): NormalizedWifiClient {
    const usage = this.record(row.usage);
    return {
      username: this.string(row, ['username', 'user_name', 'name', 'client_name']),
      address: this.string(row, ['ip_address', 'ip', 'address']),
      macAddress: this.string(row, ['macaddr', 'mac_address', 'macAddress', 'mac']),
      bytesIn: this.counter(row, ['bytes_in', 'bytesIn', 'rx_bytes', 'rxBytes']) || this.counter(usage, ['rx', 'bytes_in']) || '0',
      bytesOut: this.counter(row, ['bytes_out', 'bytesOut', 'tx_bytes', 'txBytes']) || this.counter(usage, ['tx', 'bytes_out']) || '0',
    };
  }
  private record(value: unknown): JsonRecord { return this.isRecord(value) ? value : {}; }
  private isRecord(value: unknown): value is JsonRecord { return typeof value === 'object' && value !== null && !Array.isArray(value); }
  private string(record: JsonRecord, keys: string[]): string | undefined { for (const key of keys) if (typeof record[key] === 'string' && (record[key] as string).trim()) return record[key] as string; return undefined; }
  private number(record: JsonRecord, keys: string[]): number | undefined { for (const key of keys) if (typeof record[key] === 'number' && Number.isFinite(record[key])) return record[key] as number; return undefined; }
  private counter(record: JsonRecord, keys: string[]): string { for (const key of keys) { const value = record[key]; if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value); if (typeof value === 'string' && /^\d+$/.test(value)) return value; } return ''; }
  private boolean(record: JsonRecord, keys: string[]): boolean | undefined { for (const key of keys) if (typeof record[key] === 'boolean') return record[key] as boolean; return undefined; }
}
