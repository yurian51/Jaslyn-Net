import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/database.module';
import { SecureNetworkCredentials } from '../../common/secure-network-credentials';
import { NetworkManagementProtocol } from '../../routers/routers.dto';
import { TrafficEnforcementService } from './enforcement.service';
import { BandwidthEnforcementCommand, NetworkDisconnectCommand } from './enforcement.adapter';
import { NetworkCommandService } from './network-command.service';

interface ClaimedCommand {
  id: string;
  tenantId: string;
  routerId: string | null;
  commandType: string;
  target: Record<string, unknown>;
  request: Record<string, unknown>;
  provider: string | null;
  attempts: number;
}

interface RouterRecord {
  apiEndpoint?: string;
  managementProtocol: NetworkManagementProtocol;
  managementCredentialsEncrypted?: string;
}

@Injectable()
export class NetworkCommandWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NetworkCommandWorkerService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    @Inject(PG_POOL) private readonly db: Pool,
    private readonly config: ConfigService,
    private readonly credentials: SecureNetworkCredentials,
    private readonly commands: NetworkCommandService,
    private readonly enforcement: TrafficEnforcementService,
  ) {}

  onModuleInit() {
    const configured = Number(this.config.get<string>('JASLYN_NETWORK_COMMAND_WORKER_INTERVAL_SECONDS', '5'));
    const seconds = Math.min(Math.max(Number.isFinite(configured) ? Math.trunc(configured) : 5, 2), 60);
    this.timer = setInterval(() => void this.process(), seconds * 1000);
    this.timer.unref?.();
    void this.process();
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async process(): Promise<{ claimed: number; succeeded: number; failed: number }> {
    if (this.running) return { claimed: 0, succeeded: 0, failed: 0 };
    this.running = true;
    let succeeded = 0;
    let failed = 0;
    try {
      const batchSize = this.config.get<number>('JASLYN_NETWORK_COMMAND_WORKER_BATCH_SIZE', 20);
      const staleSeconds = this.config.get<number>('JASLYN_NETWORK_COMMAND_WORKER_STALE_SECONDS', 300);
      const claimed = await this.commands.claimPending(undefined, Number(batchSize), Number(staleSeconds));
      for (const command of claimed as ClaimedCommand[]) {
        try {
          await this.execute(command);
          succeeded += 1;
        } catch (error) {
          failed += 1;
          await this.commands.markFailed(command.tenantId, [command.id], error).catch(() => undefined);
          this.logger.warn(`Network command ${command.id} failed: ${error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500)}`);
        }
      }
      return { claimed: claimed.length, succeeded, failed };
    } finally {
      this.running = false;
    }
  }

  private async execute(command: ClaimedCommand) {
    const protocol = this.parseProtocol(command.provider);
    if (!protocol) throw new Error(`Unsupported network command provider: ${command.provider ?? 'missing'}`);
    const router = command.routerId ? await this.getRouter(command.tenantId, command.routerId) : undefined;
    const credentials = router?.managementCredentialsEncrypted ? this.credentials.decrypt(router.managementCredentialsEncrypted) : undefined;

    if (command.commandType === 'BANDWIDTH_ENFORCEMENT') {
      const request = this.bandwidthCommand(command.request, router, protocol);
      await this.enforcement.executeVerifiedBandwidthCommands([request], credentials, protocol, command.tenantId, [command.id]);
      return;
    }

    if (command.commandType === 'DISCONNECT_SESSION') {
      const request = this.disconnectCommand(command, router, protocol);
      await this.enforcement.executePersistedDisconnectCommand(request, credentials, protocol, command.tenantId, command.id);
      return;
    }

    throw new Error(`Unsupported network command type: ${command.commandType}`);
  }

  private async getRouter(tenantId: string, routerId: string): Promise<RouterRecord> {
    const result = await this.db.query<RouterRecord>(
      `SELECT api_endpoint AS "apiEndpoint", management_protocol AS "managementProtocol",
              management_credentials_encrypted AS "managementCredentialsEncrypted"
       FROM routers WHERE tenant_id=$1 AND id=$2 AND enabled=true AND management_enabled=true`,
      [tenantId, routerId],
    );
    if (!result.rowCount) throw new Error(`Router ${routerId} is not available for network command execution`);
    return result.rows[0];
  }

  private parseProtocol(value: string | null): NetworkManagementProtocol | undefined {
    const allowed: NetworkManagementProtocol[] = [
      'MIKROTIK_REST', 'UNIFI_NETWORK_API', 'OMADA_CONTROLLER_API', 'CAMBIUM_CNMAESTRO', 'MERAKI_DASHBOARD_API',
      'ARUBA_CENTRAL_API', 'GRANDSTREAM_GWN_API', 'RUIJIE_REYEE_CLOUD_API', 'RUCKUS_SMARTZONE_API', 'OPENWRT_UBUS',
      'TELTONIKA_RMS_API', 'PEPLINK_INCONTROL_API', 'PFSENSE_API', 'GENERIC_HTTP', 'SNMP', 'RADIUS_NAS',
    ];
    return allowed.includes(value as NetworkManagementProtocol) ? value as NetworkManagementProtocol : undefined;
  }

  private bandwidthCommand(value: Record<string, unknown>, router: RouterRecord | undefined, protocol: NetworkManagementProtocol): BandwidthEnforcementCommand {
    const number = (name: string) => {
      const valueForField = Number(value[name]);
      if (!Number.isFinite(valueForField) || valueForField <= 0) throw new Error(`Invalid bandwidth command field: ${name}`);
      return valueForField;
    };
    const required = (name: string) => {
      const field = typeof value[name] === 'string' ? String(value[name]).trim() : '';
      if (!field) throw new Error(`Missing bandwidth command field: ${name}`);
      return field;
    };
    const requestProtocol = this.parseProtocol(typeof value.protocol === 'string' ? value.protocol : null);
    if (requestProtocol && requestProtocol !== protocol) throw new Error('Persisted network command provider does not match request protocol');
    const priority = Number(value.priority);
    if (!Number.isFinite(priority)) throw new Error('Invalid bandwidth command field: priority');
    return {
      routerId: required('routerId'), customerId: required('customerId'),
      sessionId: typeof value.sessionId === 'string' ? value.sessionId : undefined,
      targetAddress: typeof value.targetAddress === 'string' ? value.targetAddress : undefined,
      targetMacAddress: typeof value.targetMacAddress === 'string' ? value.targetMacAddress : undefined,
      apiEndpoint: typeof value.apiEndpoint === 'string' ? value.apiEndpoint : router?.apiEndpoint,
      protocol, merakiGroupPolicyId: typeof value.merakiGroupPolicyId === 'string' ? value.merakiGroupPolicyId : undefined,
      maxDownloadMbps: number('maxDownloadMbps'), maxUploadMbps: number('maxUploadMbps'), priority: Math.max(1, Math.min(8, Math.trunc(priority))),
    };
  }

  private disconnectCommand(command: ClaimedCommand, router: RouterRecord | undefined, protocol: NetworkManagementProtocol): NetworkDisconnectCommand {
    const text = (name: string) => typeof command.target[name] === 'string' ? String(command.target[name]).trim() : undefined;
    if (!command.routerId) throw new Error('Disconnect command is missing routerId');
    if (router?.managementProtocol !== protocol) throw new Error('Persisted disconnect provider does not match router protocol');
    return {
      routerId: command.routerId, customerId: text('customerId') ?? '', sessionId: text('sessionId'), username: text('username'),
      targetAddress: text('ipAddress'), targetMacAddress: text('macAddress'), apiEndpoint: router?.apiEndpoint, protocol,
    };
  }
}
