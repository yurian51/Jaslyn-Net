export type TrafficFairnessMode = 'NORMAL' | 'FAIRNESS_ACTIVE' | 'AGGRESSIVE' | 'RECOVERING';

export interface TrafficSample {
  tenantId: string;
  routerId: string;
  customerId?: string;
  sessionId?: string;
  bytesIn: number;
  bytesOut: number;
  sampledAt: Date;
}

export interface FairnessAllocation {
  customerId: string;
  sessionId?: string;
  requestedMbps: number;
  allocatedMbps: number;
  weight: number;
  priority: number;
}

export interface FairnessDecision {
  mode: TrafficFairnessMode;
  utilizationPercent: number;
  capacityMbps: number;
  allocations: FairnessAllocation[];
}
