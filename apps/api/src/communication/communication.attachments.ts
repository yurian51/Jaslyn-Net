import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PG_POOL } from '../database/database.module';
import { AuditService } from '../audit/audit.service';
import { CommunicationService } from './communication.service';

type Actor = { userId:string; tenantId:string; role:string };

const MAX_BYTES = 50 * 1024 * 1024;
const MIME_TYPES = new Set([
  'image/jpeg','image/png','image/webp','image/gif',
  'application/pdf','text/plain',
  'application/zip','application/json',
  'audio/mpeg','audio/wav','audio/ogg','audio/webm','audio/mp4',
  'video/mp4','video/webm','video/quicktime',
  'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

@Injectable()
export class CommunicationAttachmentService {
  private readonly client: S3Client | null;
  private readonly bucket: string;
  private readonly scanRequired: boolean;

  constructor(
    @Inject(PG_POOL) private readonly db: Pool,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly communication: CommunicationService,
  ) {
    const endpoint = config.get<string>('OBJECT_STORAGE_ENDPOINT');
    const region = config.get<string>('OBJECT_STORAGE_REGION') || 'us-east-1';
    this.bucket = config.get<string>('OBJECT_STORAGE_BUCKET') || '';
    this.scanRequired = config.get<string>('ATTACHMENT_SCAN_REQUIRED') !== 'false';
    if (endpoint && this.bucket) {
      this.client = new S3Client({
        region,
        endpoint,
        forcePathStyle: config.get<string>('OBJECT_STORAGE_FORCE_PATH_STYLE') !== 'false',
        credentials: {
          accessKeyId: config.get<string>('OBJECT_STORAGE_ACCESS_KEY') || '',
          secretAccessKey: config.get<string>('OBJECT_STORAGE_SECRET_KEY') || '',
        },
      });
    } else {
      this.client = null;
    }
  }

  async createUpload(actor: Actor, messageId: string, input: { fileName:string; mimeType:string; sizeBytes:number; durationMs?:number; metadata?:Record<string,unknown> }) {
    await this.communication.assertMessageAccess(actor, messageId);
    const fileName = input.fileName.trim().replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,180);
    const mimeType = input.mimeType.trim().toLowerCase();
    if (!fileName) throw new BadRequestException('File name is required');
    if (!MIME_TYPES.has(mimeType)) throw new BadRequestException('Unsupported attachment MIME type');
    if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > MAX_BYTES) {
      throw new BadRequestException(`Attachment size must be between 1 byte and ${MAX_BYTES} bytes`);
    }
    if (input.durationMs != null && (!Number.isSafeInteger(input.durationMs) || input.durationMs < 0 || input.durationMs > 24 * 60 * 60 * 1000)) {
      throw new BadRequestException('Invalid attachment duration');
    }
    if (!this.client || !this.bucket) throw new ServiceUnavailableException('Private object storage is not configured');

    const attachmentId = randomUUID();
    const key = `tenants/${actor.tenantId}/messages/${messageId}/${attachmentId}/${fileName}`;
    await this.db.query(
      `INSERT INTO message_attachments
       (id,tenant_id,message_id,storage_key,original_name,mime_type,size_bytes,duration_ms,metadata,scan_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,'PENDING')
       RETURNING id,original_name AS "originalName",mime_type AS "mimeType",size_bytes AS "sizeBytes",duration_ms AS "durationMs",scan_status AS "scanStatus"`,
      [attachmentId,actor.tenantId,messageId,key,fileName,mimeType,input.sizeBytes,input.durationMs ?? null,JSON.stringify(input.metadata ?? {})],
    );

    const uploadUrl = await getSignedUrl(this.client, new PutObjectCommand({
      Bucket:this.bucket, Key:key, ContentType:mimeType, ContentLength:input.sizeBytes,
      Metadata:{ 'jaslyn-attachment-id':attachmentId, 'jaslyn-tenant-id':actor.tenantId },
    }), { expiresIn:900 });

    await this.audit.record(actor.tenantId,'ATTACHMENT_UPLOAD_URL_CREATED','message_attachment',attachmentId,{messageId,mimeType,sizeBytes:input.sizeBytes},{userId:actor.userId});
    return { attachmentId, uploadUrl, expiresIn:900, maxBytes:MAX_BYTES, scanRequired: this.scanRequired };
  }

  async completeUpload(actor: Actor, attachmentId: string) {
    const attachment = await this.getOwned(actor, attachmentId);
    if (!this.client || !this.bucket) throw new ServiceUnavailableException('Private object storage is not configured');
    const head = await this.client.send(new HeadObjectCommand({Bucket:this.bucket,Key:attachment.storageKey}));
    const actualSize = Number(head.ContentLength ?? -1);
    const actualType = String(head.ContentType ?? '').toLowerCase();
    if (actualSize !== Number(attachment.sizeBytes) || actualType !== attachment.mimeType) {
      await this.client.send(new DeleteObjectCommand({Bucket:this.bucket,Key:attachment.storageKey})).catch(()=>undefined);
      await this.db.query('DELETE FROM message_attachments WHERE tenant_id=$1 AND id=$2',[actor.tenantId,attachmentId]);
      throw new BadRequestException('Uploaded object metadata does not match the declared attachment');
    }

    let scanStatus: 'PENDING'|'CLEAN'|'INFECTED'|'SKIPPED' = this.scanRequired ? 'PENDING' : 'SKIPPED';
    if (this.scanRequired && this.config.get<string>('ATTACHMENT_SCANNER_URL')) {
      const scan = await this.scanObject(attachment.storageKey, attachmentId);
      if (scan === 'INFECTED') {
        await this.client.send(new DeleteObjectCommand({Bucket:this.bucket,Key:attachment.storageKey})).catch(()=>undefined);
        await this.db.query(
          `UPDATE message_attachments SET uploaded_at=now(),scan_status='INFECTED' WHERE tenant_id=$1 AND id=$2`,
          [actor.tenantId,attachmentId],
        );
        await this.audit.record(actor.tenantId,'ATTACHMENT_REJECTED','message_attachment',attachmentId,{messageId:attachment.messageId,reason:'MALWARE_DETECTED'},{userId:actor.userId});
        throw new BadRequestException('Attachment rejected by security scanner');
      }
      if (scan === 'CLEAN') scanStatus = 'CLEAN';
    }
    await this.db.query(
      `UPDATE message_attachments SET uploaded_at=now(),scan_status=$3 WHERE tenant_id=$1 AND id=$2`,
      [actor.tenantId,attachmentId,scanStatus],
    );
    await this.audit.record(actor.tenantId,'ATTACHMENT_UPLOADED','message_attachment',attachmentId,{messageId:attachment.messageId,scanStatus},{userId:actor.userId});
    return { attachmentId, status:'UPLOADED', scanStatus };
  }

  private async scanObject(storageKey: string, attachmentId: string): Promise<'CLEAN'|'INFECTED'|'PENDING'> {
    if (!this.client || !this.bucket) return 'PENDING';
    const scannerUrl = this.config.get<string>('ATTACHMENT_SCANNER_URL');
    if (!scannerUrl) return 'PENDING';
    try {
      const getUrl = await getSignedUrl(this.client,new GetObjectCommand({Bucket:this.bucket,Key:storageKey}),{expiresIn:300});
      const response = await fetch(scannerUrl,{
        method:'POST',
        headers:{
          'content-type':'application/json',
          ...(this.config.get<string>('ATTACHMENT_SCANNER_TOKEN') ? {authorization:'Bearer '+this.config.get<string>('ATTACHMENT_SCANNER_TOKEN')} : {}),
        },
        body:JSON.stringify({attachmentId,objectKey:storageKey,downloadUrl:getUrl}),
        signal:AbortSignal.timeout(30000),
      });
      if (!response.ok) return 'PENDING';
      const result = await response.json().catch(()=>null);
      if (result?.clean === true) return 'CLEAN';
      if (result?.infected === true || result?.malicious === true) return 'INFECTED';
      return 'PENDING';
    } catch {
      return 'PENDING';
    }
  }

  async getDownloadUrl(actor: Actor, attachmentId: string) {
    const attachment = await this.getOwned(actor, attachmentId);
    if (!this.client || !this.bucket) throw new ServiceUnavailableException('Private object storage is not configured');
    if (attachment.scanStatus !== 'CLEAN' && attachment.scanStatus !== 'SKIPPED') {
      throw new ForbiddenException('Attachment is not available until security scanning is complete');
    }
    const url = await getSignedUrl(this.client,new GetObjectCommand({Bucket:this.bucket,Key:attachment.storageKey}),{expiresIn:300});
    return { attachmentId, url, expiresIn:300, fileName:attachment.originalName, mimeType:attachment.mimeType, sizeBytes:Number(attachment.sizeBytes) };
  }

  async listMessageAttachments(actor: Actor, messageId: string) {
    await this.communication.assertMessageAccess(actor,messageId);
    const result = await this.db.query(
      `SELECT id,original_name AS "originalName",mime_type AS "mimeType",size_bytes AS "sizeBytes",duration_ms AS "durationMs",metadata,scan_status AS "scanStatus",uploaded_at AS "uploadedAt",created_at AS "createdAt"
         FROM message_attachments WHERE tenant_id=$1 AND message_id=$2 ORDER BY created_at ASC`,
      [actor.tenantId,messageId],
    );
    return result.rows;
  }

  private async getOwned(actor: Actor, attachmentId: string) {
    const result = await this.db.query(
      `SELECT id,message_id AS "messageId",storage_key AS "storageKey",original_name AS "originalName",mime_type AS "mimeType",
              size_bytes AS "sizeBytes",scan_status AS "scanStatus"
         FROM message_attachments WHERE tenant_id=$1 AND id=$2`,
      [actor.tenantId,attachmentId],
    );
    if (!result.rowCount) throw new NotFoundException('Attachment not found');
    await this.communication.assertMessageAccess(actor,result.rows[0].messageId);
    return result.rows[0] as {
      id:string; messageId:string; storageKey:string; originalName:string; mimeType:string;
      sizeBytes:number; scanStatus:'PENDING'|'CLEAN'|'INFECTED'|'SKIPPED';
    };
  }
}
