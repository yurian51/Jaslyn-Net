import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import { SmsGatewayService, SmsProviderError } from './sms-gateway.service';

@Injectable()
export class NotificationsWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsWorker.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly notifications: NotificationsService,
    private readonly sms: SmsGatewayService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    // A global release switch is required even when tenant-specific providers are configured.
    if (this.config.get<string>('SMS_ENABLED') !== 'true') return;
    this.timer = setInterval(() => void this.process().catch(() => this.logger.error('SMS worker cycle failed')), 2000);
    this.timer.unref?.();
    void this.process().catch(() => this.logger.error('SMS worker initial cycle failed'));
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async process() {
    if (this.running || this.config.get<string>('SMS_ENABLED') !== 'true') return;
    this.running = true;
    try {
      const rows = await this.notifications.claimSms(20);
      for (const row of rows) {
        try {
          const status = await this.sms.status(row.tenantId);
          if (!status.configured) {
            await this.notifications.deferSms(row.id, 'SMS provider is not configured or enabled for this tenant');
            continue;
          }
          const message = typeof row.payload?.message === 'string' ? row.payload.message : '';
          if (!message.trim()) throw new Error('SMS payload is missing message text');
          const accepted = await this.sms.send(row.tenantId, row.recipient, message, row.dedupeKey || row.id);
          await this.notifications.markSent(row.id, accepted.providerMessageId);
        } catch (error) {
          const reason = error instanceof Error ? error.message : 'Unknown SMS delivery failure';
          if (error instanceof SmsProviderError && !error.retryable) {
            await this.notifications.markPermanentlyFailed(row.id, reason);
            this.logger.warn('SMS provider permanently rejected a queued message; message marked FAILED');
            continue;
          }
          const attempt = Math.max(1, Number(row.attempts) || 1);
          const delaySeconds = Math.min(3600, 15 * 2 ** Math.min(attempt - 1, 8));
          await this.notifications.markFailed(row.id, reason, delaySeconds);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
