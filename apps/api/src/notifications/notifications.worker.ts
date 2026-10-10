import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { BeemSmsProvider } from './sms.provider';

@Injectable()
export class NotificationsWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly notifications: NotificationsService,
    private readonly sms: BeemSmsProvider,
  ) {}

  onModuleInit() {
    // Keep SMS outbox rows untouched until credentials and explicit enablement are present.
    if (!this.sms.status().configured) return;
    this.timer = setInterval(() => void this.process(), 2000);
    this.timer.unref?.();
    void this.process();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async process() {
    if (this.running || !this.sms.status().configured) return;
    this.running = true;
    try {
      const rows = await this.notifications.claimSms(20);
      for (const row of rows) {
        try {
          const message = typeof row.payload?.message === 'string' ? row.payload.message : '';
          if (!message.trim()) throw new Error('SMS payload is missing message text');
          const delivered = await this.sms.send(row.recipient, message, row.dedupeKey || row.id);
          await this.notifications.markSent(row.id, delivered.providerMessageId);
        } catch (error) {
          const attempt = Math.max(1, Number(row.attempts) || 1);
          const delaySeconds = Math.min(3600, 15 * 2 ** Math.min(attempt - 1, 8));
          await this.notifications.markFailed(
            row.id,
            error instanceof Error ? error.message : 'Unknown SMS delivery failure',
            delaySeconds,
          );
        }
      }
    } finally {
      this.running = false;
    }
  }
}
