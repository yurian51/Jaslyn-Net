import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { NetworkCredentials } from '../common/secure-network-credentials';

export interface MikroTikFirmwareEndpoint {
  endpoint: string;
  credentials: NetworkCredentials;
}

export interface MikroTikFirmwareInspection {
  identity: { boardName: string; model: string; architecture: string; version: string; factoryFirmware: string };
  update: { status: string; installedVersion: string; latestVersion: string; channel: string };
}

/**
 * RouterOS v7 REST implementation for the first supported firmware vendor.
 * This adapter uses MikroTik's own signed update channel; it does not accept
 * arbitrary package URLs. Installation is intentionally separate from inspection
 * and requires a persisted backup receipt and an exact version match.
 */
export class MikroTikFirmwareExecutor {
  async inspect(connection: MikroTikFirmwareEndpoint): Promise<MikroTikFirmwareInspection> {
    const resource = await this.request(connection, '/system/resource/print', 'GET');
    const identity = await this.request(connection, '/system/routerboard/print', 'GET');
    const updateCheck = await this.request(connection, '/system/package/update/check-for-updates', 'POST', {});
    const updateState = await this.request(connection, '/system/package/update/print', 'GET');

    const resourceRow = this.firstRecord(resource, 'system/resource');
    const boardRow = this.firstRecord(identity, 'system/routerboard');
    const updateRows = Array.isArray(updateState) ? updateState : [updateState];
    const updateRow = updateRows.find((row) => this.isRecord(row)) as Record<string, unknown> | undefined;
    const checkRows = Array.isArray(updateCheck) ? updateCheck : [updateCheck];
    const checkRow = [...checkRows].reverse().find((row) => this.isRecord(row)) as Record<string, unknown> | undefined;
    const installedVersion = this.text(updateRow?.['installed-version']) || this.text(resourceRow.version);
    const latestVersion = this.text(checkRow?.['latest-version']) || this.text(updateRow?.['latest-version']);
    const status = this.text(checkRow?.status) || this.text(updateRow?.status);
    if (!installedVersion || !latestVersion || !status) {
      throw new ServiceUnavailableException('MikroTik update server response did not contain installed/latest version and status');
    }
    return {
      identity: {
        boardName: this.text(boardRow?.['board-name']),
        model: this.text(resourceRow['board-name']) || this.text(boardRow?.['model']),
        architecture: this.text(resourceRow['architecture-name']),
        version: installedVersion,
        factoryFirmware: this.text(boardRow?.['factory-firmware']),
      },
      update: {
        status,
        installedVersion,
        latestVersion,
        channel: this.text(updateRow?.channel) || 'stable',
      },
    };
  }

  /**
   * Produces a configuration export through the RouterOS REST API and deletes
   * the temporary router-side file after reading it. The caller MUST encrypt and
   * persist this export in durable backup storage before invoking install().
   */
  async createConfigurationExport(connection: MikroTikFirmwareEndpoint): Promise<{ fileName: string; content: string; sha256: string }> {
    const fileName = `jaslyn-fw-preupgrade-${Date.now()}`;
    await this.request(connection, '/export', 'POST', { file: fileName });
    try {
      const chunks: string[] = [];
      let offset = 0;
      const chunkSize = 32768;
      for (let i = 0; i < 4096; i += 1) {
        const result = await this.request(connection, '/file/read', 'POST', {
          file: `${fileName}.rsc`, 'chunk-size': String(chunkSize), offset: String(offset),
        });
        const row = this.firstRecord(result, 'file/read');
        const chunk = typeof row.data === 'string' ? row.data : '';
        if (!chunk) break;
        chunks.push(chunk);
        offset += Buffer.byteLength(chunk, 'utf8');
        if (Buffer.byteLength(chunk, 'utf8') < chunkSize) break;
        if (i === 4095) throw new ServiceUnavailableException('MikroTik configuration export exceeded the safety size limit');
      }
      const content = chunks.join('');
      if (!content.trim()) throw new ServiceUnavailableException('MikroTik configuration export was empty');
      return { fileName: `${fileName}.rsc`, content, sha256: createHash('sha256').update(content).digest('hex') };
    } finally {
      await this.request(connection, `/file/${encodeURIComponent(`${fileName}.rsc`)}`, 'DELETE').catch(() => undefined);
    }
  }

  /**
   * Executes only RouterOS' official update-server install command. RouterOS
   * selects the latest version on its configured channel, so an exact match with
   * the approved target is mandatory. A caller-provided durable backup receipt
   * is also mandatory; the receipt must be created only after encrypted backup
   * persistence succeeds.
   */
  async install(connection: MikroTikFirmwareEndpoint, input: {
    approvedTargetVersion: string;
    expectedInstalledVersion: string;
    observedLatestVersion: string;
    backupReceiptId: string;
    backupSha256: string;
    maintenanceWindowActive: boolean;
  }): Promise<{ accepted: true; targetVersion: string; backupReceiptId: string }> {
    if (!input.maintenanceWindowActive) throw new BadRequestException('MikroTik firmware install requires an active approved maintenance window');
    if (!input.backupReceiptId.trim() || !/^[a-f0-9]{64}$/i.test(input.backupSha256)) {
      throw new BadRequestException('A durable encrypted backup receipt and SHA-256 digest are required');
    }
    if (!input.approvedTargetVersion || input.approvedTargetVersion !== input.observedLatestVersion) {
      throw new BadRequestException('RouterOS only installs the latest version from its selected channel; target does not match the verified latest version');
    }
    const before = await this.inspect(connection);
    if (before.update.installedVersion !== input.expectedInstalledVersion) {
      throw new ConflictError('MikroTik installed version changed after approval; preview the upgrade again');
    }
    if (before.update.latestVersion !== input.approvedTargetVersion || !/new version is available/i.test(before.update.status)) {
      throw new BadRequestException('MikroTik official update channel does not confirm the approved target version is available');
    }
    await this.request(connection, '/system/package/update/install', 'POST', {});
    return { accepted: true, targetVersion: input.approvedTargetVersion, backupReceiptId: input.backupReceiptId };
  }

  private async request(connection: MikroTikFirmwareEndpoint, path: string, method: string, body?: Record<string, string>): Promise<unknown> {
    const endpoint = connection.endpoint.trim().replace(/\/+$/, '');
    let url: URL;
    try { url = new URL(endpoint); } catch { throw new BadRequestException('MikroTik REST endpoint must be a valid HTTPS URL'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search) {
      throw new BadRequestException('MikroTik REST endpoint must use HTTPS without embedded credentials, query, or fragment');
    }
    if (!connection.credentials.username || connection.credentials.password === undefined) {
      throw new BadRequestException('MikroTik REST username and password are required');
    }
    const basePath = url.pathname.replace(/\/$/, '');
    const target = `${url.origin}${basePath}${path.startsWith('/') ? path : `/${path}`}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const auth = Buffer.from(`${connection.credentials.username}:${connection.credentials.password}`).toString('base64');
      const response = await fetch(target, {
        method,
        redirect: 'manual',
        signal: controller.signal,
        headers: { Authorization: `Basic ${auth}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (response.status >= 300 && response.status < 400) throw new ServiceUnavailableException('MikroTik REST redirects are not allowed');
      const text = await response.text();
      if (!response.ok) throw new ServiceUnavailableException(`MikroTik REST request failed with HTTP ${response.status}: ${text.slice(0, 300)}`);
      if (!text.trim()) return [];
      try { return JSON.parse(text) as unknown; } catch { throw new ServiceUnavailableException('MikroTik REST returned invalid JSON'); }
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException(error instanceof Error && error.name === 'AbortError' ? 'MikroTik REST request timed out' : 'MikroTik REST request failed');
    } finally {
      clearTimeout(timeout);
    }
  }

  private firstRecord(value: unknown, label: string): Record<string, unknown> {
    const rows = Array.isArray(value) ? value : [value];
    const row = rows.find((item) => this.isRecord(item));
    if (!row) throw new ServiceUnavailableException(`MikroTik ${label} returned no record`);
    return row as Record<string, unknown>;
  }
  private isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === 'object' && !Array.isArray(value)); }
  private text(value: unknown): string { return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : ''; }
}

class ConflictError extends ServiceUnavailableException {}
