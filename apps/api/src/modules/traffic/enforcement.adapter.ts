import { FairnessAllocation } from './traffic.types';

export interface BandwidthEnforcementCommand {
  routerId: string;
  customerId: string;
  sessionId?: string;
  maxDownloadMbps: number;
  maxUploadMbps: number;
  priority: number;
}

export interface TrafficEnforcementAdapter {
  apply(commands: BandwidthEnforcementCommand[]): Promise<void>;
}

/**
 * Converts fairness decisions into router-neutral enforcement commands.
 * A concrete MikroTik adapter can implement TrafficEnforcementAdapter without
 * coupling policy calculations to RouterOS transport details.
 */
export function toEnforcementCommands(
  routerId: string,
  allocations: FairnessAllocation[],
  uploadRatio = 0.5,
): BandwidthEnforcementCommand[] {
  const ratio = Number.isFinite(uploadRatio) ? Math.max(0, Math.min(1, uploadRatio)) : 0.5;
  return allocations
    .filter((a) => Number.isFinite(a.allocatedMbps) && a.allocatedMbps > 0)
    .map((a) => ({
      routerId,
      customerId: a.customerId,
      sessionId: a.sessionId,
      maxDownloadMbps: Number(a.allocatedMbps.toFixed(3)),
      maxUploadMbps: Number((a.allocatedMbps * ratio).toFixed(3)),
      priority: Math.max(1, Math.round(a.priority)),
    }));
}

export class NoopTrafficEnforcementAdapter implements TrafficEnforcementAdapter {
  async apply(_commands: BandwidthEnforcementCommand[]): Promise<void> {
    // Intentionally side-effect free until a configured router adapter is supplied.
  }
}
