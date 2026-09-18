import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { getCorrelationId } from '../common/correlation-context';

export type AuditContext = {
  userId?: string;
  requestId?: string;
  correlationId?: string;
  ipAddress?: string;
  userAgent?: string;
};

const SENSITIVE_KEY = /(?:password|passwd|passcode|secret|token|api[-_]?key|access[-_]?token|refresh[-_]?token|client[-_]?secret|credential|authorization|cookie|session[-_]?token|private[-_]?key|encrypted)/i;
const REDACTED = '[REDACTED]';
const MAX_METADATA_DEPTH = 8;
const MAX_METADATA_KEYS = 200;
const MAX_METADATA_ARRAY_ITEMS = 100;
const MAX_METADATA_STRING_LENGTH = 2000;

function sanitizeMetadata(value: unknown, depth = 0): unknown {
  if (depth > MAX_METADATA_DEPTH) return '[TRUNCATED]';
  if (typeof value === 'string') return value.length > MAX_METADATA_STRING_LENGTH ? `${value.slice(0, MAX_METADATA_STRING_LENGTH)}…` : value;
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, MAX_METADATA_ARRAY_ITEMS).map((item) => sanitizeMetadata(item, depth + 1));
  if (typeof value !== 'object') return String(value);

  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>).slice(0, MAX_METADATA_KEYS)) {
    output[key] = SENSITIVE_KEY.test(key) ? REDACTED : sanitizeMetadata(child, depth + 1);
  }
  return output;
}

@Injectable()
export class AuditService {
  constructor(@Inject(PG_POOL) private readonly db: Pool) {}

  async record(
    tenantId: string,
    action: string,
    resourceType: string,
    resourceId?: string,
    metadata: Record<string, unknown> = {},
    context: AuditContext = {},
  ) {
    const safeMetadata = sanitizeMetadata(metadata) as Record<string, unknown>;
    const correlationId = context.correlationId ?? getCorrelationId() ?? context.requestId ?? null;
    const result = await this.db.query(
      `INSERT INTO audit_logs
        (tenant_id, actor_user_id, action, resource_type, resource_id, request_id, correlation_id, ip_address, user_agent, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id, created_at AS "createdAt"`,
      [
        tenantId,
        context.userId ?? null,
        action.trim().toUpperCase(),
        resourceType.trim().toLowerCase(),
        resourceId ?? null,
        context.requestId ?? null,
        correlationId,
        context.ipAddress ?? null,
        context.userAgent ?? null,
        safeMetadata,
      ],
    );
    return result.rows[0];
  }

  async list(tenantId: string, limit = 100) {
    const safeLimit = Math.min(Math.max(Math.trunc(limit || 100), 1), 500);
    const result = await this.db.query(
      `SELECT
         a.id,
         a.action,
         a.resource_type AS "resourceType",
         a.resource_id AS "resourceId",
         a.request_id AS "requestId",
         a.correlation_id AS "correlationId",
         a.ip_address AS "ipAddress",
         a.user_agent AS "userAgent",
         a.metadata,
         a.created_at AS "createdAt",
         u.id AS "actorUserId",
         u.full_name AS "actorName",
         u.email AS "actorEmail"
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_user_id AND u.tenant_id = a.tenant_id
       WHERE a.tenant_id = $1
       ORDER BY a.created_at DESC
       LIMIT $2`,
      [tenantId, safeLimit],
    );
    return { data: result.rows, count: result.rowCount ?? 0 };
  }

  async trace(tenantId: string, correlationId: string, limit = 500) {
    const normalized = correlationId.trim();
    if (!normalized || normalized.length > 128) {
      return { correlationId: normalized, data: [], count: 0 };
    }
    const safeLimit = Math.min(Math.max(Math.trunc(limit || 500), 1), 1000);
    const result = await this.db.query(
      `WITH evidence AS (
         SELECT 'AUDIT' AS source, a.id::text AS id, a.created_at AS occurred_at,
                a.action AS operation, a.resource_type AS resource_type,
                a.resource_id::text AS resource_id, a.metadata AS details
           FROM audit_logs a
          WHERE a.tenant_id=$1 AND a.correlation_id=$2
         UNION ALL
         SELECT 'PAYMENT', p.id::text, p.created_at, 'PAYMENT', 'payment', p.id::text,
                jsonb_build_object('status',p.status,'provider',p.provider,'purchaseId',p.purchase_id,'amount',p.amount,'currency',p.currency)
           FROM payments p
          WHERE p.tenant_id=$1 AND p.correlation_id=$2
         UNION ALL
         SELECT 'PURCHASE', p.id::text, p.created_at, 'PURCHASE', 'purchase', p.id::text,
                jsonb_build_object('status',p.status,'customerId',p.customer_id,'packageId',p.package_id,'routerId',p.router_id,'startsAt',p.starts_at,'endsAt',p.ends_at)
           FROM wifi_plan_purchases p
          WHERE p.tenant_id=$1 AND p.correlation_id=$2
         UNION ALL
         SELECT 'ACCESS_GRANT', g.id::text, g.created_at, 'ACCESS_GRANT', 'access_grant', g.id::text,
                jsonb_build_object('status',g.status,'customerId',g.customer_id,'purchaseId',g.purchase_id,'routerId',g.router_id,'startsAt',g.starts_at,'endsAt',g.ends_at)
           FROM access_grants g
          WHERE g.tenant_id=$1 AND g.correlation_id=$2
         UNION ALL
         SELECT 'SESSION', s.id::text, s.started_at, 'SESSION', 'session', s.id::text,
                jsonb_build_object('status',s.status,'customerId',s.customer_id,'routerId',s.router_id,'username',s.username,'startedAt',s.started_at,'endedAt',s.ended_at)
           FROM sessions s
          WHERE s.tenant_id=$1 AND s.correlation_id=$2
         UNION ALL
         SELECT 'LEDGER', t.id::text, t.posted_at, t.transaction_type,
                t.reference_type, t.reference_id::text,
                jsonb_build_object('description',t.description,'correlationId',t.correlation_id)
           FROM financial_ledger_transactions t
          WHERE t.tenant_id=$1 AND t.correlation_id=$2
         UNION ALL
         SELECT 'NETWORK_COMMAND', n.id::text, n.created_at, n.command_type,
                'network_command', n.id::text,
                jsonb_build_object('status',n.status,'routerId',n.router_id,'provider',n.provider,'verification',n.verification,'error',n.error)
           FROM network_commands n
          WHERE n.tenant_id=$1 AND n.correlation_id=$2
       )
       SELECT source, id, occurred_at AS "occurredAt", operation, resource_type AS "resourceType",
              resource_id AS "resourceId", details
         FROM evidence
        ORDER BY occurred_at ASC
        LIMIT $3`,
      [tenantId, normalized, safeLimit],
    );
    return { correlationId: normalized, data: result.rows, count: result.rowCount ?? 0 };
  }
}
