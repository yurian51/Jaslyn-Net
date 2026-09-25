import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { EventEmitter } from 'node:events';
import { PG_POOL } from '../database/database.module';

export type CommunicationEvent = {
  type: string;
  tenantId: string;
  conversationId?: string;
  messageId?: string;
  data: Record<string, unknown>;
  createdAt: string;
};

@Injectable()
export class CommunicationRealtime implements OnModuleInit, OnModuleDestroy {
  private readonly emitter = new EventEmitter();
  private readonly instanceId = crypto.randomUUID();
  private listener?: PoolClient;
  private readonly heartbeat = setInterval(() => this.emitter.emit('heartbeat'), 25_000);

  constructor(private readonly db: Pool) {
    this.emitter.setMaxListeners(0);
  }

  async onModuleInit() {
    this.listener = await this.db.connect();
    await this.listener.query('LISTEN jaslyn_communication');
    this.listener.on('notification', (notification) => {
      if (!notification.payload) return;
      try {
        const event = JSON.parse(notification.payload) as CommunicationEvent & { instanceId?: string };
        if (event.instanceId === this.instanceId) return;
        this.emitter.emit('event', event);
      } catch {
        // Ignore malformed cross-instance notifications.
      }
    });
  }

  subscribe(listener: (event: CommunicationEvent) => void) {
    this.emitter.on('event', listener);
    return () => this.emitter.off('event', listener);
  }

  publish(event: Omit<CommunicationEvent, 'createdAt'>) {
    const payload = { ...event, createdAt: new Date().toISOString(), instanceId: this.instanceId };
    this.emitter.emit('event', payload);
    void this.db.query('SELECT pg_notify($1,$2)', ['jaslyn_communication', JSON.stringify(payload)]).catch(() => undefined);
  }

  onHeartbeat(listener: () => void) {
    this.emitter.on('heartbeat', listener);
    return () => this.emitter.off('heartbeat', listener);
  }

  async onModuleDestroy() {
    clearInterval(this.heartbeat);
    this.emitter.removeAllListeners();
    if (this.listener) {
      await this.listener.query('UNLISTEN jaslyn_communication').catch(() => undefined);
      this.listener.release();
      this.listener = undefined;
    }
  }
}
