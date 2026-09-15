import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { PG_POOL } from '../../database/database.module';
import { BandwidthEnforcementCommand } from './enforcement.adapter';

export type NetworkCommandStatus = 'QUEUED' | 'SENT' | 'ACCEPTED' | 'EXECUTED' | 'VERIFIED' | 'FAILED' | 'RETRYING' | 'ABANDONED';

@Injectable()
export class NetworkCommandService {
  constructor(@Inject(PG_POOL) private readonly db: Pool) {}

  async queueBandwidthCommands(
    tenantId: string,
    commands: BandwidthEnforcementCommand[],
    actor = 'system',
    correlationId?: string,
  ) {
    if (!commands.length) return [];
    const client = await this.db.connect();
    const created: Array<{ id: string; command: BandwidthEnforcementCommand }> = [];
    try {
      await client.query('BEGIN');
      for (const command of commands) {
        const result = await client.query(
          `INSERT INTO network_commands
             (id, tenant_id, router_id, command_type, actor, target, request, provider, status, attempts, correlation_id)
           VALUES ($1,$2,$3,'BANDWIDTH_ENFORCEMENT',$4,$5::jsonb,$6::jsonb,$7,'QUEUED',0,$8)
           RETURNING id`,
          [
            randomUUID(),
            tenantId,
            command.routerId,
            actor,
            JSON.stringify({ customerId: command.customerId, sessionId: command.sessionId, address: command.targetAddress, mac: command.targetMacAddress }),
            JSON.stringify(command),
            command.protocol ?? null,
            correlationId ?? null,
          ],
        );
        created.push({ id: result.rows[0].id, command });
      }
      await client.query('COMMIT');
      return created;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async markExecuted(tenantId: string, ids: string[], response: unknown = {}) {
    if (!ids.length) return;
    await this.db.query(
      `UPDATE network_commands
       SET status='EXECUTED', attempts=attempts+1, response=$3::jsonb,
           sent_at=COALESCE(sent_at,now()), completed_at=now(), updated_at=now()
       WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND status IN ('QUEUED','SENT','ACCEPTED','RETRYING')`,
      [tenantId, ids, JSON.stringify(response)],
    );
  }

  async markFailed(tenantId: string, ids: string[], error: unknown) {
    if (!ids.length) return;
    const message = error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000);
    await this.db.query(
      `UPDATE network_commands
       SET status='FAILED', attempts=attempts+1, error=$3, completed_at=now(), updated_at=now()
       WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND status IN ('QUEUED','SENT','ACCEPTED','RETRYING')`,
      [tenantId, ids, message],
    );
  }

  async markVerified(tenantId: string, id: string, verification: unknown) {
    const result = await this.db.query(
      `UPDATE network_commands
       SET status='VERIFIED', verification=$3::jsonb, verified_at=now(), updated_at=now()
       WHERE tenant_id=$1 AND id=$2 AND status='EXECUTED'
       RETURNING id, status, verified_at AS "verifiedAt"`,
      [tenantId, id, JSON.stringify(verification)],
    );
    return result.rows[0] ?? null;
  }

  async list(tenantId: string, routerId?: string, status?: NetworkCommandStatus, limit = 100) {
    const safeLimit = Math.min(Math.max(Math.trunc(limit || 100), 1), 500);
    const result = await this.db.query(
      `SELECT id, router_id AS "routerId", command_type AS "commandType", actor, target, request,
              provider, status, attempts, response, verification, error, correlation_id AS "correlationId",
              created_at AS "createdAt", sent_at AS "sentAt", completed_at AS "completedAt", verified_at AS "verifiedAt"
       FROM network_commands
       WHERE tenant_id=$1
         AND ($2::uuid IS NULL OR router_id=$2)
         AND ($3::text IS NULL OR status=$3)
       ORDER BY created_at DESC
       LIMIT $4`,
      [tenantId, routerId ?? null, status ?? null, safeLimit],
    );
    return { data: result.rows, count: result.rowCount ?? 0 };
  }
}
