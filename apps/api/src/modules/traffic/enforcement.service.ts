import { FairnessService, FairnessPolicy } from './fairness.service';
import { BandwidthEnforcementCommand, EnforcementReconcileOptions, NetworkDisconnectCommand, TrafficEnforcementAdapter, toEnforcementCommands } from './enforcement.adapter';
import { FairnessInput } from './fairness.engine';
import { NetworkCredentials } from '../../common/secure-network-credentials';
import { NetworkManagementProtocol } from '../../routers/routers.dto';
import { ServiceUnavailableException } from '@nestjs/common';
import { NetworkCommandService, NetworkCommandStatus } from './network-command.service';

export interface EnforcementTarget { targetAddress?: string; targetMacAddress?: string; apiEndpoint?: string; protocol?: NetworkManagementProtocol; merakiGroupPolicyId?: string; }
export type EnforcementUser = FairnessInput['activeUsers'][number] & { maxDownloadMbps?: number; maxUploadMbps?: number };
export interface EnforcementResult {
  applied: boolean; commandCount: number; commands: BandwidthEnforcementCommand[]; commandIds: string[];
  verifiedCommandIds: string[]; verificationFailures: number; mode: string; utilizationPercent: number;
}
export interface DisconnectEnforcementResult {
  applied: boolean; commandId?: string; verified: boolean; details: Record<string, unknown>;
}
const executableCommandStates = new Set<NetworkCommandStatus>(['QUEUED', 'SENT', 'ACCEPTED', 'RETRYING']);

export class TrafficEnforcementService {
  constructor(private readonly fairnessService: FairnessService,
    private readonly adapters: Partial<Record<NetworkManagementProtocol, TrafficEnforcementAdapter>>,
    private readonly networkCommands?: NetworkCommandService) {}

  supportsProtocol(protocol: NetworkManagementProtocol): boolean { return Boolean(this.adapters[protocol]); }
  supportsDisconnect(protocol: NetworkManagementProtocol): boolean { return Boolean(this.adapters[protocol]?.disconnect && this.adapters[protocol]?.verifyDisconnected); }

  async evaluateAndApply(routerId: string, policy: FairnessPolicy, activeUsers: EnforcementUser[], targets: Record<string, EnforcementTarget> = {}, uploadRatio = 0.5, credentials?: NetworkCredentials, protocol: NetworkManagementProtocol = 'MIKROTIK_REST', tenantId?: string, correlationId?: string): Promise<EnforcementResult> {
    const state = this.fairnessService.evaluate(policy, activeUsers);
    const serviceLimits = Object.fromEntries(activeUsers.map((user) => [`${user.customerId}:${user.sessionId ?? ''}`, { maxDownloadMbps: Number.isFinite(user.maxDownloadMbps) ? user.maxDownloadMbps! : Number.POSITIVE_INFINITY, maxUploadMbps: Number.isFinite(user.maxUploadMbps) ? user.maxUploadMbps! : Number.POSITIVE_INFINITY }]));
    const commands = toEnforcementCommands(routerId, state.allocations, uploadRatio, targets, serviceLimits);
    const result = await this.applyCommands(commands, credentials, protocol, tenantId, correlationId);
    return { ...result, mode: state.mode, utilizationPercent: Number(state.utilizationPercent.toFixed(3)) };
  }

  async applyCommands(commands: BandwidthEnforcementCommand[], credentials?: NetworkCredentials, protocol: NetworkManagementProtocol = 'MIKROTIK_REST', tenantId?: string, correlationId?: string): Promise<Omit<EnforcementResult, 'mode' | 'utilizationPercent'>> {
    if (!commands.length) return { applied: false, commandCount: 0, commands: [], commandIds: [], verifiedCommandIds: [], verificationFailures: 0 };
    const adapter = this.adapters[protocol];
    if (!adapter) throw new ServiceUnavailableException(`No traffic enforcement adapter is registered for ${protocol}`);
    let executableCommands = commands;
    let commandIds: string[] = [];
    if (this.networkCommands && tenantId) {
      const queued = await this.networkCommands.queueBandwidthCommands(tenantId, commands, 'traffic-orchestrator', correlationId);
      const executable = queued.filter((entry) => executableCommandStates.has(entry.status));
      executableCommands = executable.map((entry) => entry.command);
      commandIds = executable.map((entry) => entry.id);
    }
    if (!executableCommands.length) return { applied: false, commandCount: 0, commands: [], commandIds: [], verifiedCommandIds: [], verificationFailures: 0 };
    const execution = await this.executeVerifiedBandwidthCommands(executableCommands, credentials, protocol, tenantId, commandIds);
    return { applied: true, commandCount: executableCommands.length, commands: executableCommands, commandIds, ...execution };
  }

  async executeVerifiedBandwidthCommands(commands: BandwidthEnforcementCommand[], credentials?: NetworkCredentials, protocol: NetworkManagementProtocol = 'MIKROTIK_REST', tenantId?: string, commandIds: string[] = []) {
    const adapter = this.adapters[protocol];
    if (!adapter) throw new ServiceUnavailableException(`No traffic enforcement adapter is registered for ${protocol}`);
    try { await adapter.apply(commands, credentials); }
    catch (error) { if (commandIds.length && tenantId) await this.networkCommands!.markFailed(tenantId, commandIds, error); throw error; }
    if (commandIds.length && tenantId) await this.networkCommands!.markExecuted(tenantId, commandIds, { protocol, commandCount: commands.length });
    if (!adapter.verify) {
      if (commandIds.length && tenantId) for (const id of commandIds) await this.networkCommands!.markVerificationFailed(tenantId, id, { reason: 'VERIFICATION_UNSUPPORTED' });
      throw new ServiceUnavailableException(`Verified network enforcement is not supported for ${protocol}`);
    }
    try {
      const verification = await adapter.verify(commands, credentials);
      const verifiedCommandIds: string[] = [];
      let verificationFailures = 0;
      for (let index = 0; index < commands.length; index += 1) {
        const commandId = commandIds[index];
        const result = verification[index];
        if (result?.verified) {
          if (commandId && tenantId) await this.networkCommands!.markVerified(tenantId, commandId, result.details);
          if (commandId) verifiedCommandIds.push(commandId);
        } else {
          verificationFailures += 1;
          if (commandId && tenantId) await this.networkCommands!.markVerificationFailed(tenantId, commandId, result?.details ?? { reason: 'MISSING_VERIFICATION_RESULT' });
        }
      }
      return { verifiedCommandIds, verificationFailures };
    } catch (error) {
      if (commandIds.length && tenantId) for (const id of commandIds) await this.networkCommands!.markVerificationFailed(tenantId, id, { reason: 'VERIFICATION_REQUEST_FAILED' });
      throw error;
    }
  }

  async executePersistedDisconnectCommand(command: NetworkDisconnectCommand, credentials: NetworkCredentials | undefined, protocol: NetworkManagementProtocol, tenantId: string, commandId: string) {
    const adapter = this.adapters[protocol];
    if (!adapter?.disconnect || !adapter.verifyDisconnected) throw new ServiceUnavailableException(`Verified disconnect is not supported for ${protocol}`);
    try {
      const execution = await adapter.disconnect([command], credentials);
      await this.networkCommands!.markExecuted(tenantId, [commandId], execution[0]?.details ?? {});
      const verification = await adapter.verifyDisconnected([command], credentials);
      const result = verification[0];
      if (result?.verified) {
        await this.networkCommands!.markVerified(tenantId, commandId, result.details);
        return { verified: true, details: result.details };
      }
      await this.networkCommands!.markVerificationFailed(tenantId, commandId, result?.details ?? { reason: 'DISCONNECT_VERIFICATION_MISMATCH' });
      return { verified: false, details: result?.details ?? { reason: 'DISCONNECT_VERIFICATION_MISMATCH' } };
    } catch (error) {
      await this.networkCommands!.markFailed(tenantId, [commandId], error);
      throw error;
    }
  }

  async disconnectClient(command: NetworkDisconnectCommand, credentials?: NetworkCredentials, protocol: NetworkManagementProtocol = 'MIKROTIK_REST', tenantId?: string, correlationId?: string): Promise<DisconnectEnforcementResult> {
    const adapter = this.adapters[protocol];
    if (!adapter?.disconnect || !adapter.verifyDisconnected) throw new ServiceUnavailableException(`Verified disconnect is not supported for ${protocol}`);
    let commandId: string | undefined;
    let existingStatus: NetworkCommandStatus | undefined;
    if (this.networkCommands && tenantId) {
      const queued = await this.networkCommands.queue(tenantId, { routerId: command.routerId, commandType: 'DISCONNECT_SESSION', actor: 'network-control', provider: protocol, correlationId, target: { sessionId: command.sessionId, customerId: command.customerId, username: command.username, ipAddress: command.targetAddress, macAddress: command.targetMacAddress }, request: { reason: 'ACCESS_RECONCILIATION' } });
      const persistedCommandId = queued.id;
      commandId = persistedCommandId;
      const existing = await this.networkCommands.get(tenantId, persistedCommandId);
      existingStatus = existing.status as NetworkCommandStatus;
      if (existingStatus === 'VERIFIED') return { applied: false, commandId: persistedCommandId, verified: true, details: existing.verification ?? {} };
      if (existingStatus === 'EXECUTED') {
        try {
          const verification = await adapter.verifyDisconnected([command], credentials);
          const verificationResult = verification[0];
          const verified = verificationResult?.verified === true;
          if (verified && verificationResult) {
            await this.networkCommands.markVerified(tenantId, persistedCommandId, verificationResult.details);
            return { applied: false, commandId: persistedCommandId, verified: true, details: { verification: verificationResult.details } };
          }
          await this.networkCommands.markVerificationFailed(tenantId, persistedCommandId, verificationResult?.details ?? { reason: 'DISCONNECT_VERIFICATION_MISMATCH' });
          existingStatus = 'FAILED';
        } catch {
          await this.networkCommands.markVerificationFailed(tenantId, persistedCommandId, { reason: 'DISCONNECT_VERIFICATION_FAILED' });
          existingStatus = 'FAILED';
        }
      }
      if (existingStatus === 'FAILED' || existingStatus === 'ABANDONED') throw new ServiceUnavailableException(`Network disconnect command ${commandId} is ${existingStatus} and requires explicit retry handling`);
    }
    if (commandId && existingStatus && !executableCommandStates.has(existingStatus)) throw new ServiceUnavailableException(`Network disconnect command ${commandId} is not executable from state ${existingStatus}`);
    try {
      const execution = await adapter.disconnect([command], credentials);
      const details = execution[0]?.details ?? {};
      if (commandId && tenantId) await this.networkCommands!.markExecuted(tenantId, [commandId], details);
      const verification = await adapter.verifyDisconnected([command], credentials);
      const verificationResult = verification[0];
      const verified = verificationResult?.verified === true;
      if (commandId && tenantId && verified && verificationResult) await this.networkCommands!.markVerified(tenantId, commandId, verificationResult.details);
      if (commandId && tenantId && !verified) await this.networkCommands!.markVerificationFailed(tenantId, commandId, verificationResult?.details ?? { reason: 'DISCONNECT_VERIFICATION_MISMATCH' });
      return { applied: execution[0]?.disconnected === true, commandId, verified, details: { execution: details, verification: verification[0]?.details ?? {} } };
    } catch (error) { if (commandId && tenantId) await this.networkCommands!.markFailed(tenantId, [commandId], error); throw error; }
  }

  async clearManaged(apiEndpoint: string, credentials?: NetworkCredentials, protocol: NetworkManagementProtocol = 'MIKROTIK_REST', options?: EnforcementReconcileOptions) {
    const adapter = this.adapters[protocol]; if (!adapter) throw new ServiceUnavailableException(`No traffic enforcement adapter is registered for ${protocol}`);
    return adapter.clearManaged(apiEndpoint, credentials, options);
  }
  async reconcileManaged(apiEndpoint: string, keepQueueNames: string[], credentials?: NetworkCredentials, protocol: NetworkManagementProtocol = 'MIKROTIK_REST', options?: EnforcementReconcileOptions) {
    const adapter = this.adapters[protocol]; if (!adapter) throw new ServiceUnavailableException(`No traffic enforcement adapter is registered for ${protocol}`);
    return adapter.reconcileManaged(apiEndpoint, keepQueueNames, credentials, options);
  }
}
