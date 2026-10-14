import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class NetworkIntelligenceService {
  constructor(@Inject(PG_POOL) private readonly db: Pool, private readonly config: ConfigService, private readonly audit: AuditService) {}

  async topology(tenantId: string) {
    const [routers, assets, links] = await Promise.all([
      this.db.query(`SELECT id, name, vendor, model, status, location_id AS "locationId", ip_address AS "ipAddress", last_seen_at AS "lastSeenAt" FROM routers WHERE tenant_id=$1 ORDER BY name LIMIT 2000`, [tenantId]),
      this.db.query(`SELECT id, asset_type AS type, name, asset_code AS code, status, latitude, longitude, parent_asset_id AS "parentAssetId", router_id AS "routerId" FROM fiber_network_assets WHERE tenant_id=$1 ORDER BY name LIMIT 5000`, [tenantId]),
      this.db.query(`SELECT id,source_type AS "sourceType",source_id AS "sourceId",target_type AS "targetType",target_id AS "targetId",link_type AS "linkType",capacity_bps AS "capacityBps",status,metadata FROM network_topology_links WHERE tenant_id=$1 ORDER BY updated_at DESC LIMIT 10000`, [tenantId]),
    ]);
    return { nodes: [...routers.rows.map((r) => ({ ...r, type: 'ROUTER' })), ...assets.rows], edges: links.rows, generatedAt: new Date().toISOString(), limitations: ['Only explicitly inventoried assets and links are shown; undiscovered links are not inferred.'] };
  }

  async capacity(tenantId: string) {
    const result = await this.db.query(`
      WITH latest AS (
        SELECT DISTINCT ON (resource_type,resource_id,metric_type) resource_type,resource_id,metric_type,metric_value,sampled_at
        FROM network_telemetry_samples WHERE tenant_id=$1 AND metric_type IN ('RX_BPS','TX_BPS','UTILIZATION_PCT')
          AND sampled_at > now()-interval '30 days'
        ORDER BY resource_type,resource_id,metric_type,sampled_at DESC
      ), peaks AS (
        SELECT resource_type,resource_id,metric_type,MAX(metric_value) AS peak_value,
          AVG(metric_value) AS average_value,MAX(sampled_at) AS last_sample_at
        FROM network_telemetry_samples WHERE tenant_id=$1 AND metric_type IN ('RX_BPS','TX_BPS','UTILIZATION_PCT')
          AND sampled_at > now()-interval '30 days'
        GROUP BY resource_type,resource_id,metric_type
      )
      SELECT p.resource_type AS "resourceType",p.resource_id AS "resourceId",p.metric_type AS "metricType",
        p.peak_value AS "peakValue",p.average_value AS "averageValue",p.last_sample_at AS "lastSampleAt",
        l.metric_value AS "latestValue",l.sampled_at AS "latestSampleAt",
        CASE WHEN p.metric_type='UTILIZATION_PCT' AND p.peak_value>=90 THEN 'UPGRADE_RECOMMENDED'
             WHEN p.metric_type='UTILIZATION_PCT' AND p.peak_value>=75 THEN 'WATCH'
             ELSE 'NORMAL' END AS assessment
      FROM peaks p LEFT JOIN latest l USING(resource_type,resource_id,metric_type)
      ORDER BY CASE WHEN p.metric_type='UTILIZATION_PCT' AND p.peak_value>=90 THEN 0
                    WHEN p.metric_type='UTILIZATION_PCT' AND p.peak_value>=75 THEN 1 ELSE 2 END,
               p.peak_value DESC LIMIT 500`, [tenantId]);
    return { data: result.rows, windowDays: 30, thresholds: { watchPct: 75, upgradeRecommendedPct: 90 }, generatedAt: new Date().toISOString(), confidence: result.rowCount ? 'TELEMETRY_BACKED' : 'NO_TELEMETRY', note: 'Forecasting requires consistent historical samples and known link capacities; these are observed peaks, not a statistical forecast.' };
  }

  private encryptionKey() {
    const raw = this.config.get<string>('DEVICE_CONFIG_ENCRYPTION_KEY');
    if (!raw) throw new ServiceUnavailableException('DEVICE_CONFIG_ENCRYPTION_KEY is not configured; device configuration backup is disabled');
    let key: Buffer;
    if (/^[a-f0-9]{64}$/i.test(raw)) key = Buffer.from(raw, 'hex');
    else key = Buffer.from(raw, 'base64');
    if (key.length !== 32) throw new ServiceUnavailableException('DEVICE_CONFIG_ENCRYPTION_KEY must decode to exactly 32 bytes');
    return key;
  }

  private encrypt(plaintext: string) {
    const key = this.encryptionKey(), iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return { payload: [iv.toString('base64'), cipher.getAuthTag().toString('base64'), ciphertext.toString('base64')].join('.'), keyId: createHash('sha256').update(key).digest('hex').slice(0, 16) };
  }

  private decrypt(payload: string) {
    const [iv, tag, ciphertext] = payload.split('.');
    if (!iv || !tag || !ciphertext) throw new ConflictException('Stored configuration payload is malformed');
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
  }

  async listVersions(tenantId: string, routerId: string) {
    const router = await this.db.query('SELECT id FROM routers WHERE tenant_id=$1 AND id=$2', [tenantId, routerId]);
    if (!router.rowCount) throw new NotFoundException('Router not found in this tenant');
    const result = await this.db.query(`SELECT id,"router_id" AS "routerId",version_number AS "versionNumber",payload_sha256 AS "payloadSha256",source,change_summary AS "changeSummary",created_by AS "createdBy",created_at AS "createdAt" FROM device_config_versions WHERE tenant_id=$1 AND router_id=$2 ORDER BY version_number DESC LIMIT 100`, [tenantId, routerId]);
    return { data: result.rows };
  }

  async createVersion(tenantId: string, actorId: string, routerId: string, body: { configuration?: unknown; source?: string; changeSummary?: string }, context: { requestId?: string; ipAddress?: string }) {
    if (body.configuration === undefined || body.configuration === null) throw new BadRequestException('configuration is required');
    const source = body.source ?? 'MANUAL';
    if (!['MANUAL','DEVICE_READ','PRE_CHANGE','ROLLBACK_CAPTURE'].includes(source)) throw new BadRequestException('Unsupported configuration source');
    const router = await this.db.query('SELECT id FROM routers WHERE tenant_id=$1 AND id=$2 FOR SHARE', [tenantId, routerId]);
    if (!router.rowCount) throw new NotFoundException('Router not found in this tenant');
    const plaintext = JSON.stringify(body.configuration);
    if (Buffer.byteLength(plaintext, 'utf8') > 2_000_000) throw new BadRequestException('Configuration exceeds 2 MB');
    const encrypted = this.encrypt(plaintext), hash = createHash('sha256').update(plaintext).digest('hex');
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const next = await client.query('SELECT COALESCE(MAX(version_number),0)+1 AS n FROM device_config_versions WHERE tenant_id=$1 AND router_id=$2 FOR UPDATE', [tenantId, routerId]);
      const saved = await client.query(`INSERT INTO device_config_versions(tenant_id,router_id,version_number,encrypted_payload,payload_sha256,encryption_key_id,source,change_summary,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,version_number AS "versionNumber",payload_sha256 AS "payloadSha256",source,created_at AS "createdAt"`,
        [tenantId,routerId,Number(next.rows[0].n),encrypted.payload,hash,encrypted.keyId,source,body.changeSummary?.slice(0,500)??null,actorId]);
      await client.query('COMMIT');
      await this.audit.record(tenantId,'DEVICE_CONFIG_VERSION_CREATED','device_config_version',saved.rows[0].id,{routerId,versionNumber:saved.rows[0].versionNumber,source,payloadSha256:hash},{userId:actorId,requestId:context.requestId,ipAddress:context.ipAddress});
      return saved.rows[0];
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }

  async diff(tenantId: string, routerId: string, fromId: string, toId: string) {
    const rows = await this.db.query(`SELECT id,version_number AS "versionNumber",encrypted_payload AS payload,payload_sha256 AS hash FROM device_config_versions WHERE tenant_id=$1 AND router_id=$2 AND id=ANY($3::uuid[])`, [tenantId,routerId,[fromId,toId]]);
    if (rows.rowCount !== 2) throw new NotFoundException('Both configuration versions must belong to this tenant and router');
    const a=rows.rows.find((r)=>r.id===fromId), b=rows.rows.find((r)=>r.id===toId);
    const before=JSON.parse(this.decrypt(a.payload)), after=JSON.parse(this.decrypt(b.payload));
    return { from:{id:a.id,versionNumber:a.versionNumber,sha256:a.hash},to:{id:b.id,versionNumber:b.versionNumber,sha256:b.hash},equal:a.hash===b.hash,before,after, note:'Structured JSON comparison: consumers should render key-level diffs; raw secrets must not be included in configuration payloads.' };
  }

  async requestRestore(tenantId: string, actorId: string, routerId: string, versionId: string, context: { requestId?: string; ipAddress?: string }) {
    const target=await this.db.query('SELECT id FROM device_config_versions WHERE tenant_id=$1 AND router_id=$2 AND id=$3',[tenantId,routerId,versionId]);
    if(!target.rowCount) throw new NotFoundException('Configuration version not found for this router and tenant');
    const pending=await this.db.query(`SELECT id FROM device_config_restore_requests WHERE tenant_id=$1 AND router_id=$2 AND status IN ('PENDING_APPROVAL','APPROVED','EXECUTING') LIMIT 1`,[tenantId,routerId]);
    if(pending.rowCount) throw new ConflictException('A restore request is already active for this router');
    const result=await this.db.query(`INSERT INTO device_config_restore_requests(tenant_id,router_id,target_version_id,requested_by) VALUES($1,$2,$3,$4) RETURNING id,status,created_at AS "createdAt"`,[tenantId,routerId,versionId,actorId]);
    await this.audit.record(tenantId,'DEVICE_CONFIG_RESTORE_REQUESTED','device_config_restore_request',result.rows[0].id,{routerId,versionId,status:result.rows[0].status},{userId:actorId,requestId:context.requestId,ipAddress:context.ipAddress});
    return { ...result.rows[0], executionStatus:'NOT_EXECUTED', message:'Restore is approval-gated. No device configuration has been changed; an enabled vendor executor and post-change read-back are required before execution.' };
  }
}
