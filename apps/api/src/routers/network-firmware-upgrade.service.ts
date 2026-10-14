import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditContext, AuditService } from '../audit/audit.service';

export interface FirmwareUpgradeRequest {
  targetVersion: string;
  releaseSourceUrl: string;
  idempotencyKey: string;
  hardwareRevision?: string;
  maintenanceWindowStart?: string;
  maintenanceWindowEnd?: string;
  artifactSha256?: string;
}

const SUPPORTED_PROTOCOLS = new Set([
  'MIKROTIK_REST', 'MERAKI_DASHBOARD_API', 'OMADA_CONTROLLER_API', 'UNIFI_NETWORK_API',
  'ARUBA_CENTRAL_API', 'CAMBIUM_CNMAESTRO', 'GRANDSTREAM_GWN_API', 'RUIJIE_REYEE_CLOUD_API',
  'RUCKUS_SMARTZONE_API', 'OPENWRT_UBUS', 'TELTONIKA_RMS_API', 'PEPLINK_INCONTROL_API',
  'PFSENSE_API',
]);

/**
 * Firmware jobs are staged fail-closed. A vendor is not considered executable
 * merely because its telemetry adapter exists. A concrete, tested updater must
 * be registered before approval can transition a job to QUEUED.
 */
@Injectable()
export class NetworkFirmwareUpgradeService {
  constructor(@Inject(PG_POOL) private readonly db: Pool, private readonly audit: AuditService) {}

  async list(tenantId: string, routerId: string) {
    const router = await this.db.query('SELECT id FROM routers WHERE tenant_id=$1 AND id=$2', [tenantId, routerId]);
    if (!router.rowCount) throw new NotFoundException('Router not found');
    const result = await this.db.query(
      `SELECT id, router_id AS "routerId", vendor, management_protocol AS "managementProtocol",
        model, hardware_revision AS "hardwareRevision", installed_version AS "installedVersion",
        target_version AS "targetVersion", release_source_url AS "releaseSourceUrl",
        release_source_verified AS "releaseSourceVerified", artifact_sha256 AS "artifactSha256",
        artifact_signature_verified AS "artifactSignatureVerified", maintenance_window_start AS "maintenanceWindowStart",
        maintenance_window_end AS "maintenanceWindowEnd", status, preview, approval_required AS "approvalRequired",
        requested_by AS "requestedBy", approved_by AS "approvedBy", approved_at AS "approvedAt",
        execution_started_at AS "executionStartedAt", execution_finished_at AS "executionFinishedAt",
        observed_version_after AS "observedVersionAfter", verification_evidence AS "verificationEvidence",
        error_code AS "errorCode", error_message AS "errorMessage", created_at AS "createdAt", updated_at AS "updatedAt"
       FROM network_firmware_upgrade_jobs WHERE tenant_id=$1 AND router_id=$2 ORDER BY created_at DESC LIMIT 100`,
      [tenantId, routerId],
    );
    return { data: result.rows };
  }

  async preview(tenantId: string, routerId: string, input: FirmwareUpgradeRequest, context: AuditContext = {}) {
    this.validateRequest(input);
    const routerResult = await this.db.query(
      `SELECT id, vendor, model, os_version AS "osVersion", management_protocol AS "managementProtocol",
        management_enabled AS "managementEnabled", controller_endpoint AS "controllerEndpoint",
        (management_credentials_encrypted IS NOT NULL) AS "credentialsConfigured"
       FROM routers WHERE tenant_id=$1 AND id=$2`,
      [tenantId, routerId],
    );
    const router = routerResult.rows[0];
    if (!router) throw new NotFoundException('Router not found');
    const inventoryResult = await this.db.query(
      `SELECT installed_version AS "installedVersion", hardware_revision AS "hardwareRevision",
        release_source_verified AS "releaseSourceVerified", release_source_url AS "releaseSourceUrl",
        latest_version AS "latestVersion", status AS "inventoryStatus"
       FROM network_firmware_inventory WHERE tenant_id=$1 AND router_id=$2`,
      [tenantId, routerId],
    );
    const inventory = inventoryResult.rows[0];
    const protocol = String(router.managementProtocol ?? '').toUpperCase();
    const checks = {
      vendorKnown: Boolean(router.vendor),
      modelKnown: Boolean(router.model),
      protocolRecognized: SUPPORTED_PROTOCOLS.has(protocol),
      managementEnabled: router.managementEnabled === true,
      credentialsConfigured: router.credentialsConfigured === true,
      installedVersionKnown: Boolean(inventory?.installedVersion ?? router.osVersion),
      hardwareRevisionKnown: Boolean(input.hardwareRevision ?? inventory?.hardwareRevision),
      releaseSourceVerified: inventory?.releaseSourceVerified === true
        && inventory?.releaseSourceUrl === input.releaseSourceUrl
        && inventory?.latestVersion === input.targetVersion,
      maintenanceWindowValid: this.validWindow(input.maintenanceWindowStart, input.maintenanceWindowEnd),
      artifactDigestProvided: typeof input.artifactSha256 === 'string' && /^[a-f0-9]{64}$/i.test(input.artifactSha256),
    };
    const blockers = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
    blockers.push('vendorSpecificFirmwareExecutorNotRegistered');
    const preview = {
      safeToExecute: false,
      checks,
      blockers,
      message: 'Preview only. No firmware was downloaded or installed. Release verification and a tested, model-specific vendor executor are required.',
    };
    const installedVersion = inventory?.installedVersion ?? router.osVersion ?? '';
    const result = await this.db.query(
      `INSERT INTO network_firmware_upgrade_jobs
        (tenant_id, router_id, vendor, management_protocol, model, hardware_revision, installed_version,
         target_version, release_source_url, release_source_verified, artifact_sha256, artifact_signature_verified,
         maintenance_window_start, maintenance_window_end, status, preview, requested_by, idempotency_key,
         error_code, error_message)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,$10,false,$11,$12,'BLOCKED',$13::jsonb,$14,$15,
         'EXECUTOR_NOT_REGISTERED','No tested vendor/model-specific firmware executor is registered; no device command was sent.')
       ON CONFLICT (tenant_id,idempotency_key) DO NOTHING
       RETURNING id, status, preview, created_at AS "createdAt"`,
      [tenantId, routerId, router.vendor ?? 'Unknown', protocol, router.model ?? 'Unknown',
        input.hardwareRevision ?? inventory?.hardwareRevision ?? null, installedVersion, input.targetVersion,
        input.releaseSourceUrl, input.artifactSha256?.toLowerCase() ?? null,
        input.maintenanceWindowStart ? new Date(input.maintenanceWindowStart) : null,
        input.maintenanceWindowEnd ? new Date(input.maintenanceWindowEnd) : null,
        JSON.stringify(preview), context.userId ?? null, input.idempotencyKey],
    );
    if (!result.rowCount) throw new ConflictException('This idempotencyKey has already been used for a firmware upgrade job');
    const job = result.rows[0];
    await this.db.query(
      `INSERT INTO network_firmware_upgrade_attempts
        (tenant_id, job_id, attempt_number, stage, status, finished_at, evidence, error_code, error_message)
       VALUES ($1,$2,1,'PRECHECK','BLOCKED',now(),$3::jsonb,'EXECUTOR_NOT_REGISTERED',
         'No device command sent; vendor-specific updater is not registered')`,
      [tenantId, job.id, JSON.stringify(preview)],
    );
    await this.audit.record(tenantId, 'NETWORK_FIRMWARE_UPGRADE_PREVIEWED', 'firmware_upgrade_job', job.id,
      { routerId, protocol, targetVersion: input.targetVersion, status: job.status, blockers }, context);
    return job;
  }

  async approve(tenantId: string, routerId: string, jobId: string, context: AuditContext = {}) {
    const result = await this.db.query(
      `SELECT id, status, preview FROM network_firmware_upgrade_jobs
       WHERE tenant_id=$1 AND router_id=$2 AND id=$3 FOR UPDATE`,
      [tenantId, routerId, jobId],
    );
    const job = result.rows[0];
    if (!job) throw new NotFoundException('Firmware upgrade job not found');
    // Never allow approval to bypass failed checks or a missing executor.
    if (job.status !== 'AWAITING_APPROVAL' || job.preview?.safeToExecute !== true) {
      throw new ServiceUnavailableException('Firmware upgrade is blocked: a verified release, maintenance window, and tested vendor-specific executor are required. No device command was sent.');
    }
    throw new ServiceUnavailableException('No vendor-specific firmware executor is registered. Approval and execution remain disabled.');
  }

  private validateRequest(input: FirmwareUpgradeRequest) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('Request body must be an object');
    for (const [field, value, max] of [
      ['targetVersion', input.targetVersion, 120],
      ['idempotencyKey', input.idempotencyKey, 200],
    ] as const) {
      if (typeof value !== 'string' || !value.trim() || value.length > max) throw new BadRequestException(field + ' is required and must be a bounded string');
    }
    if (typeof input.releaseSourceUrl !== 'string' || input.releaseSourceUrl.length > 2000) throw new BadRequestException('releaseSourceUrl is required');
    let url: URL;
    try { url = new URL(input.releaseSourceUrl); } catch { throw new BadRequestException('releaseSourceUrl must be a valid HTTPS URL'); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new BadRequestException('releaseSourceUrl must use HTTPS and must not contain credentials');
    if (input.hardwareRevision !== undefined && (typeof input.hardwareRevision !== 'string' || input.hardwareRevision.length > 120)) throw new BadRequestException('hardwareRevision is invalid');
    if (input.artifactSha256 !== undefined && (typeof input.artifactSha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(input.artifactSha256))) throw new BadRequestException('artifactSha256 must be a 64-character SHA-256 hex digest');
    if (!this.validWindow(input.maintenanceWindowStart, input.maintenanceWindowEnd)) throw new BadRequestException('A valid future maintenance window is required');
  }

  private validWindow(start?: string, end?: string) {
    if (!start || !end || typeof start !== 'string' || typeof end !== 'string') return false;
    const a = new Date(start).getTime();
    const b = new Date(end).getTime();
    const now = Date.now();
    return Number.isFinite(a) && Number.isFinite(b) && a > now && b > a && b - a <= 24 * 60 * 60 * 1000;
  }
}
