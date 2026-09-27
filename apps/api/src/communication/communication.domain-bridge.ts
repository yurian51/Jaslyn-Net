import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { CommunicationDomainEventsService } from './communication.domain-events';
import { CommunicationRealtime } from './communication.realtime';

type DomainEvent = {
  id: string;
  tenantId: string;
  eventType: string;
  aggregateType?: string;
  aggregateId?: string;
  payload: Record<string, unknown>;
};

const OPERATOR_ROLES = [
  'OWNER',
  'ADMIN',
  'SUPER_ADMIN',
  'BILLING_ADMIN',
  'NOC_ENGINEER',
  'NETWORK_ADMIN',
];

@Injectable()
export class CommunicationDomainBridge implements OnModuleInit {
  constructor(
    private readonly events: CommunicationDomainEventsService,
    private readonly realtime: CommunicationRealtime,
    @Inject(PG_POOL) private readonly db: Pool,
  ) {}

  onModuleInit() {
    this.events.onClaimed((event) => void this.handle(event));
  }

  private async handle(event: DomainEvent) {
    const targets = this.resolveTargets(event);
    if (!targets.length) return;

    const title = this.titleFor(event);
    const body = this.bodyFor(event);
    const type = event.eventType.toLowerCase();

    for (const userId of targets) {
      await this.db.query(
        `INSERT INTO communication_notifications
          (tenant_id,user_id,type,title,body,resource_type,resource_id,source_event_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (tenant_id,user_id,source_event_id) DO NOTHING`,
        [
          event.tenantId,
          userId,
          type,
          title,
          body,
          event.aggregateType ?? null,
          event.aggregateId ?? null,
          event.id,
        ],
      );
    }

    this.realtime.publish({
      type: 'domain.notification.created',
      tenantId: event.tenantId,
      data: { eventId: event.id, eventType: event.eventType, userIds: targets, resourceId: event.aggregateId ?? null },
    });
  }

  private resolveTargets(event: DomainEvent) {
    const payload = event.payload ?? {};
    const direct = Array.isArray(payload.targetUserIds)
      ? payload.targetUserIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : [];
    if (direct.length) return [...new Set(direct)];

    const roles = Array.isArray(payload.targetRoles)
      ? payload.targetRoles.filter((role): role is string => typeof role === 'string')
      : [];
    if (!roles.length) return [];

    return this.resolveUsersByRoles(event.tenantId, roles);
  }

  private async resolveUsersByRoles(tenantId: string, roles: string[]) {
    const normalized = [...new Set(roles.map((role) => role.trim().toUpperCase()))]
      .filter((role) => OPERATOR_ROLES.includes(role));
    if (!normalized.length) return [];
    const result = await this.db.query<{ id: string }>(
      `SELECT id FROM users WHERE tenant_id=$1 AND is_active=true AND role=ANY($2::text[])`,
      [tenantId, normalized],
    );
    return result.rows.map((row) => row.id);
  }

  private titleFor(event: DomainEvent) {
    switch (event.eventType) {
      case 'INCIDENT.OPENED': return 'Network incident opened';
      case 'INCIDENT.RESOLVED': return 'Network incident resolved';
      case 'PAYMENT.WEBHOOK_RECEIVED': return 'Payment event received';
      default: return event.eventType.replaceAll('.', ' ');
    }
  }

  private bodyFor(event: DomainEvent) {
    const payload = event.payload ?? {};
    if (event.eventType.startsWith('INCIDENT.')) {
      return String(payload.title ?? payload.summary ?? 'A network incident changed state.');
    }
    if (event.eventType === 'PAYMENT.WEBHOOK_RECEIVED') {
      return `Provider ${String(payload.provider ?? 'unknown')} sent event ${String(payload.providerEventId ?? event.id)}.`;
    }
    return String(payload.message ?? 'A platform event requires attention.');
  }
}
