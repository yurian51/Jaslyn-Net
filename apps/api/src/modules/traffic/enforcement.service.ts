import { FairnessService, FairnessPolicy } from './fairness.service';
import { BandwidthEnforcementCommand, EnforcementReconcileOptions, TrafficEnforcementAdapter, toEnforcementCommands } from './enforcement.adapter';
import { FairnessInput } from './fairness.engine';
import { NetworkCredentials } from '../../common/secure-network-credentials';
import { NetworkManagementProtocol } from '../../routers/routers.dto';
import { ServiceUnavailableException } from '@nestjs/common';
import { NetworkCommandService, NetworkCommandStatus } from './network-command.service';

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
  verifiedCommandIds: string[];
  verificationFailures: number;
  mode: string;
  utilizationPercent: number;
}

const executableCommandStates = new Set<NetworkCommandStatus>(['QUEUED', 'SENT', 'ACCEPTED', 'RETRYING']);

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

    let executableCommands = commands;
    let commandIds: string[] = [];
    if (this.networkCommands && tenantId && commands.length) {
      const queued = await this.networkCommands.queueBandwidthCommands(tenantId, commands, 'traffic-orchestrator', correlationId);
      const executable = queued.filter((entry) => executableCommandStates.has(entry.status));
      executableCommands = executable.map((entry) => entry.command);
      commandIds = executable.map((entry) => entry.id);
    }

    if (!executableCommands.length) {
      return {
        applied: false,
        commandCount: 0,
        commands: [],
        commandIds: [],
        verifiedCommandIds: [],
        verificationFailures: 0,
        mode: state.mode,
        utilizationPercent: Number(state.utilizationPercent.toFixed(3)),
      };
    }

    try {
      await adapter.apply(executableCommands, credentials);
    } catch (error) {
      if (commandIds.length && tenantId) await this.networkCommands!.markFailed(tenantId, commandIds, error);
      throw error;
    }

    if (commandIds.length && tenantId) {
      try {
        await this.networkCommands!.markExecuted(tenantId, commandIds, { protocol, commandCount: executableCommands.length });
      } catch (error) {
        throw new ServiceUnavailableException('Network command executed but command state could not be persisted');
      }
    }

    let verifiedCommandIds: string[] = [];
    let verificationFailures = 0;
    if (commandIds.length && tenantId && adapter.verify) {
      const verification = await adapter.verify(executableCommands, credentials);
      const verifiedIndexes = verification.map((result, index) => result.verified ? index : -1).filter((index) => index >= 0);
      verifiedCommandIds = verifiedIndexes.map((index) => commandIds[index]).filter(Boolean);
      verificationFailures = verification.filter((result) => !result.verified).length + Math.max(0, executableCommands.length - verification.length);
      for (const index of verifiedIndexes) {
        const commandId = commandIds[index];
        if (!commandId) continue;
        await this.networkCommands.markVerified(tenantId, commandId, verification[index].details);
      }
    }

    return {
      applied: executableCommands.length > 0,
      commandCount: executableCommands.length,
      commands: executableCommands,
      commandIds,
      verifiedCommandIds,
      verificationFailures,
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
