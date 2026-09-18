import { NetworkManagementProtocol } from '../../routers/routers.dto';
import { LoadBalanceDecision } from './load-balancing.types';

export interface WanRoutingTarget {
  wanConnectionId: string;
  interfaceName?: string | null;
  gateway?: string | null;
  weight: number;
  priority: number;
}

export interface WanRoutingApplyResult {
  applied: boolean;
  verified: boolean;
  protocol: NetworkManagementProtocol;
  remoteState?: unknown;
  reason?: string;
}

export interface WanRoutingAdapter {
  readonly protocol: NetworkManagementProtocol;
  capabilities(): string[];
  readWanState(routerId: string): Promise<unknown>;
  applyLoadBalanceDecision(routerId: string, decision: LoadBalanceDecision, targets: WanRoutingTarget[]): Promise<WanRoutingApplyResult>;
  verifyLoadBalanceDecision(routerId: string, decision: LoadBalanceDecision, targets: WanRoutingTarget[]): Promise<WanRoutingApplyResult>;
}

export const WAN_ROUTE_WRITE_UNAVAILABLE = 'ROUTE_WRITE_ADAPTER_NOT_IMPLEMENTED';
