import { FairnessService, FairnessPolicy } from './fairness.service';
import { BandwidthEnforcementCommand, EnforcementReconcileOptions, TrafficEnforcementAdapter, toEnforcementCommands } from './enforcement.adapter';
import { FairnessInput } from './fairness.engine';
import { NetworkCredentials } from '../../common/secure-network-credentials';
import { NetworkManagementProtocol } from '../../routers/routers.dto';
import { ServiceUnavailableException } from '@nestjs/common';
import { NetworkCommandService } from './network-command.service';

export interface EnforcementTarget {
  targetAddress?: string;
  targetMacAddress?: string;
  apiEndpoint?: string;
  protocol?: NetworkManagementProtocol;
  merakiGroupPolicyId?: string;
}

export type EnforcementUser = FairnessInput['activeUsers'][number] & { maxDownloadMbps?: number; maxUploadMbps?: number };

export interface EnforcementResult {
  applied: boolean;
  commandCount: number;
  commands: BandwidthEnforcementCommand[];
  commandIds: string[];
  mode: string;
  utilizationPercent: number;
}

export class TrafficEnforcementService {
  constructor(
    private readonly fairnessService: FairnessService,
    private readonly adapters: Partial<Record<NetworkManagementProtocol, TrafficEnforcementAdapter>>,
    private readonly networkCommands?: NetworkCommandService,
  ) {}

  async evaluateAndApply(
    routerId: string,
    policy: FairnessPolicy,
    activeUsers: EnforcementUser[],
    targets: Record<string, EnforcementTarget> = {},
    uploadRatio = 0.5,
    credentials?: NetworkCredentials,
    protocol: NetworkManagementProtocol = 'MIKROTIK_REST',
    tenantId?: string,
    correlationId?: string,
  ): Promise<EnforcementResult> {
    const state = this.fairnessService.evaluate(policy, activeUsers);
    const serviceLimits = Object.fromEntries(activeUsers.map((user) => [
      `${user.customerId}:${user.sessionId ?? ''}`,
      {
        maxDownloadMbps: Number.isFinite(user.maxDownloadMbps) ? user.maxDownloadMbps! : Number.POSITIVE_INFINITY,
        maxUploadMbps: Number.isFinite(user.maxUploadMbps) ? user.maxUploadMbps! : Number.POSITIVE_INFINITY,
      },
    ]));
    const commands = toEnforcementCommands(routerId, state.allocations, uploadRatio, targets, serviceLimits);
    const adapter = this.adapters[protocol];
    if (!adapter) throw new ServiceUnavailableException(`No traffic enforcement adapter is registered for ${protocol}`);

    let commandIds: string[] = [];
    if (this.networkCommands && tenantId && commands.length) {
      const queued = await this.networkCommands.queueBandwidthCommands(tenantId, commands, 'traffic-orchestrator', correlationId);
      commandIds = queued.map((entry) => entry.id);
    }

    try {
      await adapter.apply(commands, credentials);
    } catch (error) {
      if (commandIds.length && tenantId) await this.networkCommands!.markFailed(tenantId, commandIds, error);
      throw error;
    }

    if (commandIds.length && tenantId) {
      try {
        await this.networkCommands!.markExecuted(tenantId, commandIds, { protocol, commandCount: commands.length });
      } catch (error) {
        throw new ServiceUnavailableException('Network command executed but command state could not be persisted');
      }
    }

    return {
      applied: commands.length > 0,
      commandCount: commands.length,
      commands,
      commandIds,
      mode: state.mode,
      utilizationPercent: Number(state.utilizationPercent.toFixed(3)),
    };
  }

  async clearManaged(apiEndpoint: string, credentials?: NetworkCredentials, protocol: NetworkManagementProtocol = 'MIKROTIK_REST', options?: EnforcementReconcileOptions) {
    const adapter = this.adapters[protocol];
    if (!adapter) throw new ServiceUnavailableException(`No traffic enforcement adapter is registered for ${protocol}`);
    return adapter.clearManaged(apiEndpoint, credentials, options);
  }

  async reconcileManaged(apiEndpoint: string, keepQueueNames: string[], credentials?: NetworkCredentials, protocol: NetworkManagementProtocol = 'MIKROTIK_REST', options?: EnforcementReconcileOptions) {
    const adapter = this.adapters[protocol];
    if (!adapter) throw new ServiceUnavailableException(`No traffic enforcement adapter is registered for ${protocol}`);
    return adapter.reconcileManaged(apiEndpoint, keepQueueNames, credentials, options);
  }
}
