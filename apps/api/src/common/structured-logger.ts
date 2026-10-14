import type { LoggerService } from '@nestjs/common';

export type LogLevel = 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

const LEVELS: Record<LogLevel, number> = {
  TRACE: 10,
  DEBUG: 20,
  INFO: 30,
  WARN: 40,
  ERROR: 50,
  FATAL: 60,
};
const REDACTED = '[REDACTED]';
const SECRET_KEY = /(?:password|passwd|passcode|secret|token|api[-_]?key|access[-_]?token|refresh[-_]?token|credential|authorization|cookie|private[-_]?key)/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[TRUNCATED]';
  if (typeof value === 'string') {
    return value
      .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/-]+=*/gi, '$1 [REDACTED]')
      .replace(/([?&](?:token|access_token|refresh_token|api_key|password|secret)=)[^&\s]*/gi, '$1[REDACTED]');
  }
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redact(item, depth + 1));
  if (value && typeof value === 'object') {
    const safe: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>).slice(0, 200)) {
      safe[key] = SECRET_KEY.test(key) ? REDACTED : redact(child, depth + 1);
    }
    return safe;
  }
  return value;
}

export class StructuredLogger implements LoggerService {
  private readonly threshold: number;
  private readonly environment: string;

  constructor(level?: string, environment?: string) {
    const configured = (level ?? process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'INFO' : 'DEBUG')).toUpperCase();
    this.threshold = LEVELS[configured as LogLevel] ?? LEVELS.INFO;
    this.environment = environment ?? process.env.NODE_ENV ?? 'development';
  }

  trace(message: unknown, context?: string): void { this.write('TRACE', message, context); }
  debug(message: unknown, context?: string): void { this.write('DEBUG', message, context); }
  log(message: unknown, context?: string): void { this.write('INFO', message, context); }
  warn(message: unknown, context?: string): void { this.write('WARN', message, context); }
  fatal(message: unknown, context?: string): void { this.write('FATAL', message, context); }

  error(message: unknown, stackOrContext?: string, context?: string): void {
    const entry = this.asEntry(message);
    if (stackOrContext && context) {
      entry.stack = stackOrContext;
      entry.context = context;
    } else if (stackOrContext) {
      if (stackOrContext.includes('\n') || stackOrContext.startsWith('Error:')) entry.stack = stackOrContext;
      else entry.context = stackOrContext;
    }
    this.emit('ERROR', entry);
  }

  private write(level: LogLevel, message: unknown, context?: string): void {
    if (LEVELS[level] < this.threshold) return;
    const entry = this.asEntry(message);
    if (context && !entry.context) entry.context = context;
    this.emit(level, entry);
  }

  private asEntry(message: unknown): Record<string, unknown> {
    if (message && typeof message === 'object' && !Array.isArray(message)) {
      return redact(message) as Record<string, unknown>;
    }
    return { message: redact(String(message)) };
  }

  private emit(level: LogLevel, fields: Record<string, unknown>): void {
    if (LEVELS[level] < this.threshold) return;
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      environment: this.environment,
      ...fields,
    };
    const line = `${JSON.stringify(entry)}\n`;
    if (level === 'ERROR' || level === 'FATAL') process.stderr.write(line);
    else process.stdout.write(line);
  }
}
