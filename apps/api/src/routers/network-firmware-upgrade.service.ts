import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditContext, AuditService } from '../audit/audit.service';
import { SecureNetworkCredentials } from '../common/secure-network-credentials';
import { MikroTikFirmwareExecutor } from './mikrotik-firmware.executor';

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

@Injectable()
export class NetworkFirmwareUpgradeService {
  constructor(
    @Inject(PG_POOL) private readonly db: Pool,
    private readonly audit: AuditService,
    private readonly secureCredentials: SecureNetworkCredentials,
    private readonly mikrotikFirmware: MikroTikFirmwareExecutor,
  ) {}

  async inspectLive(tenantId: string, routerId: string, context: AuditContext = {}) {
    const result = await this.db.query(
      `SELECT id, vendor, model, os_version AS "osVersion", management_protocol AS "managementProtocol",
        management_enabled AS "managementEnabled", api_endpoint AS "apiEndpoint",
        controller_endpoint AS "controllerEndpoint", management_credentials_encrypted AS "encryptedCredentials"
       FROM routers WHERE tenant_id=$1 AND id=$2`,
      [tenantId, routerId],
    );
    const router = result.rows[0];
    if (!router) throw new NotFoundException('Router not found');
    if (String(router.managementProtocol).toUpperCase() !== 'MIKROTIK_REST'
      || !/mikrotik/i.test(String(router.vendor ?? ''))) {
      throw new ServiceUnavailableException('Live firmware inspection is currently implemented for MikroTik RouterOS only');
    }
    if (router.managementEnabled !== true || !router.encryptedCredentials) {
      throw new ServiceUnavailableException('Enable device management and configure encrypted MikroTik credentials first');
    }
    const endpoint = router.controllerEndpoint || router.apiEndpoint;
    if (!endpoint) throw new ServiceUnavailableException('Configure the MikroTik RouterOS REST endpoint (for example https://router-address/rest)');
    const credentials = this.secureCredentials.decrypt(router.encryptedCredentials);
    const live = await this.mikrotikFirmware.inspect({ endpoint, credentials });
    // RouterOS factory-firmware is a firmware version, not a hardware revision.
    // Keep this unknown rather than storing misleading metadata.
    const hardwareRevision: string | null = null;
    const releaseSourceUrl = 'https://mikrotik.com/download';
    const status = live.update.installedVersion === live.update.latestVersion ? 'CURRENT' : 'UPDATE_AVAILABLE';
    const reason = 'Live RouterOS update status returned by the device from MikroTik official update channel; model identity and version read over authenticated HTTPS.';
    await this.db.query(
      `INSERT INTO network_firmware_inventory
        (tenant_id, router_id, vendor, model, hardware_revision, installed_version, observed_at,
         observation_source, latest_version, release_source_url, release_source_verified,
         status, status_reason, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,now(),'MIKROTIK_ROUTEROS_REST',$7,$8,true,$9,$10,now())
       ON CONFLICT (tenant_id,router_id) DO UPDATE SET
         vendor=EXCLUDED.vendor, model=EXCLUDED.model, hardware_revision=EXCLUDED.hardware_revision,
         installed_version=EXCLUDED.installed_version, observed_at=now(),
         observation_source=EXCLUDED.observation_source, latest_version=EXCLUDED.latest_version,
         release_source_url=EXCLUDED.release_source_url, release_source_verified=true,
         status=EXCLUDED.status, status_reason=EXCLUDED.status_reason, updated_at=now()`,
      [tenantId, routerId, router.vendor, live.identity.model || router.model, hardwareRevision,
        live.update.installedVersion, live.update.latestVersion, releaseSourceUrl, status, reason],
    );
    await this.audit.record(tenantId, 'MIKROTIK_FIRMWARE_LIVE_INSPECTED', 'router_firmware', routerId, {
      installedVersion: live.update.installedVersion, latestVersion: live.update.latestVersion,
      channel: live.update.channel, status, architecture: live.identity.architecture,
    }, context);
    return { routerId, vendor: 'MikroTik', model: live.identity.model || router.model, ...live, inventoryStatus: status };
  }

  async prepareBackup(tenantId: string, routerId: string, jobId: string, context: AuditContext = {}) {
    const jobResult = await this.db.query(
      `SELECT id, status, vendor, management_protocol AS "managementProtocol", model,
        installed_version AS "installedVersion", target_version AS "targetVersion",
        release_source_url AS "releaseSourceUrl", maintenance_window_start AS "maintenanceWindowStart",
        maintenance_window_end AS "maintenanceWindowEnd"
       FROM network_firmware_upgrade_jobs
       WHERE tenant_id=$1 AND router_id=$2 AND id=$3`,
      [tenantId, routerId, jobId],
    );
    const job = jobResult.rows[0];
    if (!job) throw new NotFoundException('Firmware upgrade job not found');
    if (job.status !== 'BLOCKED' || String(job.managementProtocol).toUpperCase() !== 'MIKROTIK_REST'
      || !/mikrotik/i.test(String(job.vendor))) {
      throw new ServiceUnavailableException('Pre-upgrade backup preparation currently supports blocked MikroTik RouterOS jobs only');
    }
    if (job.releaseSourceUrl !== 'https://mikrotik.com/download' || !this.validWindow(
      new Date(job.maintenanceWindowStart).toISOString(), new Date(job.maintenanceWindowEnd).toISOString(),
    )) {
      throw new BadRequestException('A verified MikroTik official release and valid future maintenance window are required');
    }
    const live = await this.inspectLive(tenantId, routerId, context);
    if (live.update.latestVersion !== job.targetVersion || live.update.installedVersion !== job.installedVersion) {
      throw new ConflictException('Live MikroTik version or official latest release changed; create a fresh preview');
    }
    const routerResult = await this.db.query(
      `SELECT controller_endpoint AS "controllerEndpoint", api_endpoint AS "apiEndpoint",
        management_credentials_encrypted AS "encryptedCredentials"
       FROM routers WHERE tenant_id=$1 AND id=$2`,
      [tenantId, routerId],
    );
    const router = routerResult.rows[0];
    if (!router?.encryptedCredentials) throw new ServiceUnavailableException('Encrypted MikroTik credentials are missing');
    const credentials = this.secureCredentials.decrypt(router.encryptedCredentials);
    const endpoint = router.controllerEndpoint || router.apiEndpoint;
    if (!endpoint) throw new ServiceUnavailableException('MikroTik REST endpoint is missing');
    const backup = await this.mikrotikFirmware.createConfigurationExport({ endpoint, credentials });
    // Reuse the authenticated AES-GCM credential envelope to encrypt the backup payload at rest.
    const encryptedPayload = this.secureCredentials.encrypt({ username: 'jaslyn-firmware-backup', password: backup.content });
    const stored = await this.db.query(
      `INSERT INTO network_firmware_backups
        (tenant_id, router_id, job_id, encrypted_payload, sha256, file_name, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (tenant_id,job_id) DO NOTHING
       RETURNING id, sha256, created_at AS "createdAt"`,
      [tenantId, routerId, jobId, encryptedPayload, backup.sha256, backup.fileName, context.userId ?? null],
    );
    if (!stored.rowCount) throw new ConflictException('A backup already exists for this firmware job; do not overwrite it');
    const receipt = stored.rows[0];
    const preview = {
      safeToExecute: true,
      vendor: 'MikroTik',
      releaseSourceVerified: true,
      targetVersion: job.targetVersion,
      backupReceiptId: receipt.id,
      backupSha256: receipt.sha256,
      backupEncryptedAtRest: true,
      message: 'Encrypted configuration backup stored. Explicit administrator approval is still required; installation has not started.',
    };
    await this.db.query(
      `UPDATE network_firmware_upgrade_jobs SET status='AWAITING_APPROVAL', preview=$4::jsonb,
        error_code=NULL, error_message=NULL, updated_at=now()
       WHERE tenant_id=$1 AND router_id=$2 AND id=$3 AND status='BLOCKED'`,
      [tenantId, routerId, jobId, JSON.stringify(preview)],
    );
    await this.db.query(
      `INSERT INTO network_firmware_upgrade_attempts
        (tenant_id, job_id, attempt_number, stage, status, finished_at, evidence)
       VALUES ($1,$2,2,'BACKUP','SUCCEEDED',now(),$3::jsonb)
       ON CONFLICT (job_id,attempt_number) DO NOTHING`,
      [tenantId, jobId, JSON.stringify({ backupReceiptId: receipt.id, sha256: receipt.sha256 })],
    );
    await this.audit.record(tenantId, 'MIKROTIK_FIRMWARE_BACKUP_STORED', 'firmware_upgrade_job', jobId,
      { routerId, backupReceiptId: receipt.id, sha256: receipt.sha256, encryptedAtRest: true }, context);
    return { jobId, status: 'AWAITING_APPROVAL', backupReceiptId: receipt.id, sha256: receipt.sha256, approvalRequired: true };
  }

  async verifyAfterUpgrade(tenantId: string, routerId: string, jobId: string, context: AuditContext = {}) {
    const jobResult = await this.db.query(
      `SELECT id, status, target_version AS "targetVersion"
       FROM network_firmware_upgrade_jobs WHERE tenant_id=$1 AND router_id=$2 AND id=$3`,
      [tenantId, routerId, jobId],
    );
    const job = jobResult.rows[0];
    if (!job) throw new NotFoundException('Firmware upgrade job not found');
    if (!['VERIFYING', 'RECOVERY_REQUIRED'].includes(job.status)) {
      throw new ConflictException('Only a started firmware upgrade can be verified');
    }
    const live = await this.inspectLive(tenantId, routerId, context);
    const succeeded = live.update.installedVersion === job.targetVersion;
    const status = succeeded ? 'SUCCEEDED' : 'VERIFYING';
    await this.db.query(
      `UPDATE network_firmware_upgrade_jobs SET status=$4, observed_version_after=$5,
        verification_evidence=$6::jsonb, execution_finished_at=CASE WHEN $4='SUCCEEDED' THEN now() ELSE execution_finished_at END,
        error_code=CASE WHEN $4='SUCCEEDED' THEN NULL ELSE 'TARGET_VERSION_NOT_OBSERVED' END,
        error_message=CASE WHEN $4='SUCCEEDED' THEN NULL ELSE 'Device is reachable but the approved target version is not yet observed' END,
        updated_at=now()
       WHERE tenant_id=$1 AND router_id=$2 AND id=$3`,
      [tenantId, routerId, jobId, status, live.update.installedVersion, JSON.stringify({
        installedVersion: live.update.installedVersion, targetVersion: job.targetVersion,
        latestVersion: live.update.latestVersion, channel: live.update.channel,
      })],
    );
    await this.audit.record(tenantId, 'MIKROTIK_FIRMWARE_POST_UPGRADE_VERIFIED', 'firmware_upgrade_job', jobId,
      { routerId, status, installedVersion: live.update.installedVersion, targetVersion: job.targetVersion }, context);
    return { jobId, status, installedVersion: live.update.installedVersion, targetVersion: job.targetVersion };
  }

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
    blockers.push('durableEncryptedBackupAndPostUpgradeWorkerNotIntegrated');
    const preview = {
      safeToExecute: false,
      checks,
      blockers,
      message: 'MikroTik live inspection is available. Installation remains blocked until an encrypted durable backup receipt and asynchronous post-reboot verification worker are integrated.',
    };
    const installedVersion = inventory?.installedVersion ?? router.osVersion ?? '';
    const result = await this.db.query(
      `INSERT INTO network_firmware_upgrade_jobs
        (tenant_id, router_id, vendor, management_protocol, model, hardware_revision, installed_version,
         target_version, release_source_url, release_source_verified, artifact_sha256, artifact_signature_verified,
         maintenance_window_start, maintenance_window_end, status, preview, requested_by, idempotency_key,
         error_code, error_message)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,$10,false,$11,$12,'BLOCKED',$13::jsonb,$14,$15,
         'EXECUTOR_NOT_READY','No firmware command sent; durable backup and post-reboot worker are not integrated.')
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
       VALUES ($1,$2,1,'PRECHECK','BLOCKED',now(),$3::jsonb,'EXECUTOR_NOT_READY',
         'No device command sent; durable backup and post-reboot worker are not integrated')`,
      [tenantId, job.id, JSON.stringify(preview)],
    );
    await this.audit.record(tenantId, 'NETWORK_FIRMWARE_UPGRADE_PREVIEWED', 'firmware_upgrade_job', job.id,
      { routerId, protocol, targetVersion: input.targetVersion, status: job.status, blockers }, context);
    return job;
  }

  async approve(tenantId: string, routerId: string, jobId: string, context: AuditContext = {}) {
    const result = await this.db.query(
      `SELECT id, status, preview, vendor, management_protocol AS "managementProtocol",
        installed_version AS "installedVersion", target_version AS "targetVersion",
        maintenance_window_start AS "maintenanceWindowStart", maintenance_window_end AS "maintenanceWindowEnd"
       FROM network_firmware_upgrade_jobs
       WHERE tenant_id=$1 AND router_id=$2 AND id=$3 FOR UPDATE`,
      [tenantId, routerId, jobId],
    );
    const job = result.rows[0];
    if (!job) throw new NotFoundException('Firmware upgrade job not found');
    if (job.status !== 'AWAITING_APPROVAL' || job.preview?.safeToExecute !== true
      || String(job.managementProtocol).toUpperCase() !== 'MIKROTIK_REST'
      || !/mikrotik/i.test(String(job.vendor))) {
      throw new ServiceUnavailableException('Firmware upgrade is blocked: verified release and encrypted pre-upgrade backup are required. No device command was sent.');
    }
    const start = new Date(job.maintenanceWindowStart).getTime();
    const end = new Date(job.maintenanceWindowEnd).getTime();
    const now = Date.now();
    if (!Number.isFinite(start) || !Number.isFinite(end) || now < start || now > end) {
      throw new BadRequestException('Approval must occur inside the approved maintenance window');
    }
    const backupResult = await this.db.query(
      `SELECT id, sha256 FROM network_firmware_backups
       WHERE tenant_id=$1 AND router_id=$2 AND job_id=$3 AND status IN ('STORED','RESTORE_TESTED')`,
      [tenantId, routerId, jobId],
    );
    const backup = backupResult.rows[0];
    if (!backup || backup.id !== job.preview.backupReceiptId || backup.sha256 !== job.preview.backupSha256) {
      throw new ServiceUnavailableException('Encrypted durable backup receipt is missing or does not match the approved preview');
    }
    const routerResult = await this.db.query(
      `SELECT controller_endpoint AS "controllerEndpoint", api_endpoint AS "apiEndpoint",
        management_credentials_encrypted AS "encryptedCredentials"
       FROM routers WHERE tenant_id=$1 AND id=$2`,
      [tenantId, routerId],
    );
    const router = routerResult.rows[0];
    if (!router?.encryptedCredentials) throw new ServiceUnavailableException('Encrypted MikroTik credentials are missing');
    const endpoint = router.controllerEndpoint || router.apiEndpoint;
    if (!endpoint) throw new ServiceUnavailableException('MikroTik REST endpoint is missing');
    const credentials = this.secureCredentials.decrypt(router.encryptedCredentials);
    const live = await this.mikrotikFirmware.inspect({ endpoint, credentials });
    if (live.update.installedVersion !== job.installedVersion || live.update.latestVersion !== job.targetVersion) {
      throw new ConflictException('MikroTik live version changed after backup; no install command was sent');
    }
    await this.db.query(
      `UPDATE network_firmware_upgrade_jobs SET status='RUNNING', approved_by=$4, approved_at=now(),
        execution_started_at=now(), updated_at=now()
       WHERE tenant_id=$1 AND router_id=$2 AND id=$3 AND status='AWAITING_APPROVAL'`,
      [tenantId, routerId, jobId, context.userId ?? null],
    );
    await this.db.query(
      `INSERT INTO network_firmware_upgrade_attempts
        (tenant_id, job_id, attempt_number, stage, status, evidence)
       VALUES ($1,$2,3,'INSTALL','STARTED',$3::jsonb)
       ON CONFLICT (job_id,attempt_number) DO NOTHING`,
      [tenantId, jobId, JSON.stringify({ backupReceiptId: backup.id, backupSha256: backup.sha256 })],
    );
    try {
      const accepted = await this.mikrotikFirmware.install({ endpoint, credentials }, {
        approvedTargetVersion: job.targetVersion,
        expectedInstalledVersion: job.installedVersion,
        observedLatestVersion: live.update.latestVersion,
        backupReceiptId: backup.id,
        backupSha256: backup.sha256,
        maintenanceWindowActive: true,
      });
      await this.db.query(
        `UPDATE network_firmware_upgrade_jobs SET status='VERIFYING', updated_at=now()
         WHERE tenant_id=$1 AND router_id=$2 AND id=$3`,
        [tenantId, routerId, jobId],
      );
      await this.db.query(
        `UPDATE network_firmware_upgrade_attempts SET status='SUCCEEDED', finished_at=now(), evidence=$4::jsonb
         WHERE tenant_id=$1 AND job_id=$2 AND attempt_number=3`,
        [tenantId, jobId, 3, JSON.stringify(accepted)],
      );
      await this.audit.record(tenantId, 'MIKROTIK_FIRMWARE_INSTALL_ACCEPTED', 'firmware_upgrade_job', jobId,
        { routerId, targetVersion: job.targetVersion, backupReceiptId: backup.id }, context);
      return { jobId, status: 'VERIFYING', targetVersion: job.targetVersion, message: 'RouterOS accepted the official-channel install command. Verify the device after it reboots.' };
    } catch (error) {
      // The router may have accepted the command before the connection failed. Never retry automatically.
      await this.db.query(
        `UPDATE network_firmware_upgrade_jobs SET status='RECOVERY_REQUIRED',
          error_code='INSTALL_RESULT_UNCERTAIN', error_message=$4, updated_at=now()
         WHERE tenant_id=$1 AND router_id=$2 AND id=$3`,
        [tenantId, routerId, jobId, error instanceof Error ? error.message.slice(0, 500) : 'Install result uncertain'],
      );
      throw new ServiceUnavailableException('MikroTik install result is uncertain. Job marked RECOVERY_REQUIRED; inspect device before retrying.');
    }
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
