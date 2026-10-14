import { BadRequestException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditContext, AuditService } from '../audit/audit.service';
import { SecureNetworkCredentials } from '../common/secure-network-credentials';
import { MerakiFirmwareExecutor, MerakiFirmwareCredentials } from './meraki-firmware.executor';

@Injectable()
export class MerakiFirmwareService {
  constructor(
    @Inject(PG_POOL) private readonly db: Pool,
    private readonly audit: AuditService,
    private readonly secureCredentials: SecureNetworkCredentials,
    private readonly executor: MerakiFirmwareExecutor,
  ) {}

  async inspect(tenantId: string, routerId: string, context: AuditContext = {}) {
    const { credentials } = await this.load(tenantId, routerId);
    const inspection = await this.executor.inspect(credentials);
    await this.audit.record(tenantId, 'MERAKI_FIRMWARE_LIVE_INSPECTED', 'router_firmware', routerId, {
      networkId: credentials.networkId, productType: credentials.productType,
      currentVersion: inspection.currentVersion?.id ?? null,
      availableVersionCount: inspection.availableVersions.length,
    }, context);
    return inspection;
  }

  async schedule(tenantId: string, routerId: string, input: { targetVersion: string; scheduledAt: string; timezone: string; approved: boolean }, context: AuditContext = {}) {
    if (!input || typeof input !== 'object' || input.approved !== true) throw new BadRequestException('Explicit administrator approval is required');
    const { credentials } = await this.load(tenantId, routerId);
    const result = await this.executor.scheduleUpgrade(credentials, { ...input, approved: true });
    await this.audit.record(tenantId, 'MERAKI_FIRMWARE_UPGRADE_SCHEDULED', 'router_firmware', routerId, {
      networkId: credentials.networkId, productType: credentials.productType,
      targetVersion: result.targetVersion, scheduledAt: result.scheduledAt,
      executionModel: 'Meraki Dashboard scheduled cloud upgrade',
    }, context);
    return result;
  }

  async verify(tenantId: string, routerId: string, input: { targetVersion: string; scheduledAt: string }, context: AuditContext = {}) {
    if (!input || typeof input !== 'object' || !input.targetVersion || !input.scheduledAt) {
      throw new BadRequestException('targetVersion and scheduledAt are required for firmware verification');
    }
    const { credentials } = await this.load(tenantId, routerId);
    const result = await this.executor.verifyUpgrade(credentials, input);
    await this.audit.record(tenantId, 'MERAKI_FIRMWARE_UPGRADE_VERIFIED', 'router_firmware', routerId, {
      networkId: credentials.networkId, productType: credentials.productType,
      targetVersion: result.targetVersion, installedVersion: result.installedVersion,
      status: result.status, verifiedAt: result.verifiedAt,
    }, context);
    return result;
  }

  private async load(tenantId: string, routerId: string): Promise<{ router: any; credentials: MerakiFirmwareCredentials }> {
    const result = await this.db.query(
      `SELECT id, vendor, management_protocol AS "managementProtocol", management_enabled AS "managementEnabled",
        management_credentials_encrypted AS "encryptedCredentials"
       FROM routers WHERE tenant_id=$1 AND id=$2`,
      [tenantId, routerId],
    );
    const router = result.rows[0];
    if (!router) throw new NotFoundException('Router not found');
    if (!/meraki|cisco/i.test(String(router.vendor ?? '')) || String(router.managementProtocol).toUpperCase() !== 'MERAKI_DASHBOARD_API') {
      throw new ServiceUnavailableException('Meraki firmware workflow requires a Cisco Meraki device using MERAKI_DASHBOARD_API');
    }
    if (router.managementEnabled !== true || !router.encryptedCredentials) {
      throw new ServiceUnavailableException('Enable management and configure encrypted Meraki Dashboard credentials first');
    }
    const stored = this.secureCredentials.decrypt(router.encryptedCredentials);
    if (!stored.apiKey || !stored.networkId || !stored.productType) {
      throw new ServiceUnavailableException('Encrypted Meraki credentials must include apiKey, networkId, and productType');
    }
    return { router, credentials: { apiKey: stored.apiKey, networkId: stored.networkId, productType: stored.productType } };
  }
}
