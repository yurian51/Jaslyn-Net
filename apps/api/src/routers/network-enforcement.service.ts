import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditContext, AuditService } from '../audit/audit.service';
import { NetworkCredentials, SecureNetworkCredentials } from '../common/secure-network-credentials';
import { NetworkManagementProtocol } from './routers.dto';
import { TrafficEnforcementService } from '../modules/traffic/enforcement.service';

export interface EnforceRouterPolicyInput {
  packageId: string;
  ipAddress: string;
}

@Injectable()
export class NetworkEnforcementService {
  constructor(
    @Inject(PG_POOL) private readonly db: Pool,
    private readonly audit: AuditService,
    private readonly secureCredentials: SecureNetworkCredentials,
    private readonly trafficEnforcement: TrafficEnforcementService,
  ) {}

  async enforce(tenantId: string, routerId: string, input: EnforceRouterPolicyInput, context: AuditContext = {}) {
    const result = await this.db.query(
      `SELECT r.id, r.name, r.management_protocol AS "managementProtocol", r.management_enabled AS "managementEnabled",
              r.api_endpoint AS "apiEndpoint", r.management_credentials_encrypted AS "credentialsEncrypted",
              p.id AS "packageId", p.name AS "packageName", p.download_bps AS "downloadBps", p.upload_bps AS "uploadBps"
       FROM routers r
       JOIN packages p ON p.tenant_id=$1 AND p.id=$3 AND p.is_active=true
       WHERE r.tenant_id=$1 AND r.id=$2`,
      [tenantId, routerId, input.packageId],
    );
    if (!result.rowCount) throw new NotFoundException('Router or active WiFi plan not found');
    const row = result.rows[0];

    if (!row.managementEnabled) throw new BadRequestException('Router management is disabled');
    if (!row.apiEndpoint) throw new BadRequestException('Router management endpoint is not configured');

    const protocol = row.managementProtocol as NetworkManagementProtocol;
    if (!this.trafficEnforcement.supportsProtocol(protocol)) {
      return {
        ok: false,
        status: 'blocked' as const,
        reason: 'UNSUPPORTED_NETWORK_PROTOCOL',
        protocol,
      };
    }
    if (!row.credentialsEncrypted) throw new BadRequestException('Router management credentials are not configured');

    const credentials = this.secureCredentials.decrypt(row.credentialsEncrypted) as NetworkCredentials;
    const downloadKbps = bpsToKbps(row.downloadBps, 'download_bps');
    const uploadKbps = bpsToKbps(row.uploadBps, 'upload_bps');
    const maxDownloadMbps = downloadKbps / 1000;
    const maxUploadMbps = uploadKbps / 1000;
    const correlationId = `router-policy:${routerId}:${input.ipAddress}:${input.packageId}`;

    try {
      const enforcement = await this.trafficEnforcement.applyCommands([
        {
          routerId,
          customerId: `ip:${input.ipAddress}`,
          targetAddress: input.ipAddress,
          apiEndpoint: row.apiEndpoint,
          protocol,
          maxDownloadMbps,
          maxUploadMbps,
          priority: 1,
        },
      ], credentials, protocol, tenantId, correlationId);

      const verified = enforcement.commandCount > 0 && enforcement.verifiedCommandIds.length === enforcement.commandCount;
      const event = verified ? 'NETWORK_POLICY_ENFORCED' : 'NETWORK_POLICY_EXECUTED_UNVERIFIED';
      await this.audit.record(tenantId, event, 'router', routerId, {
        protocol,
        packageId: row.packageId,
        clientIp: input.ipAddress,
        commandIds: enforcement.commandIds,
        verifiedCommandIds: enforcement.verifiedCommandIds,
        verificationFailures: enforcement.verificationFailures,
      }, context);

      return {
        ok: enforcement.applied,
        status: verified ? 'verified' as const : enforcement.applied ? 'executed_unverified' as const : 'already_terminal' as const,
        protocol,
        routerId,
        packageId: row.packageId,
        clientIp: input.ipAddress,
        commandIds: enforcement.commandIds,
        verifiedCommandIds: enforcement.verifiedCommandIds,
        verificationFailures: enforcement.verificationFailures,
      };
    } catch (error: unknown) {
      const safe = { code: errorCode(error), message: error instanceof Error ? error.message : 'Network policy enforcement failed' };
      await this.audit.record(tenantId, 'NETWORK_ENFORCEMENT_FAILED', 'router', routerId, {
        protocol, packageId: row.packageId, clientIp: input.ipAddress, errorCode: safe.code,
      }, context);
      return { ok: false, status: 'failed' as const, reason: 'NETWORK_POLICY_ENFORCEMENT_FAILED', protocol, error: safe };
    }
  }
}

function bpsToKbps(value: unknown, field: string): number {
  if (value == null) throw new BadRequestException(`${field} is required for direct network enforcement`);
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(numeric) || numeric <= 0) throw new BadRequestException(`${field} must be a positive integer`);
  const kbps = Math.floor(numeric / 1000);
  if (kbps <= 0) throw new BadRequestException(`${field} must be at least 1000 bps`);
  return kbps;
}

function errorCode(error: unknown) {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'NETWORK_ERROR';
}
