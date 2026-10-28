import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EVENT_CATALOG, normalizeEvent, resolveRuleEventType } from './automation.catalog';
import { evaluateCondition, evaluateConditions, isSafePath, valueAt } from './automation.conditions';
import { ActionTimeoutError, classifyError, computeBackoffMs, NonRetryableError } from './automation.retry';
import { definitionHash, normalizeRule } from './automation.rules';
import { commandTextFor } from './automation.policy';

const REQUIRED_EVENTS = ['device.offline', 'device.recovered', 'subscriber.auth_failed', 'session.started', 'session.ended', 'bandwidth.threshold',
  'payment.completed', 'payment.failed', 'entitlement.expired', 'incident.created', 'incident.resolved', 'provider.degraded'];

describe('event catalog', () => {
  it('defines every required canonical event exactly once', () => {
    const names = EVENT_CATALOG.map((e) => e.canonical);
    expect([...names].sort()).toEqual([...REQUIRED_EVENTS].sort());
  });
  it('maps each raw type to exactly one canonical event (no double-firing)', () => {
    const raws = EVENT_CATALOG.flatMap((e) => e.rawTypes);
    expect(new Set(raws).size).toBe(raws.length);
  });
  it('treats SESSION.ENDED and RADIUS.SESSION_STOPPED as session.ended', () => {
    expect(normalizeEvent('SESSION.ENDED', { sessionId: 's1', routerId: 'r1' }).canonical).toBe('session.ended');
    expect(normalizeEvent('RADIUS.SESSION_STOPPED', { sessionId: 'a1' }).canonical).toBe('session.ended');
  });
  it('drops payload fields that are not in the catalog (e.g. provider payloads)', () => {
    const n = normalizeEvent('PAYMENT.COMPLETED', { paymentId: 'p1', amount: 5, providerPayload: { card: '4242' }, raw_payload: {} });
    expect(n.payload).toEqual(expect.objectContaining({ paymentId: 'p1', amount: 5 }));
    expect(n.payload).not.toHaveProperty('providerPayload');
    expect(n.subject).toBe('p1');
  });
  it('exposes no payload for non-catalog (legacy) events', () => {
    const n = normalizeEvent('PAYMENT.WEBHOOK_RECEIVED', { providerPayload: { secret: 'x' } });
    expect(n.canonical).toBeNull();
    expect(n.payload).toEqual({});
  });
  it('resolves rule event types: canonical, alias, legacy and invalid', () => {
    expect(resolveRuleEventType('Device.Offline')).toEqual({ stored: 'device.offline', canonical: 'device.offline', legacy: false });
    expect(resolveRuleEventType('SESSION.ENDED')?.canonical).toBe('session.ended');
    expect(resolveRuleEventType('VOUCHER.REDEEMED')).toEqual({ stored: 'VOUCHER.REDEEMED', canonical: null, legacy: true });
    expect(resolveRuleEventType('*')?.legacy).toBe(true);
    expect(resolveRuleEventType('not an event')).toBeNull();
  });
});

describe('conditions', () => {
  it('rejects prototype traversal paths', () => {
    expect(isSafePath('a.b')).toBe(true);
    expect(isSafePath('__proto__.x')).toBe(false);
    expect(isSafePath('constructor')).toBe(false);
  });
  it('does not read inherited properties', () => expect(valueAt({}, 'toString')).toEqual({ exists: false, value: undefined }));
  it('does not coerce null, empty string or booleans to numbers', () => {
    for (const v of [null, '', true, false, [], {}]) expect(evaluateCondition({ x: v }, { path: 'x', op: 'lte', value: 5 })).toBe(false);
    expect(evaluateCondition({ x: '3' }, { path: 'x', op: 'lte', value: 5 })).toBe(true);
    expect(evaluateCondition({ x: 7 }, { path: 'x', op: 'gt', value: 5 })).toBe(true);
  });
  it('requires all conditions (AND) and an empty list matches', () => {
    expect(evaluateConditions({ a: 1, b: 2 }, [{ path: 'a', op: 'eq', value: 1 }, { path: 'b', op: 'eq', value: 3 }]).matched).toBe(false);
    expect(evaluateConditions({}, []).matched).toBe(true);
  });
});

describe('retry policy', () => {
  it('backoff grows exponentially, is capped and jitters within +/-20%', () => {
    const mid = () => 0.5;
    expect(computeBackoffMs(1, { random: mid })).toBe(15000);
    expect(computeBackoffMs(2, { random: mid })).toBe(30000);
    expect(computeBackoffMs(20, { random: mid })).toBe(900000);
    expect(computeBackoffMs(1, { random: () => 0 })).toBe(12000);
    expect(computeBackoffMs(1, { random: () => 1 })).toBe(18000);
  });
  it('classifies errors: 4xx and integrity errors are final; 5xx, timeouts, network and unknown retry', () => {
    expect(classifyError(new BadRequestException('x')).retryable).toBe(false);
    expect(classifyError(new ForbiddenException('x')).retryable).toBe(false);
    expect(classifyError(new NotFoundException('x')).retryable).toBe(false);
    expect(classifyError(new NonRetryableError('X', 'x')).retryable).toBe(false);
    expect(classifyError(Object.assign(new Error('dup'), { code: '23505' })).retryable).toBe(false);
    expect(classifyError(new ActionTimeoutError(1000))).toMatchObject({ retryable: true, timeout: true, code: 'TIMEOUT' });
    expect(classifyError(Object.assign(new Error('reset'), { code: 'ECONNRESET' })).retryable).toBe(true);
    expect(classifyError(Object.assign(new Error('deadlock'), { code: '40P01' })).retryable).toBe(true);
    expect(classifyError(new Error('boom')).retryable).toBe(true);
  });
});

describe('rule validation', () => {
  const alert = { type: 'CREATE_ALERT', title: 'Router down' };
  const kill = { type: 'TERMINATE_SESSION' };
  const base = { eventType: 'device.offline', conditions: [], actions: [alert] };

  it('applies safe defaults', () => {
    const r = normalizeRule(base);
    expect(r).toMatchObject({ maxAttempts: 3, timeoutMs: 15000, maxConcurrency: 2, cooldownSeconds: 0, autonomy: 'APPROVAL_REQUIRED', hasDestructive: false });
  });
  it('rejects unknown actions, unsafe paths and a second CREATE_ALERT', () => {
    expect(() => normalizeRule({ ...base, actions: [{ type: 'RUN_SHELL' }] })).toThrow(BadRequestException);
    expect(() => normalizeRule({ ...base, conditions: [{ path: '__proto__.x', op: 'eq', value: 1 }] })).toThrow(BadRequestException);
    expect(() => normalizeRule({ ...base, actions: [alert, alert] })).toThrow(BadRequestException);
  });
  it.each([['maxAttempts', 6], ['maxAttempts', 0], ['timeoutMs', 999], ['timeoutMs', 120001], ['maxConcurrency', 11], ['cooldownSeconds', -1]])('bounds %s=%s', (k, v) => {
    expect(() => normalizeRule({ ...base, [k]: v })).toThrow(BadRequestException);
  });
  it('requires a catalogued event, a default cooldown and a targetable payload for destructive rules', () => {
    expect(() => normalizeRule({ eventType: '*', conditions: [], actions: [kill] })).toThrow(/specific catalogued/);
    expect(() => normalizeRule({ eventType: 'VOUCHER.REDEEMED', conditions: [], actions: [kill] })).toThrow(/specific catalogued/);
    expect(() => normalizeRule({ eventType: 'device.offline', conditions: [], actions: [kill] })).toThrow(/does not carry/);
    expect(() => normalizeRule({ eventType: 'session.started', conditions: [], actions: [kill], cooldownSeconds: 10 })).toThrow(/cooldown/);
    const ok = normalizeRule({ eventType: 'session.started', conditions: [], actions: [kill] });
    expect(ok.cooldownSeconds).toBe(60);
    expect(ok.requiredPermissions).toContain('sessions.revoke');
  });
  it('rejects unknown extra permissions and non-uuid scope', () => {
    expect(() => normalizeRule({ ...base, extraPermissions: ['nope.nope'] })).toThrow(BadRequestException);
    expect(() => normalizeRule({ ...base, scope: { routerIds: ['x'] } })).toThrow(BadRequestException);
  });
  it('definition hash is stable under key order and changes when behavior changes', () => {
    const a = normalizeRule({ ...base, conditions: [{ path: 'routerId', op: 'exists' }] });
    const b = normalizeRule({ ...base, conditions: [{ op: 'exists', path: 'routerId' }] });
    expect(definitionHash(a)).toBe(definitionHash(b));
    expect(definitionHash(normalizeRule({ ...base, cooldownSeconds: 5 }))).not.toBe(definitionHash(a));
    expect(definitionHash(normalizeRule({ ...base, autonomy: 'AUTO' }))).not.toBe(definitionHash(a));
  });
  it('builds the same command text an operator would type', () => {
    expect(commandTextFor({ actionType: 'TERMINATE_SESSION', action: { sessionIdPath: 'sessionId' }, payload: { sessionId: 'abc' } })).toBe('terminate session abc');
    expect(commandTextFor({ actionType: 'TERMINATE_SESSION', action: {}, payload: {} })).toBeNull();
    expect(commandTextFor({ actionType: 'CREATE_ALERT', action: {}, payload: {} })).toBeNull();
  });
});
