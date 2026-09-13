import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NetworkManagementProtocol } from '../../routers/routers.dto';
import { MikroTikHotspotActiveRecord, MikroTikTrafficEnforcementAdapter } from './mikrotik.adapter';

export interface NetworkDeviceConnection {
  routerId: string;
  protocol: NetworkManagementProtocol;
  endpoint?: string;
  controllerEndpoint?: string;
}

export interface NormalizedWifiClient {
  username?: string;
  address?: string;
  macAddress?: string;
  bytesIn: string;
  bytesOut: string;
}

@Injectable()
export class NetworkDeviceAdapterRegistry {
  constructor(
    private readonly config: ConfigService,
    private readonly mikrotik: MikroTikTrafficEnforcementAdapter,
  ) {}

  async readClients(connection: NetworkDeviceConnection): Promise<NormalizedWifiClient[]> {
    if (connection.protocol === 'MIKROTIK_REST') {
      const records = await this.mikrotik.readHotspotActive(connection.endpoint ?? '');
      return records.map((record: MikroTikHotspotActiveRecord) => ({
        username: record.user,
        address: record.address,
        macAddress: record['mac-address'],
        bytesIn: record['bytes-in'] ?? '0',
        bytesOut: record['bytes-out'] ?? '0',
      }));
    }

    if (['UNIFI_NETWORK_API', 'OPENWRT_UBUS', 'CAMBIUM_CNMAESTRO', 'GENERIC_HTTP'].includes(connection.protocol)) {
      return this.readGenericHttp(connection);
    }

    if (connection.protocol === 'SNMP' || connection.protocol === 'RADIUS_NAS') {
      throw new ServiceUnavailableException(`${connection.protocol} telemetry is not enabled for this device yet; refusing unsafe commands`);
    }
    throw new ServiceUnavailableException(`Unsupported network management protocol: ${connection.protocol}`);
  }

  private async readGenericHttp(connection: NetworkDeviceConnection): Promise<NormalizedWifiClient[]> {
    const endpoint = connection.controllerEndpoint ?? connection.endpoint;
    if (!endpoint) throw new ServiceUnavailableException(`Management endpoint is not configured for ${connection.routerId}`);
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' && this.config.get<string>('JASLYN_NETWORK_ALLOW_HTTP', 'false') !== 'true') {
      throw new ServiceUnavailableException('Network device API must use HTTPS in production');
    }

    const token = this.config.get<string>('JASLYN_NETWORK_API_TOKEN');
    const username = this.config.get<string>('JASLYN_NETWORK_API_USERNAME');
    const password = this.config.get<string>('JASLYN_NETWORK_API_PASSWORD');
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    else if (username && password) headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
    else throw new ServiceUnavailableException('Generic network API credentials are not configured');

    const configured = Number(this.config.get<string>('JASLYN_NETWORK_API_TIMEOUT_MS', '5000'));
    const timeoutMs = Math.min(Math.max(Number.isFinite(configured) ? configured : 5000, 1000), 30000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { headers, signal: controller.signal });
      if (!response.ok) throw new ServiceUnavailableException(`Network device API request failed (${response.status})`);
      const body = await response.json() as unknown;
      return this.extractRecords(body).map((record) => ({
        username: this.stringValue(record, ['username', 'user', 'name']),
        address: this.stringValue(record, ['ipAddress', 'ip', 'address']),
        macAddress: this.stringValue(record, ['macAddress', 'mac', 'mac-address']),
        bytesIn: this.counter(record, ['bytesIn', 'bytes_in', 'rxBytes', 'downloadBytes']),
        bytesOut: this.counter(record, ['bytesOut', 'bytes_out', 'txBytes', 'uploadBytes']),
      }));
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('Network device API request failed or timed out');
    } finally {
      clearTimeout(timer);
    }
  }

  private extractRecords(body: unknown): Record<string, unknown>[] {
    if (Array.isArray(body)) return body.filter(this.isRecord);
    if (!this.isRecord(body)) throw new ServiceUnavailableException('Network device API returned invalid JSON');
    for (const key of ['clients', 'users', 'sessions', 'data', 'results']) {
      const value = body[key];
      if (Array.isArray(value)) return value.filter(this.isRecord);
    }
    throw new ServiceUnavailableException('Network device API response has no supported client collection');
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private stringValue(record: Record<string, unknown>, keys: string[]) {
    for (const key of keys) if (typeof record[key] === 'string' && record[key].trim()) return record[key] as string;
    return undefined;
  }

  private counter(record: Record<string, unknown>, keys: string[]): string {
    for (const key of keys) {
      const value = record[key];
      const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : typeof value === 'string' ? value : '';
      if (/^\d+$/.test(text)) return text;
    }
    return '0';
  }
}
