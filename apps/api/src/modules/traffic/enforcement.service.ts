import { FairnessService, FairnessPolicy } from './fairness.service';
import {
  BandwidthEnforcementCommand,
  TrafficEnforcementAdapter,
  toEnforcementCommands,
} from './enforcement.adapter';
import { FairnessInput } from './fairness.engine';
import { NetworkCredentials } from '../../common/secure-network-credentials';
import { NetworkManagementProtocol } from '../../routers/routers.dto';

export interface EnforcementTarget {
  targetAddress?: string;
  targetMacAddress?: string;
  apiEndpoint?: string;
  protocol?: NetworkManagementProtocol;
  merakiGroupPolicyId?: string;
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
    private readonly adapters: Partial<Record<NetworkManagementProtocol, TrafficEnforcementAdapter>>,
  ) {}

  async evaluateAndApply(
    routerId: string,
    policy: FairnessPolicy,
    activeUsers: FairnessInput['activeUsers'],
    targets: Record<string, EnforcementTarget> = {},
    uploadRatio = 0.5,
    credentials?: NetworkCredentials,
    protocol: NetworkManagementProtocol = 'MIKROTIK_REST',
  ): Promise<EnforcementResult> {
    const state = this.fairnessService.evaluate(policy, activeUsers);
    const commands = toEnforcementCommands(routerId, state.allocations, uploadRatio, targets);
    const adapter = this.adapters[protocol];
    if (!adapter) throw new Error(`No traffic enforcement adapter is registered for ${protocol}`);
    await adapter.apply(commands, credentials);
    return {
      applied: commands.length > 0,
      commandCount: commands.length,
      commands,
      mode: state.mode,
      utilizationPercent: Number(state.utilizationPercent.toFixed(3)),
    };
  }

  async clearManaged(apiEndpoint: string, credentials?: NetworkCredentials, protocol: NetworkManagementProtocol = 'MIKROTIK_REST') {
    const adapter = this.adapters[protocol];
    if (!adapter) throw new Error(`No traffic enforcement adapter is registered for ${protocol}`);
    return adapter.clearManaged(apiEndpoint, credentials);
  }

  async reconcileManaged(apiEndpoint: string, keepQueueNames: string[], credentials?: NetworkCredentials, protocol: NetworkManagementProtocol = 'MIKROTIK_REST') {
    const adapter = this.adapters[protocol];
    if (!adapter) throw new Error(`No traffic enforcement adapter is registered for ${protocol}`);
    return adapter.reconcileManaged(apiEndpoint, keepQueueNames, credentials);
  }
}
