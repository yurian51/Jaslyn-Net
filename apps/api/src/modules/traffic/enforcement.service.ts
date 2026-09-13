import { FairnessService, FairnessPolicy } from './fairness.service';
import {
  BandwidthEnforcementCommand,
  TrafficEnforcementAdapter,
  toEnforcementCommands,
} from './enforcement.adapter';
import { FairnessInput } from './fairness.engine';
import { NetworkCredentials } from '../../common/secure-network-credentials';

export interface EnforcementTarget {
  targetAddress?: string;
  apiEndpoint?: string;
}

export interface EnforcementResult {
  applied: boolean;
  commandCount: number;
  commands: BandwidthEnforcementCommand[];
  mode: string;
  utilizationPercent: number;
}

export class TrafficEnforcementService {
  constructor(
    private readonly fairnessService: FairnessService,
    private readonly adapter: TrafficEnforcementAdapter,
  ) {}

  async evaluateAndApply(
    routerId: string,
    policy: FairnessPolicy,
    activeUsers: FairnessInput['activeUsers'],
    targets: Record<string, EnforcementTarget> = {},
    uploadRatio = 0.5,
    credentials?: NetworkCredentials,
  ): Promise<EnforcementResult> {
    const state = this.fairnessService.evaluate(policy, activeUsers);
    const commands = toEnforcementCommands(routerId, state.allocations, uploadRatio, targets);
    await this.adapter.apply(commands, credentials);
    return {
      applied: commands.length > 0,
      commandCount: commands.length,
      commands,
      mode: state.mode,
      utilizationPercent: Number(state.utilizationPercent.toFixed(3)),
    };
  }

  async clearManaged(apiEndpoint: string, credentials?: NetworkCredentials) {
    return this.adapter.clearManaged(apiEndpoint, credentials);
  }

  async reconcileManaged(apiEndpoint: string, keepQueueNames: string[], credentials?: NetworkCredentials) {
    return this.adapter.reconcileManaged(apiEndpoint, keepQueueNames, credentials);
  }
}
