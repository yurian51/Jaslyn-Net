import { FairnessAllocation } from './traffic.types';
import { NetworkCredentials } from '../../common/secure-network-credentials';
import { NetworkManagementProtocol } from '../../routers/routers.dto';

export interface EnforcementReconcileOptions { merakiGroupPolicyId?: string; }
export interface BandwidthEnforcementCommand {
  routerId: string; customerId: string; sessionId?: string; targetAddress?: string; targetMacAddress?: string;
  apiEndpoint?: string; protocol?: NetworkManagementProtocol; merakiGroupPolicyId?: string;
  maxDownloadMbps: number; maxUploadMbps: number; priority: number;
}
export interface EnforcementVerification { verified: boolean; details: Record<string, unknown>; }
export interface TrafficEnforcementAdapter {
  apply(commands: BandwidthEnforcementCommand[], credentials?: NetworkCredentials): Promise<void>;
  verify?(commands: BandwidthEnforcementCommand[], credentials?: NetworkCredentials): Promise<EnforcementVerification[]>;
  clearManaged(apiEndpoint: string, credentials?: NetworkCredentials, options?: EnforcementReconcileOptions): Promise<number>;
  reconcileManaged(apiEndpoint: string, keepQueueNames: string[], credentials?: NetworkCredentials, options?: EnforcementReconcileOptions): Promise<number>;
}
export interface EnforcementSpeedLimit { maxDownloadMbps: number; maxUploadMbps: number; }
export function toEnforcementCommands(routerId: string, allocations: FairnessAllocation[], uploadRatio = 0.5,
  targets: Record<string, { targetAddress?: string; targetMacAddress?: string; apiEndpoint?: string; protocol?: NetworkManagementProtocol; merakiGroupPolicyId?: string }> = {},
  serviceLimits: Record<string, EnforcementSpeedLimit> = {}): BandwidthEnforcementCommand[] {
  const ratio = Number.isFinite(uploadRatio) ? Math.max(0, Math.min(1, uploadRatio)) : 0.5;
  return allocations.filter((a) => Number.isFinite(a.allocatedMbps) && a.allocatedMbps > 0).map((a) => {
    const key = `${a.customerId}:${a.sessionId ?? ''}`; const target = targets[key] ?? {}; const limit = serviceLimits[key];
    const download = Number(a.allocatedMbps); const upload = download * ratio;
    return { routerId, customerId: a.customerId, sessionId: a.sessionId, targetAddress: target.targetAddress, targetMacAddress: target.targetMacAddress,
      apiEndpoint: target.apiEndpoint, protocol: target.protocol, merakiGroupPolicyId: target.merakiGroupPolicyId,
      maxDownloadMbps: Number(Math.min(download, limit?.maxDownloadMbps ?? Number.POSITIVE_INFINITY).toFixed(3)),
      maxUploadMbps: Number(Math.min(upload, limit?.maxUploadMbps ?? Number.POSITIVE_INFINITY).toFixed(3)), priority: Math.max(1, Math.round(a.priority)) };
  });
}
export class NoopTrafficEnforcementAdapter implements TrafficEnforcementAdapter {
  async apply(_commands: BandwidthEnforcementCommand[], _credentials?: NetworkCredentials): Promise<void> {}
  async verify(commands: BandwidthEnforcementCommand[]): Promise<EnforcementVerification[]> { return commands.map(() => ({ verified: false, details: { reason: 'NOOP_ADAPTER' } })); }
  async clearManaged(_apiEndpoint: string, _credentials?: NetworkCredentials, _options?: EnforcementReconcileOptions): Promise<number> { return 0; }
  async reconcileManaged(_apiEndpoint: string, _keepQueueNames: string[], _credentials?: NetworkCredentials, _options?: EnforcementReconcileOptions): Promise<number> { return 0; }
}
