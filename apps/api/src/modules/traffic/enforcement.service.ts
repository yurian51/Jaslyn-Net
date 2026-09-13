import { FairnessService, FairnessPolicy } from './fairness.service';
import {
  BandwidthEnforcementCommand,
  TrafficEnforcementAdapter,
  toEnforcementCommands,
} from './enforcement.adapter';
import { FairnessInput } from './fairness.engine';

export interface EnforcementResult {
  applied: boolean;
  commandCount: number;
  commands: BandwidthEnforcementCommand[];
}

/**
 * Connects fairness policy decisions to a concrete router adapter.
 * The adapter owns all network side effects; this service remains deterministic.
 */
export class TrafficEnforcementService {
  constructor(
    private readonly fairnessService = new FairnessService(),
    private readonly adapter: TrafficEnforcementAdapter,
  ) {}

  async evaluateAndApply(
    routerId: string,
    policy: FairnessPolicy,
    activeUsers: FairnessInput['activeUsers'],
    uploadRatio = 0.5,
  ): Promise<EnforcementResult> {
    const state = this.fairnessService.evaluate(policy, activeUsers);
    const commands = toEnforcementCommands(routerId, state.allocations, uploadRatio);
    await this.adapter.apply(commands);
    return {
      applied: commands.length > 0,
      commandCount: commands.length,
      commands,
    };
  }
}
