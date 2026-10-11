import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditContext, AuditService } from '../audit/audit.service';
import { SessionsService } from '../sessions/sessions.service';
import { AccessState, ChangeAccessStateDto, CreateNetworkJobDto, CreateNetworkSiteDto, JobStatus, ListQueryDto, UpdateNetworkJobDto, CreateAccessBindingDto, OfflineJobOperationType, SyncOfflineOperationsDto } from './isp-operations.dto';

type AccessRow = { id: string; customer_id: string; router_id: string | null; package_id: string | null; username: string; access_type: string; state: AccessState; external_reference: string | null; activated_at: Date | null; suspended_at: Date | null; expires_at: Date | null; created_at: Date; updated_at: Date };

@Injectable()
export class IspOperationsService {
  readonly moduleName = 'isp-operations';
  constructor(@Inject(PG_POOL) private readonly db: Pool, private readonly sessions: SessionsService, private readonly audit: AuditService) {}

  async listAccessBindings(tenantId: string, query: ListQueryDto) {
    const offset = (query.page - 1) * query.limit;
    const search = query.search?.trim() || null;
    const [data, count] = await Promise.all([
      this.db.query(`SELECT b.id,b.customer_id AS "customerId",c.full_name AS "customerName",b.router_id AS "routerId",b.package_id AS "packageId",b.username,b.access_type AS "accessType",b.state,b.external_reference AS "externalReference",b.activated_at AS "activatedAt",b.suspended_at AS "suspendedAt",b.expires_at AS "expiresAt",b.created_at AS "createdAt" FROM customer_access_bindings b JOIN customers c ON c.tenant_id=b.tenant_id AND c.id=b.customer_id WHERE b.tenant_id=$1 AND ($2::text IS NULL OR b.username ILIKE '%'||$2||'%' OR c.full_name ILIKE '%'||$2||'%') ORDER BY b.created_at DESC LIMIT $3 OFFSET $4`, [tenantId, search, query.limit, offset]),
      this.db.query(`SELECT COUNT(*)::int AS count FROM customer_access_bindings b JOIN customers c ON c.tenant_id=b.tenant_id AND c.id=b.customer_id WHERE b.tenant_id=$1 AND ($2::text IS NULL OR b.username ILIKE '%'||$2||'%' OR c.full_name ILIKE '%'||$2||'%')`, [tenantId, search]),
    ]);
    const total = count.rows[0]?.count ?? 0;
    return { data: data.rows, pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) } };
  }

  async createAccessBinding(tenantId: string, input: CreateAccessBindingDto) {
    try {
      const result = await this.db.query<AccessRow>(`INSERT INTO customer_access_bindings (tenant_id,customer_id,router_id,package_id,username,access_type,state,external_reference,expires_at) VALUES ($1,$2,$3,$4,$5,$6,'PENDING',$7,$8) RETURNING *`, [tenantId, input.customerId, input.routerId ?? null, input.packageId ?? null, input.username.trim(), input.accessType, input.externalReference?.trim() || null, input.expiresAt ?? null]);
      return this.mapAccess(result.rows[0]);
    } catch (error: unknown) {
      const code = this.pgCode(error);
      if (code === '23505') throw new ConflictException('Access username already exists for this tenant');
      if (code === '23503') throw new NotFoundException('Referenced customer, router, or package was not found');
      throw error;
    }
  }

  async changeAccessState(tenantId: string, id: string, input: ChangeAccessStateDto, auditContext: AuditContext = {}) {
    const client = await this.db.connect();
    let committed = false;
    try {
      await client.query('BEGIN');
      const current = await client.query<AccessRow>('SELECT * FROM customer_access_bindings WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [tenantId, id]);
      if (!current.rowCount) throw new NotFoundException('Access binding not found');
      const row = current.rows[0];
      if (row.state === input.state) {
        await client.query('COMMIT');
        committed = true;
        return this.mapAccess(row);
      }
      const now = new Date();
      const activatedAt = input.state === AccessState.ACTIVE && !row.activated_at ? now : row.activated_at;
      const suspendedAt = input.state === AccessState.SUSPENDED ? now : null;
      const updated = await client.query<AccessRow>(`UPDATE customer_access_bindings SET state=$3,activated_at=$4,suspended_at=$5,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *`, [tenantId, id, input.state, activatedAt, suspendedAt]);
      await client.query(`INSERT INTO access_state_events (tenant_id,access_binding_id,previous_state,new_state,reason,source,payment_id) VALUES ($1,$2,$3,$4,$5,'API',$6)`, [tenantId, id, row.state, input.state, input.reason.trim(), input.paymentId ?? null]);
      await client.query('COMMIT');
      committed = true;

      let reconciliation: Record<string, unknown> = { expiredGrants: 0, sessions: [], state: 'NOT_ATTEMPTED' };
      try {
        reconciliation = { ...(await this.sessions.reconcileAccessState(tenantId, { requestId: `access-binding:${id}` })), state: 'COMPLETED' };
      } catch (error: unknown) {
        reconciliation = { ...reconciliation, state: 'FAILED', error: error instanceof Error ? error.message : 'Access reconciliation failed' };
      }

      let auditResult: Record<string, unknown> = { state: 'COMPLETED' };
      try {
        await this.audit.record(tenantId, 'ACCESS_STATE_CHANGED', 'customer_access_binding', id, {
          customerId: row.customer_id,
          routerId: row.router_id,
          previousState: row.state,
          newState: input.state,
          reason: input.reason.trim(),
          paymentId: input.paymentId ?? null,
          reconciliationState: reconciliation.state ?? 'COMPLETED',
        }, auditContext);
      } catch (error: unknown) {
        auditResult = { state: 'FAILED', error: error instanceof Error ? error.message : 'Audit recording failed after access state commit' };
      }
      return { ...this.mapAccess(updated.rows[0]), reconciliation, audit: auditResult };
    } catch (error: unknown) {
      if (!committed) await client.query('ROLLBACK').catch(() => undefined);
      if (this.pgCode(error) === '23503') throw new NotFoundException('Payment was not found for this tenant');
      throw error;
    } finally { client.release(); }
  }

  async accessEvents(tenantId: string, accessBindingId: string) {
    const binding = await this.db.query('SELECT 1 FROM customer_access_bindings WHERE tenant_id=$1 AND id=$2', [tenantId, accessBindingId]);
    if (!binding.rowCount) throw new NotFoundException('Access binding not found');
    const result = await this.db.query(`SELECT e.id,e.previous_state AS "previousState",e.new_state AS "newState",e.reason,e.source,e.payment_id AS "paymentId",e.created_at AS "createdAt" FROM access_state_events e WHERE e.tenant_id=$1 AND e.access_binding_id=$2 ORDER BY e.created_at DESC`, [tenantId, accessBindingId]);
    return result.rows;
  }

  async listJobs(tenantId: string, query: ListQueryDto) {
    const offset = (query.page - 1) * query.limit;
    const search = query.search?.trim() || null;
    const [data, count] = await Promise.all([
      this.db.query(`SELECT j.id,j.customer_id AS "customerId",c.full_name AS "customerName",j.site_id AS "siteId",s.name AS "siteName",j.assigned_user_id AS "assignedUserId",j.job_type AS "jobType",j.status,j.priority,j.title,j.description,j.scheduled_at AS "scheduledAt",j.completed_at AS "completedAt",j.created_at AS "createdAt" FROM network_jobs j LEFT JOIN customers c ON c.tenant_id=j.tenant_id AND c.id=j.customer_id LEFT JOIN network_sites s ON s.tenant_id=j.tenant_id AND s.id=j.site_id WHERE j.tenant_id=$1 AND ($2::text IS NULL OR j.title ILIKE '%'||$2||'%' OR j.description ILIKE '%'||$2||'%' OR c.full_name ILIKE '%'||$2||'%') ORDER BY CASE j.priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'NORMAL' THEN 3 ELSE 4 END,j.scheduled_at NULLS LAST,j.created_at DESC LIMIT $3 OFFSET $4`, [tenantId, search, query.limit, offset]),
      this.db.query(`SELECT COUNT(*)::int AS count FROM network_jobs j LEFT JOIN customers c ON c.tenant_id=j.tenant_id AND c.id=j.customer_id WHERE j.tenant_id=$1 AND ($2::text IS NULL OR j.title ILIKE '%'||$2||'%' OR j.description ILIKE '%'||$2||'%' OR c.full_name ILIKE '%'||$2||'%')`, [tenantId, search]),
    ]);
    const total = count.rows[0]?.count ?? 0;
    return { data: data.rows, pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) } };
  }

  async createJob(tenantId: string, input: CreateNetworkJobDto, actorUserId: string) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(`INSERT INTO network_jobs (tenant_id,customer_id,site_id,assigned_user_id,job_type,priority,title,description,scheduled_at) VALUES ($1,$2,$3,$4,$5,COALESCE($6,'NORMAL'),$7,$8,$9) RETURNING *`, [tenantId, input.customerId ?? null, input.siteId ?? null, input.assignedUserId ?? null, input.jobType, input.priority ?? null, input.title.trim(), input.description?.trim() || null, input.scheduledAt ?? null]);
      const job = result.rows[0];
      await client.query(`INSERT INTO network_job_events (tenant_id,job_id,actor_user_id,event_type,to_status,note) VALUES ($1,$2,$3,'CREATED',$4,$5)`, [tenantId, job.id, actorUserId, job.status, input.description?.trim() || null]);
      await client.query('COMMIT');
      return job;
    } catch (error: unknown) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (this.pgCode(error) === '23503') throw new NotFoundException('Referenced customer, site, or user was not found');
      throw error;
    } finally { client.release(); }
  }

  async updateJob(tenantId: string, id: string, input: UpdateNetworkJobDto, actorUserId: string) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query('SELECT * FROM network_jobs WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [tenantId, id]);
      if (!current.rowCount) throw new NotFoundException('Network job not found');
      const row = current.rows[0];
      const status = input.status ?? row.status;
      const completedAt = status === JobStatus.COMPLETED ? row.completed_at ?? new Date() : null;
      const result = await client.query(`UPDATE network_jobs SET assigned_user_id=$3,priority=$4,status=$5,description=$6,scheduled_at=$7,completed_at=$8,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *`, [tenantId, id, input.assignedUserId ?? row.assigned_user_id, input.priority ?? row.priority, status, input.description?.trim() ?? row.description, input.scheduledAt ?? row.scheduled_at, completedAt]);
      if (status !== row.status || input.note) await client.query(`INSERT INTO network_job_events (tenant_id,job_id,actor_user_id,event_type,from_status,to_status,note) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [tenantId, id, actorUserId, status === row.status ? 'NOTE' : 'STATUS_CHANGED', row.status, status, input.note?.trim() || null]);
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  async jobEvents(tenantId: string, jobId: string) {
    const job = await this.db.query('SELECT 1 FROM network_jobs WHERE tenant_id=$1 AND id=$2', [tenantId, jobId]);
    if (!job.rowCount) throw new NotFoundException('Network job not found');
    const result = await this.db.query(`SELECT e.id,e.event_type AS "eventType",e.from_status AS "fromStatus",e.to_status AS "toStatus",e.note,e.actor_user_id AS "actorUserId",e.created_at AS "createdAt" FROM network_job_events e WHERE e.tenant_id=$1 AND e.job_id=$2 ORDER BY e.created_at DESC`, [tenantId, jobId]);
    return result.rows;
  }

  async listSites(tenantId: string, query: ListQueryDto) {
    const offset = (query.page - 1) * query.limit;
    const search = query.search?.trim() || null;
    const [data, count] = await Promise.all([
      this.db.query(`SELECT id,location_id AS "locationId",name,site_type AS "siteType",status,parent_site_id AS "parentSiteId",latitude,longitude,created_at AS "createdAt",updated_at AS "updatedAt" FROM network_sites WHERE tenant_id=$1 AND ($2::text IS NULL OR name ILIKE '%'||$2||'%') ORDER BY name LIMIT $3 OFFSET $4`, [tenantId, search, query.limit, offset]),
      this.db.query(`SELECT COUNT(*)::int AS count FROM network_sites WHERE tenant_id=$1 AND ($2::text IS NULL OR name ILIKE '%'||$2||'%')`, [tenantId, search]),
    ]);
    const total = count.rows[0]?.count ?? 0;
    return { data: data.rows, pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) } };
  }

  async createSite(tenantId: string, input: CreateNetworkSiteDto) {
    if (input.parentSiteId) {
      const parent = await this.db.query('SELECT 1 FROM network_sites WHERE tenant_id=$1 AND id=$2', [tenantId, input.parentSiteId]);
      if (!parent.rowCount) throw new NotFoundException('Parent network site was not found');
    }
    try {
      const result = await this.db.query(`INSERT INTO network_sites (tenant_id,location_id,name,site_type,status,parent_site_id,latitude,longitude) VALUES ($1,$2,$3,COALESCE($4,'POP'),COALESCE($5,'ACTIVE'),$6,$7,$8) RETURNING id,location_id AS "locationId",name,site_type AS "siteType",status,parent_site_id AS "parentSiteId",latitude,longitude,created_at AS "createdAt",updated_at AS "updatedAt"`, [tenantId, input.locationId ?? null, input.name.trim(), input.siteType ?? null, input.status ?? null, input.parentSiteId ?? null, input.latitude ?? null, input.longitude ?? null]);
      return result.rows[0];
    } catch (error: unknown) {
      const code = this.pgCode(error);
      if (code === '23505') throw new ConflictException('Network site name already exists for this tenant');
      if (code === '23503') throw new NotFoundException('Referenced location or parent site was not found');
      throw error;
    }
  }

  async syncOfflineOperations(tenantId: string, actorUserId: string, input: SyncOfflineOperationsDto, context: AuditContext = {}) {
    if (!Array.isArray(input.operations) || input.operations.length < 1 || input.operations.length > 100) {
      throw new BadRequestException('Sync must contain between 1 and 100 operations');
    }
    const client = await this.db.connect();
    const results: Array<Record<string, unknown>> = [];
    let acceptedCount = 0;
    let replayedCount = 0;
    const allowedTransitions: Record<JobStatus, JobStatus[]> = {
      [JobStatus.OPEN]: [JobStatus.ASSIGNED, JobStatus.IN_PROGRESS, JobStatus.CANCELED],
      [JobStatus.ASSIGNED]: [JobStatus.OPEN, JobStatus.IN_PROGRESS, JobStatus.BLOCKED, JobStatus.CANCELED],
      [JobStatus.IN_PROGRESS]: [JobStatus.ASSIGNED, JobStatus.BLOCKED, JobStatus.COMPLETED, JobStatus.CANCELED],
      [JobStatus.BLOCKED]: [JobStatus.ASSIGNED, JobStatus.IN_PROGRESS, JobStatus.CANCELED],
      [JobStatus.COMPLETED]: [],
      [JobStatus.CANCELED]: [],
    };
    try {
      await client.query('BEGIN');
      for (const operation of input.operations) {
        const claimed = await client.query(
          `INSERT INTO network_job_sync_receipts
            (tenant_id,operation_id,job_id,operation_type,client_occurred_at)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (tenant_id,operation_id) DO NOTHING
           RETURNING operation_id`,
          [tenantId, operation.operationId, operation.jobId, operation.operationType, operation.clientOccurredAt ?? null],
        );
        if (!claimed.rowCount) {
          const previous = await client.query(
            'SELECT job_id AS "jobId",operation_type AS "operationType",result FROM network_job_sync_receipts WHERE tenant_id=$1 AND operation_id=$2',
            [tenantId, operation.operationId],
          );
          if (!previous.rowCount) throw new ConflictException('Unable to resolve an idempotency receipt');
          if (previous.rows[0].jobId !== operation.jobId || previous.rows[0].operationType !== operation.operationType) {
            throw new ConflictException('An operation ID cannot be reused for a different job or operation type');
          }
          results.push({ ...(previous.rows[0].result ?? {}), replayed: true });
          replayedCount += 1;
          continue;
        }

        const jobResult = await client.query(
          'SELECT id,status FROM network_jobs WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
          [tenantId, operation.jobId],
        );
        if (!jobResult.rowCount) throw new NotFoundException('A synced network job was not found in this tenant');
        const currentStatus = jobResult.rows[0].status as JobStatus;
        if (operation.expectedStatus && operation.expectedStatus !== currentStatus) {
          throw new ConflictException('Offline job update is stale; refresh the job before syncing this operation');
        }

        if (operation.operationType === OfflineJobOperationType.NOTE_ADDED) {
          const note = operation.note?.trim();
          if (!note) throw new BadRequestException('NOTE_ADDED operations require a non-empty note');
          await client.query(
            `INSERT INTO network_job_events (tenant_id,job_id,actor_user_id,event_type,from_status,to_status,note)
             VALUES ($1,$2,$3,'NOTE',$4,$4,$5)`,
            [tenantId, operation.jobId, actorUserId, currentStatus, note],
          );
        } else if (operation.operationType === OfflineJobOperationType.STATUS_CHANGED) {
          if (!operation.status) throw new BadRequestException('STATUS_CHANGED operations require a status');
          if (operation.status !== currentStatus && !allowedTransitions[currentStatus]?.includes(operation.status)) {
            throw new ConflictException('This work-order status transition is not permitted');
          }
          if (operation.status !== currentStatus) {
            await client.query(
              `UPDATE network_jobs
               SET status=$3,completed_at=CASE WHEN $3='COMPLETED' THEN COALESCE(completed_at,now()) ELSE NULL END,updated_at=now()
               WHERE tenant_id=$1 AND id=$2`,
              [tenantId, operation.jobId, operation.status],
            );
            await client.query(
              `INSERT INTO network_job_events (tenant_id,job_id,actor_user_id,event_type,from_status,to_status,note)
               VALUES ($1,$2,$3,'OFFLINE_STATUS_CHANGED',$4,$5,$6)`,
              [tenantId, operation.jobId, actorUserId, currentStatus, operation.status, operation.note?.trim() || null],
            );
          }
        } else if (operation.operationType === OfflineJobOperationType.CHECKLIST_ITEM_SET) {
          if (!operation.itemKey?.trim() || !operation.itemLabel?.trim() || typeof operation.checked !== 'boolean') {
            throw new BadRequestException('CHECKLIST_ITEM_SET operations require itemKey, itemLabel and checked');
          }
          await client.query(
            `INSERT INTO network_job_checklist_items
              (tenant_id,job_id,item_key,label,is_checked,checked_by,checked_at,updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,CASE WHEN $5 THEN now() ELSE NULL END,now())
             ON CONFLICT (tenant_id,job_id,item_key) DO UPDATE
               SET label=EXCLUDED.label,is_checked=EXCLUDED.is_checked,checked_by=EXCLUDED.checked_by,
                   checked_at=EXCLUDED.checked_at,updated_at=now()`,
            [tenantId, operation.jobId, operation.itemKey.trim(), operation.itemLabel.trim(), operation.checked, actorUserId],
          );
        }

        const result = { operationId: operation.operationId, jobId: operation.jobId, operationType: operation.operationType, accepted: true, replayed: false };
        await client.query(
          'UPDATE network_job_sync_receipts SET result=$3::jsonb WHERE tenant_id=$1 AND operation_id=$2',
          [tenantId, operation.operationId, JSON.stringify(result)],
        );
        results.push(result);
        acceptedCount += 1;
      }

      if (acceptedCount > 0) {
        await client.query(
          `INSERT INTO audit_logs
            (tenant_id,actor_user_id,action,resource_type,request_id,correlation_id,ip_address,user_agent,metadata)
           VALUES ($1,$2,'FIELD_OFFLINE_SYNCED','network_job',$3,$4,$5,$6,$7::jsonb)`,
          [tenantId, actorUserId, context.requestId ?? null, context.correlationId ?? null,
           context.ipAddress ?? null, context.userAgent ?? null, JSON.stringify({ acceptedCount, replayedCount })],
        );
      }
      await client.query('COMMIT');
      return { acceptedCount, replayedCount, results };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  async listJobChecklist(tenantId: string, jobId: string) {
    const job = await this.db.query('SELECT 1 FROM network_jobs WHERE tenant_id=$1 AND id=$2', [tenantId, jobId]);
    if (!job.rowCount) throw new NotFoundException('Network job not found');
    const result = await this.db.query(
      `SELECT id,item_key AS "itemKey",label,is_checked AS checked,checked_by AS "checkedBy",
              checked_at AS "checkedAt",updated_at AS "updatedAt"
       FROM network_job_checklist_items WHERE tenant_id=$1 AND job_id=$2 ORDER BY item_key`,
      [tenantId, jobId],
    );
    return { data: result.rows, count: result.rowCount ?? 0 };
  }

  async listJobAttachments(tenantId: string, jobId: string) {
    const job = await this.db.query('SELECT 1 FROM network_jobs WHERE tenant_id=$1 AND id=$2', [tenantId, jobId]);
    if (!job.rowCount) throw new NotFoundException('Network job not found');
    const result = await this.db.query(
      `SELECT id,file_name AS "fileName",content_type AS "contentType",byte_size AS "byteSize",
              sha256,created_by AS "createdBy",created_at AS "createdAt"
       FROM network_job_attachments WHERE tenant_id=$1 AND job_id=$2 ORDER BY created_at DESC`,
      [tenantId, jobId],
    );
    return { data: result.rows, count: result.rowCount ?? 0 };
  }

  async uploadJobAttachment(tenantId: string, jobId: string, actorUserId: string, idempotencyKey: string, file: { originalname: string; mimetype: string; buffer: Buffer; size: number }, context: AuditContext = {}) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) throw new BadRequestException('A UUID Idempotency-Key header is required for photo uploads');
    if (!file?.buffer?.length || file.buffer.length > 5 * 1024 * 1024) {
      throw new BadRequestException('A photo between 1 byte and 5 MB is required');
    }
    const contentType = file.mimetype;
    const jpeg = file.buffer.length >= 3 && file.buffer[0] === 0xff && file.buffer[1] === 0xd8 && file.buffer[2] === 0xff;
    const png = file.buffer.length >= 8 && file.buffer.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
    const webp = file.buffer.length >= 12 && file.buffer.toString('ascii',0,4) === 'RIFF' && file.buffer.toString('ascii',8,12) === 'WEBP';
    if (!((contentType === 'image/jpeg' && jpeg) || (contentType === 'image/png' && png) || (contentType === 'image/webp' && webp))) {
      throw new BadRequestException('Only valid JPEG, PNG or WebP image files are accepted');
    }
    const safeName = basename(file.originalname.replace(/\\/g,'/')).replace(/[^a-zA-Z0-9._ -]/g,'_').slice(0,180) || 'field-photo';
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const job = await client.query('SELECT id FROM network_jobs WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [tenantId, jobId]);
      if (!job.rowCount) throw new NotFoundException('Network job not found');
      const prior = await client.query(
        `SELECT id,file_name AS "fileName",content_type AS "contentType",byte_size AS "byteSize",sha256,created_at AS "createdAt"
         FROM network_job_attachments WHERE tenant_id=$1 AND job_id=$2 AND client_photo_id=$3`,
        [tenantId, jobId, idempotencyKey],
      );
      if (prior.rowCount) {
        await client.query('COMMIT');
        return { ...prior.rows[0], replayed: true };
      }
      const inserted = await client.query(
        `INSERT INTO network_job_attachments
          (tenant_id,job_id,client_photo_id,file_name,content_type,content,byte_size,sha256,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id,file_name AS "fileName",content_type AS "contentType",byte_size AS "byteSize",sha256,created_at AS "createdAt"`,
        [tenantId, jobId, idempotencyKey, safeName, contentType, file.buffer, file.buffer.length, checksum, actorUserId],
      );
      await client.query(
        `INSERT INTO audit_logs
          (tenant_id,actor_user_id,action,resource_type,resource_id,request_id,correlation_id,ip_address,user_agent,metadata)
         VALUES ($1,$2,'FIELD_PHOTO_UPLOADED','network_job_attachment',$3,$4,$5,$6,$7,$8::jsonb)`,
        [tenantId, actorUserId, inserted.rows[0].id, context.requestId ?? null, context.correlationId ?? null,
         context.ipAddress ?? null, context.userAgent ?? null, JSON.stringify({ jobId, contentType, byteSize: file.buffer.length, sha256: checksum })],
      );
      await client.query('COMMIT');
      return inserted.rows[0];
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  async getJobAttachment(tenantId: string, jobId: string, attachmentId: string) {
    const result = await this.db.query(
      `SELECT file_name AS "fileName",content_type AS "contentType",content,byte_size AS "byteSize",sha256
       FROM network_job_attachments WHERE tenant_id=$1 AND job_id=$2 AND id=$3`,
      [tenantId, jobId, attachmentId],
    );
    if (!result.rowCount) throw new NotFoundException('Field photo not found');
    return result.rows[0] as { fileName: string; contentType: string; content: Buffer; byteSize: number; sha256: string };
  }

  private mapAccess(row: AccessRow) {
    return { id: row.id, customerId: row.customer_id, routerId: row.router_id, packageId: row.package_id, username: row.username, accessType: row.access_type, state: row.state, externalReference: row.external_reference, activatedAt: row.activated_at, suspendedAt: row.suspended_at, expiresAt: row.expires_at, createdAt: row.created_at, updatedAt: row.updated_at };
  }

  private pgCode(error: unknown): string | undefined {
    if (typeof error === 'object' && error !== null && 'code' in error) return (error as { code?: string }).code;
    return undefined;
  }
}
