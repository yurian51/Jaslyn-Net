import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'node:events';

export type CommunicationEvent = {
  type: string;
  tenantId: string;
  conversationId?: string;
  messageId?: string;
  data: Record<string, unknown>;
  createdAt: string;
};

@Injectable()
export class CommunicationRealtime implements OnModuleDestroy {
  private readonly emitter = new EventEmitter();
  private readonly heartbeat = setInterval(() => this.emitter.emit('heartbeat'), 25_000);

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  subscribe(listener: (event: CommunicationEvent) => void) {
    this.emitter.on('event', listener);
    return () => this.emitter.off('event', listener);
  }

  publish(event: Omit<CommunicationEvent, 'createdAt'>) {
    this.emitter.emit('event', { ...event, createdAt: new Date().toISOString() });
  }

  onHeartbeat(listener: () => void) {
    this.emitter.on('heartbeat', listener);
    return () => this.emitter.off('heartbeat', listener);
  }

  onModuleDestroy() {
    clearInterval(this.heartbeat);
    this.emitter.removeAllListeners();
  }
}
