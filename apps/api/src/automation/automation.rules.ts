import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { KNOWN_PERMISSIONS } from '../auth/permission-resolver';
import { Condition, CONDITION_OPS, isSafePath } from './automation.conditions';
import { getActionDefinition, getEventDefinition, resolveRuleEventType, RiskClass } from './automation.catalog';

export interface NormalizedAction {
  type: string;
  risk: RiskClass;
  severity?: string; title?: string;
  eventType?: string;
  sessionIdPath?: string;
}
export interface NormalizedRule {
  eventType: string;
  canonicalEvent: string | null;
  conditions: Condition[];
  actions: NormalizedAction[];
  scope: { locationIds: string[]; routerIds: string[] };
  cooldownSeconds: number;
  cooldownScope: 'RULE' | 'SUBJECT';
  maxAttempts: number;
  timeoutMs: number;
  maxConcurrency: number;
  extraPermissions: string[];
  autonomy: 'APPROVAL_REQUIRED' | 'AUTO';
  hasDestructive: boolean;
  /** Permissions the author/run-as user must hold: each action's + extraPermissions. */
  requiredPermissions: string[];
}

export interface RuleInput {
  eventType: string; conditions: unknown[]; actions: unknown[];
  scope?: unknown; cooldownSeconds?: number; cooldownScope?: string; maxAttempts?: number; timeoutMs?: number;
  maxConcurrency?: number; extraPermissions?: string[]; autonomy?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const DESTRUCTIVE_MIN_COOLDOWN_SECONDS = 60;

function intIn(value: unknown, def: number, min: number, max: number, label: string): number {
  if (value === undefined || value === null) return def;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new BadRequestException(`${label} must be an integer between ${min} and ${max}`);
  return n;
}
function uuidList(raw: unknown, label: string): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > 50) throw new BadRequestException(`${label} must be an array of at most 50 ids`);
  const out = raw.map((v) => String(v).toLowerCase());
  if (out.some((v) => !UUID.test(v))) throw new BadRequestException(`${label} must contain UUIDs`);
  return [...new Set(out)];
}

/** Pure validation. Performs no I/O so it always runs before any database access. */
export function normalizeRule(input: RuleInput): NormalizedRule {
  const resolved = resolveRuleEventType(String(input.eventType ?? ''));
  if (!resolved) throw new BadRequestException('eventType must be a known event, a legacy UPPERCASE event type, or *');

  const conditions = input.conditions.map((raw): Condition => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new BadRequestException('Each condition must be an object');
    const c = raw as Record<string, unknown>;
    const path = String(c.path ?? ''), op = String(c.op ?? '');
    if (!isSafePath(path)) throw new BadRequestException('Condition path is invalid');
    if (!(CONDITION_OPS as readonly string[]).includes(op)) throw new BadRequestException('Condition operator is unsupported');
    if (op !== 'exists' && !Object.prototype.hasOwnProperty.call(c, 'value')) throw new BadRequestException('Condition value is required');
    return { path, op, value: c.value };
  });

  let alertActions = 0;
  const actions = input.actions.map((raw): NormalizedAction => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new BadRequestException('Each action must be an object');
    const a = raw as Record<string, unknown>;
    const type = String(a.type ?? '');
    const def = getActionDefinition(type);
    if (!def) throw new BadRequestException('Allowed actions are CREATE_ALERT, EMIT_WEBHOOK and TERMINATE_SESSION');
    if (type === 'CREATE_ALERT') {
      alertActions++;
      if (alertActions > 1) throw new BadRequestException('A rule may contain at most one CREATE_ALERT action');
      const severity = String(a.severity ?? 'HIGH').toUpperCase(), title = String(a.title ?? '').trim();
      if (!['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'].includes(severity) || title.length < 3 || title.length > 180) throw new BadRequestException('CREATE_ALERT requires a valid severity and title');
      return { type, risk: def.risk, severity, title };
    }
    if (type === 'EMIT_WEBHOOK') return { type, risk: def.risk };
    const sessionIdPath = String(a.sessionIdPath ?? 'sessionId');
    if (!isSafePath(sessionIdPath)) throw new BadRequestException('TERMINATE_SESSION sessionIdPath is invalid');
    return { type, risk: def.risk, sessionIdPath };
  });
  if (!actions.length) throw new BadRequestException('At least one action is required');
  if (actions.length > 10) throw new BadRequestException('A rule may contain at most 10 actions');

  const hasDestructive = actions.some((a) => a.risk === 'DESTRUCTIVE');
  const cooldownSeconds = intIn(input.cooldownSeconds, hasDestructive ? DESTRUCTIVE_MIN_COOLDOWN_SECONDS : 0, 0, 604800, 'cooldownSeconds');
  const cooldownScope = String(input.cooldownScope ?? 'SUBJECT').toUpperCase();
  if (cooldownScope !== 'RULE' && cooldownScope !== 'SUBJECT') throw new BadRequestException('cooldownScope must be RULE or SUBJECT');
  const autonomy = String(input.autonomy ?? 'APPROVAL_REQUIRED').toUpperCase();
  if (autonomy !== 'AUTO' && autonomy !== 'APPROVAL_REQUIRED') throw new BadRequestException('autonomy must be APPROVAL_REQUIRED or AUTO');

  if (hasDestructive) {
    if (!resolved.canonical) throw new BadRequestException('Destructive actions require a specific catalogued event type (not * or a legacy type)');
    if (cooldownSeconds < DESTRUCTIVE_MIN_COOLDOWN_SECONDS) throw new BadRequestException(`Destructive rules require a cooldown of at least ${DESTRUCTIVE_MIN_COOLDOWN_SECONDS}s`);
    const fields = getEventDefinition(resolved.canonical)?.fields ?? [];
    for (const a of actions.filter((x) => x.type === 'TERMINATE_SESSION')) {
      const root = (a.sessionIdPath ?? 'sessionId').split('.')[0];
      if (!fields.includes(root)) throw new BadRequestException(`Event ${resolved.canonical} does not carry "${root}"; TERMINATE_SESSION cannot target it`);
    }
  }

  const extraPermissions = [...new Set((input.extraPermissions ?? []).map(String))];
  if (extraPermissions.length > 10 || extraPermissions.some((p) => !KNOWN_PERMISSIONS.has(p))) throw new BadRequestException('extraPermissions must be at most 10 known permission keys');

  const scopeRaw = input.scope && typeof input.scope === 'object' && !Array.isArray(input.scope) ? input.scope as Record<string, unknown> : {};
  if (input.scope !== undefined && input.scope !== null && scopeRaw !== input.scope) throw new BadRequestException('scope must be an object');
  const scope = { locationIds: uuidList(scopeRaw.locationIds, 'scope.locationIds'), routerIds: uuidList(scopeRaw.routerIds, 'scope.routerIds') };

  const requiredPermissions = [...new Set(['automation.manage', ...actions.map((a) => getActionDefinition(a.type)!.requiredPermission), ...extraPermissions])].sort();
  return {
    eventType: resolved.stored, canonicalEvent: resolved.canonical, conditions, actions, scope, cooldownSeconds,
    cooldownScope: cooldownScope as 'RULE' | 'SUBJECT',
    maxAttempts: intIn(input.maxAttempts, 3, 1, 5, 'maxAttempts'),
    timeoutMs: intIn(input.timeoutMs, 15000, 1000, 120000, 'timeoutMs'),
    maxConcurrency: intIn(input.maxConcurrency, 2, 1, 10, 'maxConcurrency'),
    extraPermissions, autonomy: autonomy as 'APPROVAL_REQUIRED' | 'AUTO', hasDestructive, requiredPermissions,
  };
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value as object).sort().map((k) => [k, stable((value as Record<string, unknown>)[k])]));
  return value;
}

/** Hash of everything that determines what a rule does. Editing any of it invalidates standing approval. */
export function definitionHash(rule: NormalizedRule): string {
  const { eventType, conditions, actions, scope, cooldownSeconds, cooldownScope, maxAttempts, timeoutMs, maxConcurrency, extraPermissions, autonomy } = rule;
  return createHash('sha256').update(JSON.stringify(stable({ eventType, conditions, actions, scope, cooldownSeconds, cooldownScope, maxAttempts, timeoutMs, maxConcurrency, extraPermissions, autonomy }))).digest('hex');
}
