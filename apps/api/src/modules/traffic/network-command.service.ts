import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { PG_POOL } from '../../database/database.module';
import { BandwidthEnforcementCommand } from './enforcement.adapter';
import { getCorrelationId } from '../../common/correlation-context';

export type NetworkCommandStatus = 'QUEUED' | 'SENT' | 'ACCEPTED' | 'EXECUTED' | 'VERIFIED' | 'FAILED' | 'RETRYING' | 'ABANDONED';

export interface NetworkCommandInput {
  routerId?: string;
  commandType: string;
  actor?: string;
  target?: unknown;
  request?: unknown;
  provider?: string;
  correlationId?: string;
}

export interface QueuedBandwidthCommand {
  id: string;
  command: BandwidthEnforcementCommand;
  status: NetworkCommandStatus;
  reused: boolean;
}

@Injectable()
export class NetworkCommandService {
  constructor(@Inject(PG_POOL) private readonly db: Pool) {}

  async queue(tenantId: string, input: NetworkCommandInput) {
    const id = randomUUID();
    const target = JSON.stringify(input.target ?? {});
    const request = JSON.stringify(input.request ?? {});
    const provider = input.provider ?? null;
    const correlationId = input.correlationId ?? getCorrelationId();
    const result = await this.db.query(
      `INSERT INTO network_commands
         (id, tenant_id, router_id, command_type, actor, target, request, provider, status, attempts, correlation_id)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,'QUEUED',0,$9)
       ON CONFLICT (tenant_id, command_type, correlation_id) WHERE correlation_id IS NOT NULL
       DO NOTHING
       RETURNING id`,
      [id, tenantId, input.routerId ?? null, input.commandType, input.actor ?? 'system', target, request, provider, correlationId ?? null],
    );
    if (result.rowCount) return { id: result.rows[0].id, reused: false };
    if (correlationId) {
      const existing = await this.db.query(
        `SELECT id,
                target = $4::jsonb AS target_matches,
                request = $5::jsonb AS request_matches,
                provider IS NOT DISTINCT FROM $6 AS provider_matches
         FROM network_commands
         WHERE tenant_id=$1 AND command_type=$2 AND correlation_id=$3`,
        [tenantId, input.commandType, correlationId, target, request, provider],
      );
      if (existing.rowCount) {
        const row = existing.rows[0];
        if (!row.target_matches || !row.request_matches || !row.provider_matches) {
          throw new ConflictException('Network command correlation is already bound to a different operation');
        }
        return { id: row.id, reused: true };
      }
    }
    throw new Error('Network command could not be queued');
  }

  async queueBandwidthCommands(tenantId: string, commands: BandwidthEnforcementCommand[], actor = 'system', correlationId?: string): Promise<QueuedBandwidthCommand[]> {
    if (!commands.length) return [];
    const client = await this.db.connect();
    const created: QueuedBandwidthCommand[] = [];
    try {
      await client.query('BEGIN');
      for (const command of commands) {
        const commandCorrelationId = correlationId
          ? `${correlationId}:${command.sessionId ?? command.customerId}`
          : undefined;
        const target = {
          customerId: command.customerId,
          sessionId: command.sessionId,
          address: command.targetAddress,
          mac: command.targetMacAddress,
        };
        const request = command;
        const provider = command.protocol ?? null;

        if (commandCorrelationId) {
          const existing = await client.query(
            `SELECT id, status,
                    target = $3::jsonb AS target_matches,
                    request = $4::jsonb AS request_matches,
                    provider IS NOT DISTINCT FROM $5 AS provider_matches
             FROM network_commands
             WHERE tenant_id=$1 AND command_type='BANDWIDTH_ENFORCEMENT' AND correlation_id=$2
             FOR UPDATE`,
            [tenantId, commandCorrelationId, JSON.stringify(target), JSON.stringify(request), provider],
          );
          if (existing.rowCount) {
            const row = existing.rows[0];
            if (!row.target_matches || !row.request_matches || !row.provider_matches) {
              throw new ConflictException('Network command correlation is already bound to a different operation');
            }
            const existingStatus = row.status as NetworkCommandStatus;
            created.push({ id: row.id, command, status: existingStatus, reused: true });
            continue;
          }

          const insert = await client.query(
            `INSERT INTO network_commands
               (id, tenant_id, router_id, command_type, actor, target, request, provider, status, attempts, correlation_id)
             VALUES ($1,$2,$3,'BANDWIDTH_ENFORCEMENT',$4,$5::jsonb,$6::jsonb,$7,'QUEUED',0,$8)
             ON CONFLICT (tenant_id, command_type, correlation_id) WHERE correlation_id IS NOT NULL
             DO NOTHING
             RETURNING id, status`,
            [randomUUID(), tenantId, command.routerId, actor,
              JSON.stringify(target), JSON.stringify(request), provider, commandCorrelationId],
          );
          if (insert.rowCount) {
            created.push({ id: insert.rows[0].id, command, status: insert.rows[0].status as NetworkCommandStatus, reused: false });
            continue;
          }

          const winner = await client.query(
            `SELECT id, status,
                    target = $3::jsonb AS target_matches,
                    request = $4::jsonb AS request_matches,
                    provider IS NOT DISTINCT FROM $5 AS provider_matches
             FROM network_commands
             WHERE tenant_id=$1 AND command_type='BANDWIDTH_ENFORCEMENT' AND correlation_id=$2
             FOR UPDATE`,
            [tenantId, commandCorrelationId, JSON.stringify(target), JSON.stringify(request), provider],
          );
          if (!winner.rowCount) throw new Error('Network command conflict winner could not be read');
          const row = winner.rows[0];
          if (!row.target_matches || !row.request_matches || !row.provider_matches) {
            throw new ConflictException('Network command correlation is already bound to a different operation');
          }
          created.push({ id: row.id, command, status: row.status as NetworkCommandStatus, reused: true });
          continue;
        }

        const result = await client.query(
          `INSERT INTO network_commands
             (id, tenant_id, router_id, command_type, actor, target, request, provider, status, attempts, correlation_id)
           VALUES ($1,$2,$3,'BANDWIDTH_ENFORCEMENT',$4,$5::jsonb,$6::jsonb,$7,'QUEUED',0,$8)
           RETURNING id, status`,
          [randomUUID(), tenantId, command.routerId, actor,
            JSON.stringify(target), JSON.stringify(request), provider, commandCorrelationId ?? null],
        );
        created.push({ id: result.rows[0].id, command, status: result.rows[0].status as NetworkCommandStatus, reused: false });
      }
      await client.query('COMMIT');
      return created;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  async claimPending(tenantId?: string, limit = 20, staleAfterSeconds = 300) {
    const safeLimit = Math.min(Math.max(Math.trunc(limit || 20), 1), 100);
    const safeStale = Math.min(Math.max(Math.trunc(staleAfterSeconds || 300), 30), 3600);
    const result = await this.db.query(
      `WITH candidates AS (
         SELECT id
         FROM network_commands
         WHERE ($1::uuid IS NULL OR tenant_id=$1)
           AND (
             status IN ('QUEUED','RETRYING')
             OR (status='SENT' AND sent_at < now() - ($2::integer * interval '1 second'))
           )
         ORDER BY created_at
         FOR UPDATE SKIP LOCKED
         LIMIT $3
       )
       UPDATE network_commands c
       SET status='SENT', sent_at=now(), updated_at=now()
       FROM candidates
       WHERE c.id=candidates.id
       RETURNING c.id, c.tenant_id AS "tenantId", c.router_id AS "routerId", c.command_type AS "commandType",
                 c.target, c.request, c.provider, c.status, c.attempts, c.correlation_id AS "correlationId"`,
      [tenantId ?? null, safeStale, safeLimit],
    );
    return result.rows;
  }

  async retry(tenantId: string, id: string) {
    const result = await this.db.query(
      `UPDATE network_commands
       SET status='RETRYING', error=NULL, response=NULL, verification=NULL,
           sent_at=NULL, completed_at=NULL, verified_at=NULL, updated_at=now()
       WHERE tenant_id=$1 AND id=$2 AND status='FAILED'
       RETURNING id, status`,
      [tenantId, id],
    );
    if (!result.rowCount) throw new ConflictException('Only FAILED network commands can be explicitly retried');
    return result.rows[0];
  }

  async markExecuted(tenantId: string, ids: string[], response: unknown = {}) {
    if (!ids.length) return;
    await this.db.query(
      `UPDATE network_commands SET status='EXECUTED', attempts=attempts+1, response=$3::jsonb,
              sent_at=COALESCE(sent_at,now()), completed_at=now(), updated_at=now()
       WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND status IN ('QUEUED','SENT','ACCEPTED','RETRYING')`,
      [tenantId, ids, JSON.stringify(response)],
    );
  }

  async markFailed(tenantId: string, ids: string[], error: unknown) {
    if (!ids.length) return;
    const message = error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000);
    await this.db.query(
      `UPDATE network_commands SET status='FAILED', attempts=attempts+1, error=$3, completed_at=now(), updated_at=now()
       WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND status IN ('QUEUED','SENT','ACCEPTED','RETRYING')`,
      [tenantId, ids, message],
    );
  }

  async markVerificationFailed(tenantId: string, id: string, verification: unknown) {
    const message = typeof verification === 'object' && verification !== null && 'reason' in verification
      ? String((verification as { reason?: unknown }).reason ?? 'NETWORK_VERIFICATION_FAILED')
      : 'NETWORK_VERIFICATION_FAILED';
    const result = await this.db.query(
      `UPDATE network_commands
       SET status='FAILED', error=$3, verification=$4::jsonb, completed_at=now(), updated_at=now()
       WHERE tenant_id=$1 AND id=$2 AND status='EXECUTED'
       RETURNING id, status, verification, error`,
      [tenantId, id, message.slice(0, 2000), JSON.stringify(verification ?? {})],
    );
    return result.rows[0] ?? null;
  }

  async markVerified(tenantId: string, id: string, verification: unknown) {
    const result = await this.db.query(
      `UPDATE network_commands SET status='VERIFIED', verification=$3::jsonb, verified_at=now(), updated_at=now()
       WHERE tenant_id=$1 AND id=$2 AND status='EXECUTED'
       RETURNING id, status, verified_at AS "verifiedAt"`,
      [tenantId, id, JSON.stringify(verification)],
    );
    return result.rows[0] ?? null;
  }

  async list(tenantId: string, routerId?: string, status?: NetworkCommandStatus, limit = 100) {
    const safeLimit = Math.min(Math.max(Math.trunc(limit || 100), 1), 500);
    const result = await this.db.query(
      `SELECT id, router_id AS "routerId", command_type AS "commandType", actor, target, request, provider, status,
              attempts, response, verification, error, correlation_id AS "correlationId", created_at AS "createdAt",
              sent_at AS "sentAt", completed_at AS "completedAt", verified_at AS "verifiedAt"
       FROM network_commands WHERE tenant_id=$1 AND ($2::uuid IS NULL OR router_id=$2)
         AND ($3::text IS NULL OR status=$3) ORDER BY created_at DESC LIMIT $4`,
      [tenantId, routerId ?? null, status ?? null, safeLimit],
    );
    return { data: result.rows, count: result.rowCount ?? 0 };
  }

  async get(tenantId: string, id: string) {
    const result = await this.db.query(
      `SELECT id, router_id AS "routerId", command_type AS "commandType", actor, target, request, provider, status,
              attempts, response, verification, error, correlation_id AS "correlationId", created_at AS "createdAt",
              sent_at AS "sentAt", completed_at AS "completedAt", verified_at AS "verifiedAt"
       FROM network_commands WHERE tenant_id=$1 AND id=$2`,
      [tenantId, id],
    );
    if (!result.rowCount) throw new NotFoundException('Network command not found');
    return result.rows[0];
  }
}
