import { BadRequestException } from '@nestjs/common';
import { NetworkCredentials } from '../../common/secure-network-credentials';
import { NetworkManagementProtocol } from '../../routers/routers.dto';
import { LoadBalanceDecision } from './load-balancing.types';
import { WanRoutingAdapter, WanRoutingApplyResult, WanRoutingTarget } from './load-balancing.adapter';

const DEFAULT_TIMEOUT_MS = 10_000;
const ROUTE_COMMENT_PREFIX = 'jaslyn-net:lb:';

type JsonRecord = Record<string, unknown>;

/**
 * RouterOS REST adapter for the subset Jaslyn Net can safely verify today.
 * PRIMARY_SECONDARY is implemented with Jaslyn-owned default routes and
 * explicit route distances. Weighted/PCC distribution is intentionally not
 * synthesized from equal-cost routes because equal-cost RouterOS routing is
 * not equivalent to an arbitrary percentage split.
 */
export class MikrotikWanRoutingAdapter implements WanRoutingAdapter {
  readonly protocol = NetworkManagementProtocol.MIKROTIK_REST;

  constructor(
    private readonly baseUrl: string,
    private readonly credentials: NetworkCredentials,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  capabilities(): string[] {
    return ['wan_telemetry', 'gateway_health', 'failover', 'route_read', 'route_write'];
  }

  async readWanState(_routerId: string): Promise<unknown> {
    const [interfaces, addresses, routes] = await Promise.all([
      this.request('interface', { method: 'GET' }),
      this.request('ip/address', { method: 'GET' }),
      this.request('ip/route', { method: 'GET' }),
    ]);
    return { interfaces, addresses, routes };
  }

  async applyLoadBalanceDecision(
    _routerId: string,
    decision: LoadBalanceDecision,
    targets: WanRoutingTarget[],
  ): Promise<WanRoutingApplyResult> {
    if (decision.strategy !== 'PRIMARY_SECONDARY') {
      return {
        applied: false,
        verified: false,
        protocol: this.protocol,
        reason: 'MikroTik adapter currently supports verified PRIMARY_SECONDARY route failover only; weighted/PCC distribution requires explicit routing-policy configuration.',
      };
    }

    const eligibleIds = new Set(decision.eligibleMembers.map((member) => member.wanConnectionId));
    const ordered = [...targets].sort((a, b) => a.priority - b.priority);
    if (!ordered.length) throw new BadRequestException('At least one WAN routing target is required');
    if (ordered.some((target) => !target.gateway)) throw new BadRequestException('PRIMARY_SECONDARY MikroTik routing requires a gateway for every target');

    const managedRoutes = await this.findManagedRoutes(decision.policyId);
    const existingByWan = new Map<string, JsonRecord>();
    for (const route of managedRoutes) {
      const wanId = route.comment && typeof route.comment === 'string' ? route.comment.slice(ROUTE_COMMENT_PREFIX.length).split(':')[1] : undefined;
      if (wanId) existingByWan.set(wanId, route);
    }

    for (const [index, target] of ordered.entries()) {
      const payload = {
        'dst-address': '0.0.0.0/0',
        gateway: target.gateway,
        distance: Math.max(1, index + 1),
        'check-gateway': 'ping',
        disabled: !eligibleIds.has(target.wanConnectionId),
        comment: `${ROUTE_COMMENT_PREFIX}${decision.policyId}:${target.wanConnectionId}`,
      };
      const current = existingByWan.get(target.wanConnectionId);
      if (current && typeof current['.id'] === 'string') {
        await this.request(`ip/route/${encodeURIComponent(current['.id'])}`, { method: 'PATCH', body: payload });
      } else {
        await this.request('ip/route', { method: 'PUT', body: payload });
      }
    }

    for (const [wanId, route] of existingByWan.entries()) {
      if (!ordered.some((target) => target.wanConnectionId === wanId) && typeof route['.id'] === 'string') {
        await this.request(`ip/route/${encodeURIComponent(route['.id'])}`, {
          method: 'PATCH',
          body: { disabled: true },
        });
      }
    }

    const verification = await this.verifyLoadBalanceDecision(_routerId, decision, ordered);
    return {
      applied: true,
      verified: verification.verified,
      protocol: this.protocol,
      remoteState: verification.remoteState,
      reason: verification.reason,
    };
  }

  async verifyLoadBalanceDecision(
    _routerId: string,
    decision: LoadBalanceDecision,
    targets: WanRoutingTarget[],
  ): Promise<WanRoutingApplyResult> {
    if (decision.strategy !== 'PRIMARY_SECONDARY') {
      return { applied: false, verified: false, protocol: this.protocol, reason: 'Only PRIMARY_SECONDARY verification is implemented for MikroTik.' };
    }
    const routes = await this.findManagedRoutes(decision.policyId);
    const eligibleIds = new Set(decision.eligibleMembers.map((member) => member.wanConnectionId));
    const expected = new Map(targets.map((target, index) => [target.wanConnectionId, {
      gateway: target.gateway,
      distance: Math.max(1, index + 1),
      disabled: !eligibleIds.has(target.wanConnectionId),
    }]));

    const actual = routes.map((route) => ({
      id: route['.id'],
      comment: route.comment,
      gateway: route.gateway,
      distance: Number(route.distance),
      disabled: route.disabled === true || route.disabled === 'true',
    }));

    const verified = [...expected.entries()].every(([wanId, expectedRoute]) => {
      const route = actual.find((candidate) => candidate.comment === `${ROUTE_COMMENT_PREFIX}${decision.policyId}:${wanId}`);
      return Boolean(route && route.gateway === expectedRoute.gateway && route.distance === expectedRoute.distance && route.disabled === expectedRoute.disabled);
    });

    return {
      applied: true,
      verified,
      protocol: this.protocol,
      remoteState: actual,
      reason: verified ? undefined : 'Managed RouterOS routes do not match the requested primary/secondary decision.',
    };
  }

  private async findManagedRoutes(policyId: string): Promise<JsonRecord[]> {
    const result = await this.request(`ip/route?comment=${encodeURIComponent(ROUTE_COMMENT_PREFIX + policyId)}`, { method: 'GET' });
    return Array.isArray(result) ? result.filter(isRecord) : [];
  }

  private async request(path: string, options: { method: string; body?: unknown }): Promise<unknown> {
    const normalizedBaseUrl = normalizeBaseUrl(this.baseUrl);
    const username = requireCredential(this.credentials.username, 'username');
    if (this.credentials.password == null) throw new TypeError('password is required');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${normalizedBaseUrl}/rest/${path.replace(/^\/+/, '')}`, {
        method: options.method,
        headers: {
          accept: 'application/json',
          authorization: `Basic ${Buffer.from(`${username}:${this.credentials.password}`, 'utf8').toString('base64')}`,
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

function parseJson(text: string): unknown {
  try { return JSON.parse(text); }
  catch { throw Object.assign(new Error('RouterOS returned invalid JSON'), { code: 'INVALID_ROUTER_RESPONSE' }); }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
