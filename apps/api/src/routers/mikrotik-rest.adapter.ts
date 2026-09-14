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
  ipAddress: string;
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
    if (typeof first?.['.id'] === 'string') {
      const remoteId = first['.id'];
      await this.request(baseUrl, credentials, `queue/simple/${encodeURIComponent(remoteId)}`, {
        method: 'PATCH',
        body: queue,
        timeoutMs,
      });
      return { ok: true, action: 'updated' as const, remotePolicyId: remoteId };
    }

    const created = await this.request(baseUrl, credentials, 'queue/simple', {
      method: 'PUT',
      body: queue,
      timeoutMs,
    });
    const createdRecord = isRecord(created) ? created : null;
    return { ok: true, action: 'created' as const, remotePolicyId: typeof createdRecord?.['.id'] === 'string' ? createdRecord['.id'] : null };
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
      if (!response.ok) {
        throw Object.assign(new Error(`RouterOS request failed with HTTP ${response.status}`), {
          code: `HTTP_${response.status}`,
          status: response.status,
        });
      }
      return data;
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw Object.assign(new Error('RouterOS request timed out'), { code: 'TIMEOUT' });
      }
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
  try {
    return JSON.parse(text);
  } catch {
    throw Object.assign(new Error('RouterOS returned invalid JSON'), { code: 'INVALID_ROUTER_RESPONSE' });
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorCode(error: unknown) {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'NETWORK_ERROR';
}
