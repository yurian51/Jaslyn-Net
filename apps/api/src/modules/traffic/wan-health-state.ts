import { WanHealthState } from './load-balancing.types';

export interface WanHealthTransitionInput {
  current: WanHealthState;
  success: boolean;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  failureThreshold: number;
  recoveryThreshold: number;
  utilizationPercent?: number | null;
  degradeThresholdPercent?: number;
}

export interface WanHealthTransition {
  state: WanHealthState;
  changed: boolean;
  reason: 'DISABLED' | 'DRAINING' | 'FAILURE_THRESHOLD' | 'RECOVERY_THRESHOLD' | 'DEGRADED_METRIC' | 'HEALTHY';
}

export function evaluateWanHealth(input: WanHealthTransitionInput): WanHealthTransition {
  if (input.current === 'DISABLED') return { state: 'DISABLED', changed: false, reason: 'DISABLED' };
  if (input.current === 'DRAINING') return { state: 'DRAINING', changed: false, reason: 'DRAINING' };

  if (!input.success && input.consecutiveFailures >= Math.max(1, input.failureThreshold)) {
    return { state: 'UNAVAILABLE', changed: input.current !== 'UNAVAILABLE', reason: 'FAILURE_THRESHOLD' };
  }

  if (input.success && input.current === 'UNAVAILABLE' && input.consecutiveSuccesses < Math.max(1, input.recoveryThreshold)) {
    return { state: 'RECOVERING', changed: true, reason: 'RECOVERY_THRESHOLD' };
  }

  if (input.success && input.current === 'RECOVERING' && input.consecutiveSuccesses >= Math.max(1, input.recoveryThreshold)) {
    return { state: 'HEALTHY', changed: true, reason: 'HEALTHY' };
  }

  const degradeThreshold = input.degradeThresholdPercent == null ? 80 : input.degradeThresholdPercent;
  if (input.success && input.utilizationPercent != null && input.utilizationPercent >= degradeThreshold) {
    return { state: 'DEGRADED', changed: input.current !== 'DEGRADED', reason: 'DEGRADED_METRIC' };
  }

  if (input.success && ['UNKNOWN', 'DEGRADED'].includes(input.current)) {
    return { state: 'HEALTHY', changed: input.current !== 'HEALTHY', reason: 'HEALTHY' };
  }

  return { state: input.current, changed: false, reason: 'HEALTHY' };
}
