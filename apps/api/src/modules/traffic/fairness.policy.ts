import { FairnessDecision, TrafficFairnessMode } from './traffic.types';

export interface FairnessPolicy {
  capacityMbps: number;
  activateThresholdPercent: number;
  aggressiveThresholdPercent: number;
  recoveryThresholdPercent: number;
  enabled: boolean;
}

export interface FairnessTransition {
  from: TrafficFairnessMode;
  to: TrafficFairnessMode;
  changed: boolean;
}

export function normalizeFairnessPolicy(input: Partial<FairnessPolicy>): FairnessPolicy {
  const capacityMbps = Number(input.capacityMbps ?? 0);
  const activate = Number(input.activateThresholdPercent ?? 80);
  const aggressive = Number(input.aggressiveThresholdPercent ?? 90);
  const recovery = Number(input.recoveryThresholdPercent ?? 60);

  if (!Number.isFinite(capacityMbps) || capacityMbps <= 0) throw new Error('capacityMbps must be greater than zero');
  if (![activate, aggressive, recovery].every(Number.isFinite)) throw new Error('fairness thresholds must be finite numbers');
  if (recovery < 0 || recovery >= activate || activate > aggressive || aggressive > 100) {
    throw new Error('fairness thresholds must satisfy 0 <= recovery < activate <= aggressive <= 100');
  }

  return {
    capacityMbps,
    activateThresholdPercent: activate,
    aggressiveThresholdPercent: aggressive,
    recoveryThresholdPercent: recovery,
    enabled: input.enabled ?? true,
  };
}

export function transitionFairnessMode(
  previous: TrafficFairnessMode | undefined,
  decision: FairnessDecision,
): FairnessTransition {
  const from = previous ?? decision.mode;
  return { from, to: decision.mode, changed: from !== decision.mode };
}
