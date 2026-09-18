import { Injectable } from '@nestjs/common';
import { isIP } from 'node:net';
import { NetworkCredentials } from '../common/secure-network-credentials';

const DEFAULT_TIMEOUT_MS = 10_000;
type JsonRecord = Record<string, unknown>;

export interface MikrotikPolicy {
  planId: string;
  bandwidth: { downloadKbps: number | null; uploadKbps: number | null };
}

export interface MikrotikClient {
  ipAddress?: string;
  username?: string;
  macAddress?: string;
}

export interface MikrotikPolicyVerification {
  verified: boolean;
  remotePolicyId: string;
  expectedMaxLimit: string;
  actualMaxLimit?: string;
  actualTarget?: string;
  reason?: string;
}

export interface MikrotikDisconnectVerification {
  verified: boolean;
  remainingMatches: number;
  reason?: string;
}

@Injectable()
export class MikrotikRestAdapter {
  async health(baseUrl: string, credentials: NetworkCredentials, timeoutMs = DEFAULT_TIMEOUT_MS) {
    try {
      const resource = await this.request(baseUrl, credentials, 'system/resource', { timeoutMs });
      const first = Array.isArray(resource) && isRecord(resource[0]) ? resource[0] : null;
      return { ok: true as const, status: 'online', version: typeof first?.version === 'string' ? first.version : null };
    } catch (error: unknown) {
      return { ok: false as const, status: 'offline', code: errorCode(error) };
    }
  }

  async enforcePolicy(
    baseUrl: string,
    credentials: NetworkCredentials,
    client: MikrotikClient,
    policy: MikrotikPolicy,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {
    if (!client.ipAddress) throw new TypeError('client.ipAddress is required for bandwidth enforcement');
    const ip = normalizeIp(client.ipAddress);
    const upload = rate(policy.bandwidth.uploadKbps, 'uploadKbps');
    const download = rate(policy.bandwidth.downloadKbps, 'downloadKbps');
    if (upload === '0' && download === '0') {
      throw Object.assign(new Error('A bandwidth policy must define uploadKbps or downloadKbps'), { code: 'BANDWIDTH_POLICY_EMPTY' });
    }

    const queueName = queueNameForIp(ip);
    const queue = {
      name: queueName,
      target: targetForIp(ip),
      'max-limit': `${upload}/${download}`,
      comment: `Jaslyn Net ${policy.planId}`,
    };

    const existing = await this.request(baseUrl, credentials, `queue/simple?name=${encodeURIComponent(queueName)}`, { timeoutMs });
    const first = Array.isArray(existing) && isRecord(existing[0]) ? existing[0] : null;
    let remotePolicyId: string;
    let action: 'created' | 'updated';

    if (typeof first?.['.id'] === 'string') {
      remotePolicyId = first['.id'];
      action = 'updated';
      await this.request(baseUrl, credentials, `queue/simple/${encodeURIComponent(remotePolicyId)}`, {
        method: 'PATCH', body: queue, timeoutMs,
      });
    } else {
      action = 'created';
      const created = await this.request(baseUrl, credentials, 'queue/simple', {
        method: 'PUT', body: queue, timeoutMs,
      });
      const createdRecord = isRecord(created) ? created : null;
      if (typeof createdRecord?.['.id'] !== 'string') {
        throw Object.assign(new Error('Router did not return a remote policy id'), { code: 'REMOTE_POLICY_ID_MISSING' });
      }
      remotePolicyId = createdRecord['.id'];
    }

    const verification = await this.verifyPolicy(baseUrl, credentials, queueName, remotePolicyId, queue, timeoutMs);
    if (!verification.verified) {
      throw Object.assign(
        new Error(`MikroTik policy verification failed: ${verification.reason ?? 'remote state mismatch'}`),
        { code: 'POLICY_VERIFICATION_FAILED', verification },
      );
    }

    return { ok: true as const, verified: true as const, action, remotePolicyId, verification };
  }

  async disconnectClient(
    baseUrl: string,
    credentials: NetworkCredentials,
    client: MikrotikClient,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {
    const identity = normalizeClient(client);
    const removed: Array<{ service: 'hotspot' | 'ppp'; id: string }> = [];

    const hotspot = await this.request(baseUrl, credentials, 'ip/hotspot/active', { timeoutMs });
    if (Array.isArray(hotspot)) {
      for (const row of hotspot.filter(isRecord).filter((entry) => matchesClient(entry, identity))) {
        if (typeof row['.id'] === 'string') {
          await this.request(baseUrl, credentials, `ip/hotspot/active/${encodeURIComponent(row['.id'])}`, { method: 'DELETE', timeoutMs });
          removed.push({ service: 'hotspot', id: row['.id'] });
        }
      }
    }

    const ppp = await this.request(baseUrl, credentials, 'ppp/active', { timeoutMs });
    if (Array.isArray(ppp)) {
      for (const row of ppp.filter(isRecord).filter((entry) => matchesClient(entry, identity))) {
        if (typeof row['.id'] === 'string') {
          await this.request(baseUrl, credentials, `ppp/active/${encodeURIComponent(row['.id'])}`, { method: 'DELETE', timeoutMs });
          removed.push({ service: 'ppp', id: row['.id'] });
        }
      }
    }

    const verification = await this.verifyDisconnected(baseUrl, credentials, identity, timeoutMs);
    if (!verification.verified) {
      throw Object.assign(
        new Error(`MikroTik disconnect verification failed: ${verification.reason ?? 'session remains active'}`),
        { code: 'DISCONNECT_VERIFICATION_FAILED', verification },
      );
    }

    return { ok: true as const, disconnected: removed.length > 0, verified: true as const, removed, verification };
  }

  private async verifyPolicy(
    baseUrl: string,
    credentials: NetworkCredentials,
    queueName: string,
    remotePolicyId: string,
    expected: JsonRecord,
    timeoutMs: number,
  ): Promise<MikrotikPolicyVerification> {
    try {
      const current = await this.request(baseUrl, credentials, `queue/simple?name=${encodeURIComponent(queueName)}`, { timeoutMs });
      const rows = Array.isArray(current) ? current.filter(isRecord) : [];
      const remote = rows.find((row) => row['.id'] === remotePolicyId);
      const expectedMaxLimit = String(expected['max-limit']);
      if (!remote) return { verified: false, remotePolicyId, expectedMaxLimit, reason: 'Remote queue was not found after policy write' };
      const actualMaxLimit = typeof remote['max-limit'] === 'string' ? remote['max-limit'] : undefined;
      const actualTarget = typeof remote.target === 'string' ? remote.target : undefined;
      const verified = actualMaxLimit === expectedMaxLimit && actualTarget === expected.target;
      return {
        verified, remotePolicyId, expectedMaxLimit, actualMaxLimit, actualTarget,
        reason: verified ? undefined : 'Remote queue does not match the requested policy',
      };
    } catch (error: unknown) {
      return { verified: false, remotePolicyId, expectedMaxLimit: String(expected['max-limit']), reason: `Verification request failed: ${errorCode(error)}` };
    }
  }

  private async verifyDisconnected(
    baseUrl: string,
    credentials: NetworkCredentials,
    client: ReturnType<typeof normalizeClient>,
    timeoutMs: number,
  ): Promise<MikrotikDisconnectVerification> {
    try {
      const [hotspot, ppp] = await Promise.all([
        this.request(baseUrl, credentials, 'ip/hotspot/active', { timeoutMs }),
        this.request(baseUrl, credentials, 'ppp/active', { timeoutMs }),
      ]);
      const remainingMatches = [...(Array.isArray(hotspot) ? hotspot : []), ...(Array.isArray(ppp) ? ppp : [])]
        .filter(isRecord)
        .filter((entry) => matchesClient(entry, client)).length;
      return {
        verified: remainingMatches === 0,
        remainingMatches,
        reason: remainingMatches === 0 ? undefined : 'Matching active session remains after disconnect',
      };
    } catch (error: unknown) {
      return { verified: false, remainingMatches: -1, reason: `Verification request failed: ${errorCode(error)}` };
    }
  }

  private async request(
    baseUrl: string,
    credentials: NetworkCredentials,
    path: string,
    options: { method?: string; body?: unknown; timeoutMs: number },
  ): Promise<unknown> {
    const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
    const username = requireCredential(credentials.username, 'username');
    if (credentials.password == null) throw new TypeError('password is required');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetch(`${normalizedBaseUrl}/rest/${path.replace(/^\/+/, '')}`, {
        method: options.method ?? 'GET',
        headers: {
          accept: 'application/json',
          authorization: `Basic ${Buffer.from(`${username}:${credentials.password}`, 'utf8').toString('base64')}`,
          ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });
      const text = await response.text();
      const data = text ? parseJson(text) : null;
      if (!response.ok) throw Object.assign(new Error(`RouterOS request failed with HTTP ${response.status}`), { code: `HTTP_${response.status}`, status: response.status });
      return data;
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') throw Object.assign(new Error('RouterOS request timed out'), { code: 'TIMEOUT' });
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

function normalizeBaseUrl(value: string) {
  const raw = requireCredential(value, 'baseUrl').replace(/\/+$/, '');
  const url = new URL(raw);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new TypeError('baseUrl must use http or https');
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

function requireCredential(value: string | undefined, field: string) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new TypeError(`${field} is required`);
  return normalized;
}

function normalizeIp(value: string) {
  const normalized = String(value ?? '').trim();
  if (!normalized || isIP(normalized) === 0) throw new TypeError('client.ipAddress must be a valid IPv4 or IPv6 address');
  return normalized;
}

function normalizeClient(client: MikrotikClient) {
  return {
    ipAddress: client.ipAddress?.trim() || undefined,
    username: client.username?.trim() || undefined,
    macAddress: client.macAddress?.trim().toLowerCase() || undefined,
  };
}

function matchesClient(row: JsonRecord, client: ReturnType<typeof normalizeClient>) {
  const address = typeof row.address === 'string' ? row.address : undefined;
  const name = typeof row.name === 'string' ? row.name : undefined;
  const user = typeof row.user === 'string' ? row.user : undefined;
  const mac = typeof row['mac-address'] === 'string' ? row['mac-address'].toLowerCase() : undefined;
  return Boolean((client.ipAddress && address === client.ipAddress) || (client.username && (name === client.username || user === client.username)) || (client.macAddress && mac === client.macAddress));
}

function targetForIp(ip: string) {
  return `${ip}/${isIP(ip) === 6 ? 128 : 32}`;
}

function queueNameForIp(ip: string) {
  return `jaslyn-${ip.replace(/[^0-9a-f:.]/gi, '-').replace(/:+/g, '-')}`.slice(0, 63);
}

function rate(value: number | null, field: string) {
  if (value == null) return '0';
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${field} must be a positive integer`);
  return `${value}k`;
}

function parseJson(text: string): unknown {
  try { return JSON.parse(text); }
  catch { throw Object.assign(new Error('RouterOS returned invalid JSON'), { code: 'INVALID_ROUTER_RESPONSE' }); }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorCode(error: unknown) {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'NETWORK_ERROR';
}
