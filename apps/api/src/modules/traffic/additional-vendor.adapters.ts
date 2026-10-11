import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { NetworkDeviceConnection, NormalizedWifiClient } from './network-device.adapter';
import { isRestrictedNetworkAddress } from './network-endpoint-security';

type JsonRecord = Record<string, unknown>;

/**
 * Read-only vendor API adapter base. Vendor APIs vary by cloud region, controller
 * release and licensed feature set, so controllerEndpoint must be the exact
 * documented client/session collection endpoint (not just a guessed controller root).
 * The adapter never tries a different vendor's endpoint or auth scheme on failure.
 */
abstract class VendorReadOnlyApiAdapter {
  constructor(protected readonly config: ConfigService) {}
  protected abstract readonly vendorName: string;
  protected abstract headers(connection: NetworkDeviceConnection): Record<string, string>;

  async readClients(connection: NetworkDeviceConnection): Promise<NormalizedWifiClient[]> {
    const endpoint = connection.controllerEndpoint ?? connection.endpoint;
    if (!endpoint) throw new ServiceUnavailableException(`${this.vendorName} API endpoint is required`);
    let url: URL;
    try { url = new URL(endpoint); } catch { throw new ServiceUnavailableException(`${this.vendorName} API endpoint is invalid`); }
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
      throw new ServiceUnavailableException(`${this.vendorName} API endpoint must be HTTPS without embedded credentials or fragment`);
    }
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === 'metadata.google.internal') {
      throw new ServiceUnavailableException(`${this.vendorName} API hostname is blocked`);
    }
    const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((entry) => entry.address);
    const allowPrivate = this.config.get<string>('JASLYN_NETWORK_ALLOW_PRIVATE_ENDPOINTS', 'false') === 'true';
    if (!addresses.length || addresses.some((address) => isRestrictedNetworkAddress(address) && !allowPrivate)) {
      throw new ServiceUnavailableException(`${this.vendorName} API endpoint resolves to a restricted address`);
    }

    const configured = Number(this.config.get<string>('JASLYN_NETWORK_API_TIMEOUT_MS', '5000'));
    const timeout = Math.min(Math.max(Number.isFinite(configured) ? configured : 5000, 1000), 30000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { headers: this.headers(connection), signal: controller.signal, redirect: 'error' });
      if (!response.ok) throw new ServiceUnavailableException(`${this.vendorName} API request failed (${response.status})`);
      const payload: unknown = await response.json();
      const records = this.records(payload);
      return records.map((row) => this.normalize(row));
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException(`${this.vendorName} API request failed or timed out`);
    } finally { clearTimeout(timer); }
  }

  protected records(payload: unknown): JsonRecord[] {
    if (Array.isArray(payload)) return payload.filter((row): row is JsonRecord => this.isRecord(row));
    if (!this.isRecord(payload)) throw new ServiceUnavailableException(`${this.vendorName} API returned invalid JSON`);
    if (typeof payload.error === 'string' || (typeof payload.errorCode === 'number' && payload.errorCode !== 0)) {
      throw new ServiceUnavailableException(`${this.vendorName} API returned an application error`);
    }
    for (const key of ['clients', 'clientList', 'sessions', 'users', 'items', 'rows', 'data', 'results']) {
      const value = payload[key];
      if (Array.isArray(value)) return value.filter((row): row is JsonRecord => this.isRecord(row));
      if (this.isRecord(value)) {
        for (const nested of ['clients', 'clientList', 'sessions', 'users', 'items', 'rows', 'data', 'results']) {
          if (Array.isArray(value[nested])) return (value[nested] as unknown[]).filter((row): row is JsonRecord => this.isRecord(row));
        }
      }
    }
    throw new ServiceUnavailableException(`${this.vendorName} response has no supported client/session collection; verify the configured API resource`);
  }

  protected normalize(row: JsonRecord): NormalizedWifiClient {
    const usage = this.isRecord(row.usage) ? row.usage : {};
    return {
      username: this.string(row, ['username', 'userName', 'user_name', 'user', 'name', 'clientName', 'client_name', 'description']),
      address: this.string(row, ['ipAddress', 'ip_address', 'clientIp', 'client_ip', 'ip', 'ipAddr', 'address']),
      macAddress: this.string(row, ['macAddress', 'mac_address', 'clientMac', 'client_mac', 'mac', 'macAddr', 'mac-address']),
      bytesIn: this.counter(row, ['bytesIn', 'bytes_in', 'rxBytes', 'rx_bytes', 'uploadBytes', 'upload_bytes', 'trafficUp', 'flowUp']) || this.counter(usage, ['recv', 'rx', 'upload']) || '0',
      bytesOut: this.counter(row, ['bytesOut', 'bytes_out', 'txBytes', 'tx_bytes', 'downloadBytes', 'download_bytes', 'trafficDown', 'flowDown']) || this.counter(usage, ['sent', 'tx', 'download']) || '0',
    };
  }
  protected isRecord(value: unknown): value is JsonRecord { return typeof value === 'object' && value !== null && !Array.isArray(value); }
  protected string(row: JsonRecord, keys: string[]): string | undefined {
    for (const key of keys) if (typeof row[key] === 'string' && (row[key] as string).trim()) return row[key] as string;
    return undefined;
  }
  protected counter(row: JsonRecord, keys: string[]): string {
    for (const key of keys) {
      const value = row[key];
      if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
      if (typeof value === 'string' && /^\d+$/.test(value)) return value;
    }
    return '';
  }
  protected bearer(connection: NetworkDeviceConnection, label: string): Record<string, string> {
    const token = connection.credentials?.accessToken ?? connection.credentials?.apiKey;
    if (!token) throw new ServiceUnavailableException(`${label} requires a per-device encrypted accessToken or apiKey`);
    return { Accept: 'application/json', Authorization: `Bearer ${token}` };
  }
}

@Injectable()
export class ArubaCentralNetworkAdapter extends VendorReadOnlyApiAdapter {
  protected readonly vendorName = 'Aruba Central';
  protected headers(connection: NetworkDeviceConnection) { return this.bearer(connection, this.vendorName); }
  constructor(config: ConfigService) { super(config); }
}

@Injectable()
export class CambiumCnMaestroNetworkAdapter extends VendorReadOnlyApiAdapter {
  protected readonly vendorName = 'Cambium cnMaestro';
  protected headers(connection: NetworkDeviceConnection) { return this.bearer(connection, this.vendorName); }
  constructor(config: ConfigService) { super(config); }

  /**
   * cnMaestro uses OAuth 2.0 client credentials. The exact session collection
   * URL and token URL are configured explicitly because Cloud and on-prem API
   * roots/version prefixes differ. Never infer a session URL from device inventory.
   */
  override async readClients(connection: NetworkDeviceConnection): Promise<NormalizedWifiClient[]> {
    const clientId = connection.credentials?.clientId;
    const clientSecret = connection.credentials?.clientSecret;
    const tokenEndpoint = typeof connection.capabilities?.tokenEndpoint === 'string'
      ? connection.capabilities.tokenEndpoint : undefined;
    if (!clientId || !clientSecret || !tokenEndpoint) {
      throw new ServiceUnavailableException(
        'Cambium cnMaestro requires encrypted clientId/clientSecret and capabilities.tokenEndpoint; configure the exact documented client/session resource as controllerEndpoint',
      );
    }
    const tokenUrl = await this.validateCambiumUrl(tokenEndpoint);
    const configured = Number(this.config.get<string>('JASLYN_NETWORK_API_TIMEOUT_MS', '5000'));
    const timeout = Math.min(Math.max(Number.isFinite(configured) ? configured : 5000, 1000), 30000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    let token: string;
    try {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        },
        body: new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
        signal: controller.signal,
        redirect: 'error',
      });
      if (!response.ok) throw new ServiceUnavailableException(`Cambium cnMaestro OAuth token request failed (${response.status})`);
      const payload: unknown = await response.json();
      if (!this.isRecord(payload) || typeof payload.access_token !== 'string' || !payload.access_token.trim()) {
        throw new ServiceUnavailableException('Cambium cnMaestro OAuth response did not contain an access_token');
      }
      token = payload.access_token;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('Cambium cnMaestro OAuth token request failed or timed out');
    } finally { clearTimeout(timer); }

    // Keep the token in memory for this request only; never persist or log it.
    return super.readClients({
      ...connection,
      credentials: { ...connection.credentials, accessToken: token, apiKey: undefined },
    });
  }

  private async validateCambiumUrl(rawUrl: string): Promise<URL> {
    let url: URL;
    try { url = new URL(rawUrl); } catch { throw new ServiceUnavailableException('Cambium cnMaestro token endpoint is invalid'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
      throw new ServiceUnavailableException('Cambium cnMaestro token endpoint must use HTTPS without embedded credentials or fragment');
    }
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === 'metadata.google.internal') {
      throw new ServiceUnavailableException('Cambium cnMaestro token hostname is blocked');
    }
    const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((entry) => entry.address);
    const allowPrivate = this.config.get<string>('JASLYN_NETWORK_ALLOW_PRIVATE_ENDPOINTS', 'false') === 'true';
    if (!addresses.length || addresses.some((address) => isRestrictedNetworkAddress(address) && !allowPrivate)) {
      throw new ServiceUnavailableException('Cambium cnMaestro token endpoint resolves to a restricted address');
    }
    return url;
  }
}

@Injectable()
export class GrandstreamGwnNetworkAdapter extends VendorReadOnlyApiAdapter {
  protected readonly vendorName = 'Grandstream GWN';
  protected headers(connection: NetworkDeviceConnection) {
    const token = connection.credentials?.accessToken;
    if (!token) throw new ServiceUnavailableException('Grandstream GWN requires a provider-issued accessToken; API Developer App ID/Secret exchange must be completed for the specific GWN.Cloud or GWN Manager API version');
    return { Accept: 'application/json', Authorization: `Bearer ${token}` };
  }
  constructor(config: ConfigService) { super(config); }
}

@Injectable()
export class RuckusSmartZoneNetworkAdapter extends VendorReadOnlyApiAdapter {
  protected readonly vendorName = 'Ruckus SmartZone';
  protected headers(connection: NetworkDeviceConnection) { return this.bearer(connection, this.vendorName); }
  constructor(config: ConfigService) { super(config); }
}

@Injectable()
export class TeltonikaRmsNetworkAdapter extends VendorReadOnlyApiAdapter {
  protected readonly vendorName = 'Teltonika RMS';
  protected headers(connection: NetworkDeviceConnection) { return this.bearer(connection, this.vendorName); }
  constructor(config: ConfigService) { super(config); }
}

@Injectable()
export class PeplinkInControlNetworkAdapter extends VendorReadOnlyApiAdapter {
  protected readonly vendorName = 'Peplink InControl';
  protected headers(connection: NetworkDeviceConnection) { return this.bearer(connection, this.vendorName); }
  constructor(config: ConfigService) { super(config); }
}

@Injectable()
export class PfSenseOpnSenseNetworkAdapter extends VendorReadOnlyApiAdapter {
  protected readonly vendorName = 'pfSense/OPNsense';
  protected headers(connection: NetworkDeviceConnection) {
    const key = connection.credentials?.apiKey ?? connection.credentials?.username;
    const secret = connection.credentials?.clientSecret ?? connection.credentials?.password;
    if (!key || !secret) throw new ServiceUnavailableException('pfSense/OPNsense requires per-device API key and secret credentials');
    return { Accept: 'application/json', Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}` };
  }
  constructor(config: ConfigService) { super(config); }
}
