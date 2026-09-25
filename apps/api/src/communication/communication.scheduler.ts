import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { CommunicationService } from './communication.service';

@Injectable()
export class CommunicationScheduler implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @Inject(PG_POOL) private readonly db: Pool,
    private readonly communication: CommunicationService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.process(), 15_000);
    void this.process();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async process() {
    if (this.running) return;
    this.running = true;
    const client = await this.db.connect();
    let lockAcquired = false;
    try {
      const lock = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [9817241]);
      lockAcquired = Boolean(lock.rows[0]?.acquired);
      if (!lockAcquired) return;

      const due = await client.query(
        'SELECT sm.id,sm.conversation_id AS "conversationId",sm.created_by_user_id AS "userId",u.tenant_id AS "tenantId",u.role,sm.scheduled_at AS "scheduledAt" ' +
        'FROM scheduled_messages sm JOIN users u ON u.tenant_id=sm.tenant_id AND u.id=sm.created_by_user_id AND u.is_active=true ' +
        'WHERE sm.status=\'SCHEDULED\' AND sm.scheduled_at <= now() ORDER BY sm.scheduled_at ASC LIMIT 50 FOR UPDATE SKIP LOCKED',
      );

      for (const row of due.rows) {
        const claimed = await client.query(
          'UPDATE scheduled_messages SET status=\'PROCESSING\',updated_at=now() WHERE tenant_id=$1 AND id=$2 AND status=\'SCHEDULED\' RETURNING id,body',
          [row.tenantId,row.id],
        );
        if (!claimed.rowCount) continue;
        try {
          const message = await this.communication.sendMessage(
            { userId:row.userId,tenantId:row.tenantId,role:row.role },
            row.conversationId,
            { body:claimed.rows[0].body,idempotencyKey:'scheduled:' + row.id },
          );
          await client.query(
            'UPDATE scheduled_messages SET status=\'SENT\',sent_message_id=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2',
            [row.tenantId,row.id,message.id],
          );
        } catch {
          await client.query(
            'UPDATE scheduled_messages SET status=\'FAILED\',updated_at=now() WHERE tenant_id=$1 AND id=$2',
            [row.tenantId,row.id],
          );
        }
      }
    } catch {
      // Scheduler failures are isolated from the HTTP request path.
    } finally {
      if (lockAcquired) await client.query('SELECT pg_advisory_unlock($1)', [9817241]).catch(()=>undefined);
      client.release();
      this.running = false;
    }
  }
}
