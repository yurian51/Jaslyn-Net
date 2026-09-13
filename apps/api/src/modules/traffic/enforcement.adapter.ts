import { FairnessAllocation } from './traffic.types';
import { NetworkCredentials } from '../../common/secure-network-credentials';

export interface BandwidthEnforcementCommand {
  routerId: string;
  customerId: string;
  sessionId?: string;
  targetAddress?: string;
  apiEndpoint?: string;
  maxDownloadMbps: number;
  maxUploadMbps: number;
  priority: number;
}

export interface TrafficEnforcementAdapter {
  apply(commands: BandwidthEnforcementCommand[], credentials?: NetworkCredentials): Promise<void>;
  clearManaged(apiEndpoint: string, credentials?: NetworkCredentials): Promise<number>;
  reconcileManaged(apiEndpoint: string, keepQueueNames: string[], credentials?: NetworkCredentials): Promise<number>;
}

export function toEnforcementCommands(
  routerId: string,
  allocations: FairnessAllocation[],
  uploadRatio = 0.5,
  targets: Record<string, { targetAddress?: string; apiEndpoint?: string }> = {},
): BandwidthEnforcementCommand[] {
  const ratio = Number.isFinite(uploadRatio) ? Math.max(0, Math.min(1, uploadRatio)) : 0.5;
  return allocations
    .filter((a) => Number.isFinite(a.allocatedMbps) && a.allocatedMbps > 0)
    .map((a) => {
      const key = `${a.customerId}:${a.sessionId ?? ''}`;
      const target = targets[key] ?? {};
      return {
        routerId,
        customerId: a.customerId,
        sessionId: a.sessionId,
        targetAddress: target.targetAddress,
        apiEndpoint: target.apiEndpoint,
        maxDownloadMbps: Number(a.allocatedMbps.toFixed(3)),
        maxUploadMbps: Number((a.allocatedMbps * ratio).toFixed(3)),
        priority: Math.max(1, Math.round(a.priority)),
      };
    });
}

export class NoopTrafficEnforcementAdapter implements TrafficEnforcementAdapter {
  async apply(_commands: BandwidthEnforcementCommand[], _credentials?: NetworkCredentials): Promise<void> {}
  async clearManaged(_apiEndpoint: string, _credentials?: NetworkCredentials): Promise<number> { return 0; }
  async reconcileManaged(_apiEndpoint: string, _keepQueueNames: string[], _credentials?: NetworkCredentials): Promise<number> { return 0; }
}
