import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

function int(raw: string | undefined, def: number, min: number, max: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= min && n <= max ? n : def;
}

@Injectable()
export class AutomationConfig {
  constructor(@Optional() private readonly config?: ConfigService) {}
  private get(key: string): string | undefined { return this.config?.get<string>(key) ?? process.env[key]; }

  get engineEnabled() { return (this.get('AUTOMATION_ENGINE_ENABLED') ?? 'true').toLowerCase() !== 'false'; }
  /** Destructive automation is OFF unless explicitly enabled by the platform operator. */
  get destructiveEnabled() { return (this.get('AUTOMATION_DESTRUCTIVE_ACTIONS_ENABLED') ?? 'false').toLowerCase() === 'true'; }
  get destructiveMaxPerHour() { return int(this.get('AUTOMATION_DESTRUCTIVE_MAX_PER_HOUR'), 30, 1, 10000); }
  get tenantMaxInflight() { return int(this.get('AUTOMATION_TENANT_MAX_INFLIGHT'), 10, 1, 100); }
  get approvalTtlHours() { return int(this.get('AUTOMATION_APPROVAL_TTL_HOURS'), 24, 1, 168); }
  get retentionDays() { return int(this.get('AUTOMATION_RETENTION_DAYS'), 30, 7, 365); }
  get tickMs() { return int(this.get('AUTOMATION_TICK_MS'), 3000, 500, 60000); }
  get batchSize() { return int(this.get('AUTOMATION_BATCH_SIZE'), 10, 1, 50); }
  get leaseGraceMs() { return 30_000; }
}
