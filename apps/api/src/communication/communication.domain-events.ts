import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

export type DomainEventInput = {
  tenantId: string;
  eventKey: string;
  eventType: string;
  aggregateType?: string;
  aggregateId?: string;
  payload?: Record<string, unknown>;
};

export type DomainEvent = DomainEventInput & {
  id: string;
  createdAt: string;
};

type StoredEvent = DomainEvent & { attempts: number };

@Injectable()
export class CommunicationDomainEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly emitter = new EventEmitter();
  private listener?: PoolClient;
  private readonly channel = 'jaslyn_domain_events';
  private readonly interval = setInterval(() => void this.drain(), 2_000);

  constructor(@Inject(PG_POOL) private readonly db: Pool) {
    this.emitter.setMaxListeners(0);
  }

  async onModuleInit() {
    const client = await this.db.connect();
    client.on('notification', (notification) => {
      if (!notification.payload) return;
      try {
        this.emitter.emit('event', JSON.parse(notification.payload) as DomainEvent);
      } catch {
        // Cross-instance notifications are advisory; the durable outbox is authoritative.
      }
    });
    await client.query(`LISTEN ${this.channel}`);
    this.emitter.on('event', () => void this.drain());
    await this.drain();
    this.listener = client;
  }

  async enqueue(input: DomainEventInput, client?: Pick<Pool | PoolClient, 'query'>) {
    const db = client ?? this.db;
    const result = await db.query<{ id: string; createdAt: string }>(
      `INSERT INTO communication_domain_events
         (tenant_id,event_key,event_type,aggregate_type,aggregate_id,payload)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (tenant_id,event_key) DO UPDATE SET updated_at=communication_domain_events.updated_at
       RETURNING id,created_at AS "createdAt"`,
      [
        input.tenantId,
        input.eventKey.trim(),
        input.eventType.trim().toUpperCase(),
        input.aggregateType?.trim() || null,
        input.aggregateId || null,
        JSON.stringify(input.payload ?? {}),
      ],
    );
    const event = { ...input, id: result.rows[0].id, createdAt: result.rows[0].createdAt };
    void this.db.query('SELECT pg_notify($1,$2)', [this.channel, JSON.stringify(event)]).catch(() => undefined);
    return event;
  }

  async claim(limit = 25) {
    const safeLimit = Math.min(Math.max(Math.trunc(limit || 25), 1), 100);
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<StoredEvent>(
        `SELECT id,tenant_id AS "tenantId",event_key AS "eventKey",event_type AS "eventType",
                aggregate_type AS "aggregateType",aggregate_id AS "aggregateId",payload,
                attempts,created_at AS "createdAt"
           FROM communication_domain_events
          WHERE status IN ('PENDING','FAILED')
            AND available_at <= now()
            AND attempts < 8
          ORDER BY created_at
          FOR UPDATE SKIP LOCKED
          LIMIT $1`,
        [safeLimit],
      );
      if (result.rowCount) {
        await client.query(
          `UPDATE communication_domain_events
              SET status='PROCESSING',locked_at=now(),attempts=attempts+1,updated_at=now()
            WHERE id=ANY($1::uuid[])`,
          [result.rows.map((row) => row.id)],
        );
      }
      await client.query('COMMIT');
      return result.rows;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async markProcessed(id: string) {
    await this.db.query(
      `UPDATE communication_domain_events
          SET status='PROCESSED',processed_at=now(),locked_at=NULL,updated_at=now()
        WHERE id=$1 AND status='PROCESSING'`,
      [id],
    );
  }

  async markFailed(id: string, error: unknown) {
    await this.db.query(
      `UPDATE communication_domain_events
          SET status=CASE WHEN attempts >= 8 THEN 'FAILED' ELSE 'PENDING' END,
              available_at=CASE WHEN attempts >= 8 THEN now()+interval '60 seconds' ELSE now()+interval '5 seconds' END,
              locked_at=NULL,last_error=left($2,2000),updated_at=now()
        WHERE id=$1 AND status='PROCESSING'`,
      [id, error instanceof Error ? error.message : String(error)],
    );
  }

  async recoverStale(maxAgeMinutes = 15) {
    const age = Math.min(Math.max(Math.trunc(maxAgeMinutes), 1), 1440);
    await this.db.query(
      `UPDATE communication_domain_events
          SET status=CASE WHEN attempts >= 8 THEN 'FAILED' ELSE 'PENDING' END,
              available_at=now(),locked_at=NULL,last_error=COALESCE(last_error,'Recovered stale event lock'),updated_at=now()
        WHERE status='PROCESSING' AND locked_at < now()-($1 * interval '1 minute')`,
      [age],
    );
  }

  private async drain() {
    await this.recoverStale();
    const events = await this.claim();
    for (const event of events) {
      try {
        this.emitter.emit('claimed', event);
        await this.markProcessed(event.id);
      } catch (error) {
        await this.markFailed(event.id, error);
      }
    }
  }

  async onModuleDestroy() {
    clearInterval(this.interval);
    this.emitter.removeAllListeners();
    if (this.listener) {
      await this.listener.query(`UNLISTEN ${this.channel}`).catch(() => undefined);
      this.listener.release();
      this.listener = undefined;
    }
  }

  onClaimed(listener: (event: DomainEvent & { attempts: number; payload: Record<string, unknown> }) => void) {
    this.emitter.on('claimed', listener);
    return () => this.emitter.off('claimed', listener);
  }
}
