import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { CommunicationDomainEventsService } from '../communication/communication.domain-events';

type EscalationRow = {
  id: string;
  tenant_id: string;
  title: string;
  summary: string | null;
  severity: string;
  owner_user_id: string | null;
  escalation_level: number;
};

@Injectable()
export class IncidentEscalationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IncidentEscalationWorker.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @Inject(PG_POOL) private readonly db: Pool,
    private readonly domainEvents: CommunicationDomainEventsService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => { void this.tick(); }, 60_000);
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    const client = await this.db.connect().catch((error: unknown) => {
      this.logger.error('Unable to connect for incident escalation', error instanceof Error ? error.stack : undefined);
      return null;
    });
    if (!client) { this.running = false; return; }
    let locked = false;
    let inTransaction = false;
    const escalations: EscalationRow[] = [];
    try {
      const lock = await client.query<{ acquired: boolean }>('SELECT pg_try_advisory_lock($1) AS acquired', [7_421_944]);
      locked = Boolean(lock.rows[0]?.acquired);
      if (!locked) return;

      await client.query('BEGIN');
      inTransaction = true;
      const due = await client.query<EscalationRow>(
        `SELECT id,tenant_id,title,summary,severity,owner_user_id,escalation_level
         FROM incidents
         WHERE status IN ('OPEN','ACKNOWLEDGED') AND escalation_level<3
           AND ((last_escalated_at IS NULL AND started_at<=now()-interval '15 minutes')
             OR last_escalated_at<=now()-interval '15 minutes')
         ORDER BY severity DESC,started_at ASC
         LIMIT 50 FOR UPDATE SKIP LOCKED`,
      );
      for (const incident of due.rows) {
        const level = incident.escalation_level + 1;
        await client.query(
          'UPDATE incidents SET escalation_level=$3,last_escalated_at=now(),updated_at=now() WHERE tenant_id=$1 AND id=$2',
          [incident.tenant_id, incident.id, level],
        );
        await client.query(
          `INSERT INTO incident_events(tenant_id,incident_id,event_type,note,metadata)
           VALUES ($1,$2,'ESCALATION_TRIGGERED',$3,$4::jsonb)`,
          [incident.tenant_id, incident.id, 'Incident escalation level ' + level, JSON.stringify({ level, ownerUserId: incident.owner_user_id })],
        );
        await client.query(
          `INSERT INTO audit_logs(tenant_id,action,resource_type,resource_id,metadata)
           VALUES ($1,'INCIDENT_ESCALATION_TRIGGERED','incident',$2,$3::jsonb)`,
          [incident.tenant_id, incident.id, JSON.stringify({ level, severity: incident.severity, ownerUserId: incident.owner_user_id })],
        );
        escalations.push({ ...incident, escalation_level: level });
      }
      await client.query('COMMIT');
      inTransaction = false;

      for (const incident of escalations) {
        try {
          await this.domainEvents.enqueue({
            tenantId: incident.tenant_id,
            eventKey: 'incident.escalation:' + incident.id + ':' + incident.escalation_level,
            eventType: 'INCIDENT.ESCALATED',
            aggregateType: 'incident',
            aggregateId: incident.id,
            payload: {
              title: 'Incident escalation: ' + incident.title,
              summary: incident.summary ?? 'An incident remains unresolved and requires escalation.',
              severity: incident.severity,
              incidentId: incident.id,
              escalationLevel: incident.escalation_level,
              ownerUserId: incident.owner_user_id,
              targetRoles: ['OWNER','ADMIN','SUPER_ADMIN','NOC_ENGINEER','NETWORK_ADMIN'],
            },
          });
        } catch (error) {
          this.logger.error('Unable to enqueue incident escalation ' + incident.id, error instanceof Error ? error.stack : undefined);
        }
      }
    } catch (error) {
      if (inTransaction) await client.query('ROLLBACK').catch(() => undefined);
      this.logger.error('Incident escalation cycle failed', error instanceof Error ? error.stack : undefined);
    } finally {
      if (locked) await client.query('SELECT pg_advisory_unlock($1)', [7_421_944]).catch(() => undefined);
      client.release();
      this.running = false;
    }
  }
}
