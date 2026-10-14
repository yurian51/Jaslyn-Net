import { BadRequestException, ConflictException, HttpException, ServiceUnavailableException } from '@nestjs/common';

export interface MerakiFirmwareCredentials {
  apiKey: string;
  networkId: string;
  productType: string;
}
export interface MerakiFirmwareVersion {
  id: string;
  firmware?: string;
  shortName?: string;
  releaseType?: string;
  releaseDate?: string;
}
export interface MerakiFirmwareInspection {
  networkId: string;
  productType: string;
  currentVersion: MerakiFirmwareVersion | null;
  availableVersions: MerakiFirmwareVersion[];
  isUpgradeAvailable: boolean;
  nextUpgrade: unknown;
  timezone?: string;
  upgradeWindow?: unknown;
}

/** Cisco Meraki Dashboard API v1 executor. Uses only the official cloud API and never downloads firmware artifacts. */
export class MerakiFirmwareExecutor {
  private readonly baseUrl = 'https://api.meraki.com/api/v1';

  async inspect(credentials: MerakiFirmwareCredentials): Promise<MerakiFirmwareInspection> {
    this.validateCredentials(credentials);
    const response = await this.request(credentials, 'GET', this.networkPath(credentials.networkId));
    const products = this.asRecord(response.products, 'products');
    const product = this.asRecord(products[credentials.productType], 'configured product type');
    const availableVersions = Array.isArray(product.availableVersions)
      ? product.availableVersions.filter((v): v is MerakiFirmwareVersion => this.isRecord(v) && typeof v.id === 'string')
      : [];
    const currentVersion = this.isRecord(product.currentVersion) && typeof product.currentVersion.id === 'string'
      ? product.currentVersion as MerakiFirmwareVersion : null;
    return {
      networkId: credentials.networkId,
      productType: credentials.productType,
      currentVersion,
      availableVersions,
      isUpgradeAvailable: product.isUpgradeAvailable === true,
      nextUpgrade: product.nextUpgrade ?? null,
      timezone: typeof response.timezone === 'string' ? response.timezone : undefined,
      upgradeWindow: response.upgradeWindow ?? null,
    };
  }

  async scheduleUpgrade(
    credentials: MerakiFirmwareCredentials,
    input: { targetVersion: string; scheduledAt: string; timezone: string; approved: true },
  ) {
    this.validateCredentials(credentials);
    if (input.approved !== true) throw new BadRequestException('Explicit administrator approval is required');
    if (typeof input.targetVersion !== 'string' || !input.targetVersion.trim() || input.targetVersion.length > 160) {
      throw new BadRequestException('targetVersion must be a bounded version ID or exact firmware label');
    }
    const scheduledAt = new Date(input.scheduledAt);
    if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now() + 15 * 60_000) {
      throw new BadRequestException('Firmware schedule must be at least 15 minutes in the future');
    }
    if (typeof input.timezone !== 'string' || input.timezone.length > 100) throw new BadRequestException('A valid IANA timezone is required');
    try { new Intl.DateTimeFormat('en-US', { timeZone: input.timezone }); } catch {
      throw new BadRequestException('timezone must be a valid IANA timezone');
    }

    const before = await this.request(credentials, 'GET', this.networkPath(credentials.networkId));
    if (typeof before.timezone === 'string' && before.timezone !== input.timezone) {
      throw new BadRequestException('Requested timezone must match the existing Meraki network timezone; change it in Dashboard separately');
    }
    const products = this.asRecord(before.products, 'products');
    const product = this.asRecord(products[credentials.productType], 'configured product type');
    const available = Array.isArray(product.availableVersions) ? product.availableVersions : [];
    const target = available.find((v) => this.isRecord(v) && (v.id === input.targetVersion || v.firmware === input.targetVersion || v.shortName === input.targetVersion));
    if (!this.isRecord(target) || typeof target.id !== 'string') {
      throw new ConflictException('Requested firmware is not listed as available by Meraki for this network/product');
    }
    const current = this.isRecord(product.currentVersion) ? product.currentVersion : null;
    if (current?.id === target.id) throw new BadRequestException('Requested firmware is already installed');
    const nextUpgrade = this.isRecord(product.nextUpgrade) ? product.nextUpgrade : {};
    const preservedProducts: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(products)) {
      if (!this.isRecord(value)) continue;
      const writable: Record<string, unknown> = {};
      if (this.isRecord(value.nextUpgrade)) {
        const priorNext = value.nextUpgrade;
        const next: Record<string, unknown> = {};
        for (const field of ['time', 'toVersion', 'strategy', 'predownload']) {
          if (priorNext[field] !== undefined) next[field] = priorNext[field];
        }
        writable.nextUpgrade = next;
      }
      for (const field of ['participateInNextBetaRelease', 'predownload']) {
        if (value[field] !== undefined) writable[field] = value[field];
      }
      preservedProducts[key] = writable;
    }
    const requestedNextUpgrade: Record<string, unknown> = {};
    for (const field of ['strategy', 'predownload']) {
      if (nextUpgrade[field] !== undefined) requestedNextUpgrade[field] = nextUpgrade[field];
    }
    requestedNextUpgrade.time = scheduledAt.toISOString();
    requestedNextUpgrade.toVersion = { id: target.id };
    preservedProducts[credentials.productType] = {
      ...(preservedProducts[credentials.productType] as Record<string, unknown> ?? {}),
      nextUpgrade: requestedNextUpgrade,
      ...(product.participateInNextBetaRelease === undefined ? {} : { participateInNextBetaRelease: product.participateInNextBetaRelease }),
      ...(product.predownload === undefined ? {} : { predownload: product.predownload }),
    };
    const body: Record<string, unknown> = { products: preservedProducts };
    if (typeof before.timezone === 'string') body.timezone = before.timezone;
    if (this.isRecord(before.upgradeWindow)) body.upgradeWindow = before.upgradeWindow;

    const updated = await this.request(credentials, 'PUT', this.networkPath(credentials.networkId), body);
    const updatedProducts = this.asRecord(updated.products, 'updated products');
    const updatedProduct = this.asRecord(updatedProducts[credentials.productType], 'updated product');
    const observedNext = this.isRecord(updatedProduct.nextUpgrade) ? updatedProduct.nextUpgrade : null;
    const observedVersion = observedNext && this.isRecord(observedNext.toVersion) ? observedNext.toVersion.id : undefined;
    if (observedVersion !== target.id) {
      throw new ServiceUnavailableException('Meraki accepted the update request but did not return matching scheduled target evidence; inspect the Dashboard before retrying');
    }
    return {
      status: 'SCHEDULED',
      networkId: credentials.networkId,
      productType: credentials.productType,
      targetVersion: target.id,
      scheduledAt: typeof observedNext?.time === 'string' ? observedNext.time : scheduledAt.toISOString(),
      currentVersion: current?.id ?? null,
      verification: 'Meraki Dashboard returned the requested target version in nextUpgrade',
    };
  }

  private async request(credentials: MerakiFirmwareCredentials, method: 'GET' | 'PUT', path: string, body?: unknown): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(this.baseUrl + path, {
        method,
        redirect: 'error',
        signal: controller.signal,
        headers: {
          'X-Cisco-Meraki-API-Key': credentials.apiKey,
          'Accept': 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) {
        // Do not propagate vendor response bodies; they can contain tenant or device details.
        if (response.status === 401 || response.status === 403) throw new ServiceUnavailableException('Meraki API authorization failed; verify the API key and firmware permissions');
        if (response.status === 429) throw new ServiceUnavailableException('Meraki API rate limit reached; retry after the vendor rate-limit window');
        throw new ServiceUnavailableException(`Meraki Dashboard API request failed with HTTP ${response.status}`);
      }
      const json: unknown = await response.json();
      if (!this.isRecord(json)) throw new ServiceUnavailableException('Meraki Dashboard returned an invalid JSON object');
      return json;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('Unable to reach Meraki Dashboard API; no automatic retry was attempted');
    } finally {
      clearTimeout(timeout);
    }
  }

  private networkPath(networkId: string) {
    return `/networks/${encodeURIComponent(networkId)}/firmwareUpgrades`;
  }
  private validateCredentials(credentials: MerakiFirmwareCredentials) {
    if (!credentials || typeof credentials.apiKey !== 'string' || credentials.apiKey.length < 8
      || typeof credentials.networkId !== 'string' || !/^[a-zA-Z0-9_-]{3,160}$/.test(credentials.networkId)
      || typeof credentials.productType !== 'string'
      || !['wireless', 'appliance', 'switch', 'camera', 'cellularGateway', 'sensor', 'wirelessController', 'campusGateway', 'secureConnect', 'switchCatalyst'].includes(credentials.productType)) {
      throw new BadRequestException('Meraki credentials require API key, network ID, and a supported Meraki product type');
    }
  }
  private asRecord(value: unknown, field: string): Record<string, any> {
    if (!this.isRecord(value)) throw new ServiceUnavailableException(`Meraki response is missing ${field}`);
    return value;
  }
  private isRecord(value: unknown): value is Record<string, any> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
}
