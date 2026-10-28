export type Condition = { path: string; op: string; value?: unknown };
export const CONDITION_OPS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'exists'] as const;
export const UNSAFE_PATH_PARTS = ['__proto__', 'prototype', 'constructor'];

export function isSafePath(path: string): boolean {
  return /^[A-Za-z0-9_.-]{1,120}$/.test(path) && !path.split('.').some((p) => UNSAFE_PATH_PARTS.includes(p));
}

export function valueAt(payload: Record<string, unknown>, path: string): { exists: boolean; value: unknown } {
  let current: unknown = payload;
  for (const part of path.split('.')) {
    if (!current || typeof current !== 'object' || Array.isArray(current) || !Object.prototype.hasOwnProperty.call(current, part)) return { exists: false, value: undefined };
    current = (current as Record<string, unknown>)[part];
  }
  return { exists: true, value: current };
}

/** Strict numeric coercion: numbers and non-empty numeric strings only (null/''/booleans are NOT 0/1). */
function num(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') return Number(v);
  return NaN;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function evaluateCondition(payload: Record<string, unknown>, c: Condition): boolean {
  const actual = valueAt(payload, c.path);
  switch (c.op) {
    case 'exists': return actual.exists === (c.value !== false);
    case 'eq': return actual.exists && same(actual.value, c.value);
    case 'neq': return !actual.exists || !same(actual.value, c.value);
    case 'gt': return actual.exists && num(actual.value) > num(c.value);
    case 'gte': return actual.exists && num(actual.value) >= num(c.value);
    case 'lt': return actual.exists && num(actual.value) < num(c.value);
    case 'lte': return actual.exists && num(actual.value) <= num(c.value);
    case 'contains':
      return actual.exists && (Array.isArray(actual.value) ? actual.value.some((v) => same(v, c.value)) : typeof actual.value === 'string' && actual.value.includes(String(c.value)));
    default: return false;
  }
}

export function evaluateConditions(payload: Record<string, unknown>, conditions: Condition[]) {
  const results = conditions.map((c) => ({ path: c.path, op: c.op, matched: evaluateCondition(payload, c) }));
  return { matched: results.every((r) => r.matched), results };
}
