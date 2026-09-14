import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

export type AuditContext = {
  userId?: string;
  requestId?: string;
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
    const result = await this.db.query(
      `INSERT INTO audit_logs
        (tenant_id, actor_user_id, action, resource_type, resource_id, request_id, ip_address, user_agent, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, created_at AS "createdAt"`,
      [
        tenantId,
        context.userId ?? null,
        action.trim().toUpperCase(),
        resourceType.trim().toLowerCase(),
        resourceId ?? null,
        context.requestId ?? null,
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
}
