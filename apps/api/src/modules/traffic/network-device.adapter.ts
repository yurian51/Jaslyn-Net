import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { NetworkManagementProtocol } from '../../routers/routers.dto';
import { MikroTikHotspotActiveRecord, MikroTikTrafficEnforcementAdapter } from './mikrotik.adapter';
import { NetworkCredentials } from '../../common/secure-network-credentials';

export interface NetworkDeviceConnection { routerId: string; protocol: NetworkManagementProtocol; endpoint?: string; controllerEndpoint?: string; capabilities?: Record<string, unknown>; credentials?: NetworkCredentials; }
export interface NormalizedWifiClient { username?: string; address?: string; macAddress?: string; bytesIn: string; bytesOut: string; }

@Injectable()
export class NetworkDeviceAdapterRegistry {
  constructor(private readonly config: ConfigService, private readonly mikrotik: MikroTikTrafficEnforcementAdapter) {}

  async readClients(connection: NetworkDeviceConnection): Promise<NormalizedWifiClient[]> {
    switch (connection.protocol) {
      case 'MIKROTIK_REST': {
        const records = await this.mikrotik.readHotspotActive(connection.endpoint ?? '', connection.credentials);
        return records.map((record: MikroTikHotspotActiveRecord) => ({ username: record.user, address: record.address, macAddress: record['mac-address'], bytesIn: record['bytes-in'] ?? '0', bytesOut: record['bytes-out'] ?? '0' }));
      }
      case 'UNIFI_NETWORK_API': return this.readUniFi(connection);
      case 'MERAKI_DASHBOARD_API': return this.readMeraki(connection);
      case 'OPENWRT_UBUS': return this.readOpenWrt(connection);
      case 'CAMBIUM_CNMAESTRO':
      case 'OMADA_CONTROLLER_API':
      case 'ARUBA_CENTRAL_API':
      case 'GRANDSTREAM_GWN_API':
      case 'RUIJIE_REYEE_CLOUD_API':
      case 'RUCKUS_SMARTZONE_API':
      case 'TELTONIKA_RMS_API':
      case 'PEPLINK_INCONTROL_API':
      case 'PFSENSE_API':
      case 'GENERIC_HTTP': return this.readGenericHttp(connection);
      case 'SNMP':
      case 'RADIUS_NAS': throw new ServiceUnavailableException(`${connection.protocol} telemetry requires its native transport/accounting adapter; refusing unsafe fallback`);
      default: throw new ServiceUnavailableException(`Unsupported network management protocol: ${connection.protocol}`);
    }
  }

  private async readOpenWrt(connection: NetworkDeviceConnection): Promise<NormalizedWifiClient[]> {
    const endpoint = (connection.controllerEndpoint ?? connection.endpoint)?.replace(/\/+$/, '');
    const username = connection.credentials?.username;
    const password = connection.credentials?.password;
    if (!endpoint || !username || password === undefined) throw new ServiceUnavailableException(`OpenWrt ubus endpoint and credentials are required for ${connection.routerId}`);
    const base = endpoint.endsWith('/ubus') ? endpoint : `${endpoint}/ubus`;
    const session = await this.ubusCall(base, 'session', 'login', { username, password, timeout: 300 });
    const sid = this.isRecord(session) ? this.stringValue(session, ['ubus_rpc_session']) : undefined;
    if (!sid) throw new ServiceUnavailableException('OpenWrt ubus login did not return a session');
    const devices = await this.ubusCall(base, 'iwinfo', 'devices', {}, sid);
    const names = this.extractDeviceNames(devices);
    const clients: NormalizedWifiClient[] = [];
    for (const device of names) {
      const payload = await this.ubusCall(base, 'iwinfo', 'assoclist', { device }, sid);
      for (const row of this.extractAssocRecords(payload)) {
        const mac = this.stringValue(row, ['mac', 'mac-address', 'macaddr']);
        if (!mac) continue;
        clients.push({ macAddress: mac, address: this.stringValue(row, ['ip', 'ipAddress', 'address']), bytesIn: this.counter(row, ['rx_bytes', 'rxBytes', 'bytesIn']), bytesOut: this.counter(row, ['tx_bytes', 'txBytes', 'bytesOut']) });
      }
    }
    return clients;
  }

  private async ubusCall(endpoint: string, object: string, method: string, args: Record<string, unknown>, sid?: string): Promise<unknown> {
    const params = [sid ?? '00000000000000000000000000000000', object, method, args];
    const body = await this.fetchJson(endpoint, { 'Content-Type': 'application/json', Accept: 'application/json' }, { jsonrpc: '2.0', id: Date.now(), method: 'call', params });
    if (!this.isRecord(body) || !Array.isArray(body.result) || body.result[0] !== 0) throw new ServiceUnavailableException(`OpenWrt ubus call ${object}.${method} failed`);
    return body.result[1];
  }

  private extractDeviceNames(payload: unknown): string[] {
    if (!this.isRecord(payload)) return [];
    const values = payload.devices;
    if (Array.isArray(values)) return values.map((value) => typeof value === 'string' ? value : this.stringValue(this.isRecord(value) ? value : undefined, ['device', 'name'])).filter((value): value is string => Boolean(value));
    return [];
  }

  private extractAssocRecords(payload: unknown): Record<string, unknown>[] {
    if (!this.isRecord(payload)) return [];
    for (const key of ['results', 'assoclist', 'clients', 'data']) if (Array.isArray(payload[key])) return payload[key].filter(this.isRecord);
    return [];
  }

  private async readUniFi(connection: NetworkDeviceConnection): Promise<NormalizedWifiClient[]> {
    const base = connection.controllerEndpoint ?? connection.endpoint;
    if (!base) throw new ServiceUnavailableException(`UniFi API endpoint is not configured for ${connection.routerId}`);
    const apiKey = connection.credentials?.apiKey ?? connection.credentials?.accessToken ?? this.config.get<string>('JASLYN_UNIFI_API_KEY');
    if (!apiKey) throw new ServiceUnavailableException('UniFi API credentials are not configured');
    const root = base.replace(/\/$/, ''); const apiRoot = root.endsWith('/v1') ? root : `${root}/v1`;
    const sites = await this.fetchJson(`${apiRoot}/sites`, { 'X-API-Key': apiKey }); const clients: NormalizedWifiClient[] = [];
    for (const site of this.extractRecords(sites, ['data', 'sites'])) {
      const siteId = this.stringValue(site, ['siteId', 'id']); if (!siteId) continue;
      const payload = await this.fetchJson(`${apiRoot}/sites/${encodeURIComponent(siteId)}/clients`, { 'X-API-Key': apiKey });
      for (const record of this.extractRecords(payload, ['data', 'clients'])) clients.push(this.normalizeRecord(record));
    }
    return clients;
  }

  private async readMeraki(connection: NetworkDeviceConnection): Promise<NormalizedWifiClient[]> {
    const networkId = this.stringValue(connection.capabilities ?? {}, ['networkId', 'merakiNetworkId']);
    if (!networkId) throw new ServiceUnavailableException(`Meraki networkId is not configured for ${connection.routerId}`);
    const endpoint = (connection.controllerEndpoint ?? connection.endpoint ?? 'https://api.meraki.com/api/v1').replace(/\/$/, '');
    const apiKey = connection.credentials?.apiKey ?? connection.credentials?.accessToken ?? this.config.get<string>('JASLYN_MERAKI_API_KEY');
    if (!apiKey) throw new ServiceUnavailableException('Meraki API credentials are not configured');
    const payload = await this.fetchJson(`${endpoint}/networks/${encodeURIComponent(networkId)}/clients?timespan=300`, { 'X-Cisco-Meraki-API-Key': apiKey });
    return this.extractRecords(payload, ['data', 'clients']).map((record) => this.normalizeRecord(record));
  }

  private async readGenericHttp(connection: NetworkDeviceConnection): Promise<NormalizedWifiClient[]> {
    const endpoint = connection.controllerEndpoint ?? connection.endpoint;
    if (!endpoint) throw new ServiceUnavailableException(`Management endpoint is not configured for ${connection.routerId}`);
    const body = await this.fetchJson(endpoint, this.genericHeaders(connection.credentials));
    return this.extractRecords(body, ['clients', 'users', 'sessions', 'data', 'results']).map((record) => this.normalizeRecord(record));
  }

  private genericHeaders(credentials?: NetworkCredentials): Record<string, string> {
    const token = credentials?.apiKey ?? credentials?.accessToken ?? this.config.get<string>('JASLYN_NETWORK_API_TOKEN');
    const username = credentials?.username ?? this.config.get<string>('JASLYN_NETWORK_API_USERNAME');
    const password = credentials?.password ?? this.config.get<string>('JASLYN_NETWORK_API_PASSWORD');
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    else if (username && password) headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
    else throw new ServiceUnavailableException('Network device API credentials are not configured');
    return headers;
  }

  private async fetchJson(url: string, headers: Record<string, string>, body?: unknown): Promise<unknown> {
    const parsed = await this.validateEndpoint(url);
    const configured = Number(this.config.get<string>('JASLYN_NETWORK_API_TIMEOUT_MS', '5000')); const timeoutMs = Math.min(Math.max(Number.isFinite(configured) ? configured : 5000, 1000), 30000);
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(parsed, { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal, redirect: 'error' });
      if (!response.ok) throw new ServiceUnavailableException(`Network device API request failed (${response.status})`);
      return await response.json() as unknown;
    } catch (error) { if (error instanceof ServiceUnavailableException) throw error; throw new ServiceUnavailableException('Network device API request failed or timed out'); }
    finally { clearTimeout(timer); }
  }

  private async validateEndpoint(rawUrl: string): Promise<URL> {
    let parsed: URL;
    try { parsed = new URL(rawUrl); } catch { throw new ServiceUnavailableException('Network device API endpoint is not a valid URL'); }
    if (parsed.protocol !== 'https:' && this.config.get<string>('JASLYN_NETWORK_ALLOW_HTTP', 'false') !== 'true') throw new ServiceUnavailableException('Network device API must use HTTPS in production');
    if (parsed.username || parsed.password) throw new ServiceUnavailableException('Network device API endpoint must not contain embedded credentials');
    if (parsed.hostname === 'localhost' || parsed.hostname.endsWith('.localhost') || parsed.hostname === 'metadata.google.internal') throw new ServiceUnavailableException('Network device API endpoint hostname is not allowed');
    const addresses = isIP(parsed.hostname) ? [parsed.hostname] : (await lookup(parsed.hostname, { all: true })).map((entry) => entry.address);
    if (!addresses.length || addresses.some((address) => this.isForbiddenAddress(address))) throw new ServiceUnavailableException('Network device API endpoint resolves to a restricted address');
    return parsed;
  }

  private isForbiddenAddress(address: string): boolean {
    if (isIP(address) === 4) {
      const [a, b, c] = address.split('.').map(Number);
      return a === 0 || a === 127 || (a === 169 && b === 254) || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) || (a === 192 && b === 0 && c === 0);
    }
    const normalized = address.toLowerCase();
    return normalized === '::' || normalized === '::1' || normalized.startsWith('fe80:') || normalized.startsWith('ff') || normalized.startsWith('::ffff:127.') || normalized.startsWith('::ffff:0.');
  }

  private extractRecords(body: unknown, preferredKeys: string[] = []): Record<string, unknown>[] {
    if (Array.isArray(body)) return body.filter(this.isRecord);
    if (!this.isRecord(body)) throw new ServiceUnavailableException('Network device API returned invalid JSON');
    for (const key of [...preferredKeys, 'clients', 'users', 'sessions', 'data', 'results']) { const value = body[key]; if (Array.isArray(value)) return value.filter(this.isRecord); }
    throw new ServiceUnavailableException('Network device API response has no supported client collection');
  }
  private normalizeRecord(record: Record<string, unknown>): NormalizedWifiClient {
    const usage = this.isRecord(record.usage) ? record.usage : undefined;
    return { username: this.stringValue(record, ['username', 'user', 'name', 'description']), address: this.stringValue(record, ['ipAddress', 'ip', 'address', 'ip6']), macAddress: this.stringValue(record, ['macAddress', 'mac', 'mac-address', 'macAddr']), bytesIn: this.counter(record, ['bytesIn', 'bytes_in', 'rxBytes', 'downloadBytes', 'usageDown', 'downBytes']) || this.counter(usage, ['recv', 'rx', 'download']), bytesOut: this.counter(record, ['bytesOut', 'bytes_out', 'txBytes', 'uploadBytes', 'usageUp', 'upBytes']) || this.counter(usage, ['sent', 'tx', 'upload']) };
  }
  private isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
  private stringValue(record: Record<string, unknown> | undefined, keys: string[]) { if (!record) return undefined; for (const key of keys) if (typeof record[key] === 'string' && record[key].trim()) return record[key] as string; return undefined; }
  private counter(record: Record<string, unknown> | undefined, keys: string[]): string { if (!record) return ''; for (const key of keys) { const value = record[key]; const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : typeof value === 'string' ? value : ''; if (/^\d+$/.test(text)) return text; } return ''; }
}
