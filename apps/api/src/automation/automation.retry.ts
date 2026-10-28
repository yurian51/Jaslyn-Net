import { HttpException } from '@nestjs/common';

export const MAX_ATTEMPTS_CAP = 5;
export const MAX_REQUEUES = 3;

/** Thrown by executors when the desired state already holds (target gone, already done). Job succeeds as a no-op. */
export class ActionNoopError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'ActionNoopError'; }
}
/** Thrown for failures that retrying cannot fix. Goes straight to the dead-letter queue. */
export class NonRetryableError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'NonRetryableError'; }
}
export class ActionTimeoutError extends Error {
  constructor(ms: number) { super(`Action exceeded its ${ms}ms timeout`); this.name = 'ActionTimeoutError'; }
}

export interface ErrorClassification { retryable: boolean; code: string; message: string; timeout: boolean }

const TRANSIENT_NET = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'EPIPE', 'ENOTFOUND']);

export function classifyError(error: unknown): ErrorClassification {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
  if (error instanceof ActionTimeoutError) return { retryable: true, code: 'TIMEOUT', message, timeout: true };
  if (error instanceof NonRetryableError) return { retryable: false, code: error.code, message, timeout: false };
  if (error instanceof HttpException) {
    const status = error.getStatus();
    return { retryable: status >= 500, code: `HTTP_${status}`, message, timeout: false };
  }
  const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : '';
  if (TRANSIENT_NET.has(code)) return { retryable: true, code, message, timeout: false };
  if (/^(08|40|53|57)/.test(code) || code === '40001' || code === '40P01') return { retryable: true, code: `PG_${code}`, message, timeout: false };
  if (/^(22|23|42)/.test(code)) return { retryable: false, code: `PG_${code}`, message, timeout: false };
  // Unknown errors are retried, but only up to max_attempts (enforced by the database as well).
  return { retryable: true, code: code || 'UNKNOWN', message, timeout: false };
}

/** Exponential backoff with +/-20% jitter. attempt is 1-based (the attempt that just failed). */
export function computeBackoffMs(attempt: number, opts: { baseMs?: number; capMs?: number; jitter?: number; random?: () => number } = {}): number {
  const base = opts.baseMs ?? 15_000, cap = opts.capMs ?? 900_000, jitter = opts.jitter ?? 0.2, rnd = opts.random ?? Math.random;
  const exp = Math.min(cap, base * Math.pow(2, Math.max(0, attempt - 1)));
  return Math.round(exp * (1 - jitter + rnd() * 2 * jitter));
}
