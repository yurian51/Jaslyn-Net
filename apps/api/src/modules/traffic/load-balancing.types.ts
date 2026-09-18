export const LOAD_BALANCE_STRATEGIES = [
  'WEIGHTED',
  'PRIMARY_SECONDARY',
  'LEAST_UTILIZED',
  'CONNECTION_BASED',
  'POLICY_BASED',
  'SERVICE_BASED',
  'DESTINATION_BASED',
  'SOURCE_BASED',
  'SUBNET_BASED',
  'CUSTOMER_BASED',
] as const;

export type LoadBalanceStrategy = typeof LOAD_BALANCE_STRATEGIES[number];

export const WAN_HEALTH_STATES = [
  'HEALTHY',
  'DEGRADED',
  'UNAVAILABLE',
  'RECOVERING',
  'DISABLED',
  'DRAINING',
  'UNKNOWN',
] as const;

export type WanHealthState = typeof WAN_HEALTH_STATES[number];

export interface WanMemberState {
  id: string;
  name: string;
  provider?: string;
  interfaceName?: string;
  gateway?: string;
  capacityMbps: number;
  configuredWeight: number;
  priority: number;
  enabled: boolean;
  drainRequested: boolean;
  healthState: WanHealthState;
  latencyMs: number | null;
  jitterMs: number | null;
  packetLossPercent: number | null;
  observedUtilizationPercent: number | null;
  observedUploadBps: string;
  observedDownloadBps: string;
  activeSessions: number;
  lastHealthCheckAt: string | null;
  lastStateChangeAt: string | null;
}

export interface LoadBalanceDecision {
  policyId: string;
  strategy: LoadBalanceStrategy;
  eligibleMembers: Array<{
    wanConnectionId: string;
    configuredWeight: number;
    effectiveWeight: number;
    priority: number;
    healthState: WanHealthState;
    capacityMbps: number;
    utilizationPercent: number | null;
  }>;
  failoverActive: boolean;
}
