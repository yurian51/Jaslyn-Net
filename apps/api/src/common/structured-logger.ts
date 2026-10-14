import type { LoggerService } from '@nestjs/common';

export type JaslynLogLevel = 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

const ORDER: Record<JaslynLogLevel, number> = {
  TRACE: 10, DEBUG: 20, INFO: 30, WARN: 40, ERROR: 50, FATAL: 60,
};
const SECRET_KEY = /password|passwd|secret|token|api[-_]?key|authorization|cookie|credential|private[-_]?key/i;
const REDACTED = '[REDACTED]';

function safeValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[TRUNCATED]';
  if (typeof value === 'string') {
    return value
      .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/-]+=*/gi, '$1 [REDACTED]')
      .replace(/([?&](?:token|access_token|refresh_token|api_key|password|secret)=)[^&\s]*/gi, '$1[REDACTED]')
      .slice(0, 4000);
  }
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => safeValue(item, depth + 1));
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>).slice(0, 100)) {
      result[key] = SECRET_KEY.test(key) ? REDACTED : safeValue(child, depth + 1);
    }
    return result;
  }
  return String(value);
}

function messageText(message: unknown): string {
  if (typeof message === 'string') return message;
  try { return JSON.stringify(safeValue(message)); } catch { return '[Unserializable log message]'; }
}

/** JSON-lines logger for consistent application and framework logs. */
export class StructuredLogger implements LoggerService {
  private readonly threshold: number;
  private readonly environment: string;

  constructor(level = process.env.LOG_LEVEL, environment = process.env.NODE_ENV) {
    const normalized = String(level ?? (environment === 'production' ? 'INFO' : 'DEBUG')).trim().toUpperCase();
    this.threshold = ORDER[normalized as JaslynLogLevel] ?? ORDER.INFO;
    this.environment = environment ?? 'development';
  }

  log(message: unknown, ...optionalParams: unknown[]) { this.write('INFO', message, optionalParams); }
  warn(message: unknown, ...optionalParams: unknown[]) { this.write('WARN', message, optionalParams); }
  error(message: unknown, ...optionalParams: unknown[]) { this.write('ERROR', message, optionalParams); }
  debug(message: unknown, ...optionalParams: unknown[]) { this.write('DEBUG', message, optionalParams); }
  verbose(message: unknown, ...optionalParams: unknown[]) { this.write('TRACE', message, optionalParams); }
  fatal(message: unknown, ...optionalParams: unknown[]) { this.write('FATAL', message, optionalParams); }

  private write(level: JaslynLogLevel, message: unknown, optionalParams: unknown[]) {
    if (ORDER[level] < this.threshold) return;
    const context = optionalParams.find((item) => typeof item === 'string' && item.length > 0);
    const stack = level === 'ERROR' || level === 'FATAL'
      ? optionalParams.find((item) => typeof item === 'string' && item.includes('\n'))
      : undefined;
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      environment: this.environment,
      message: messageText(message),
      ...(context ? { context: safeValue(context) } : {}),
      ...(stack ? { stack: messageText(stack) } : {}),
    };
    const line = `${JSON.stringify(entry)}\n`;
    (level === 'ERROR' || level === 'FATAL' ? process.stderr : process.stdout).write(line);
  }
}
