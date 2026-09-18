import { Module } from '@nestjs/common';
import { SecureNetworkCredentials } from '../../common/secure-network-credentials';
import { AuditModule } from '../../audit/audit.module';
import { FairnessService } from './fairness.service';
import { TrafficEnforcementService } from './enforcement.service';
import { MikroTikTrafficEnforcementAdapter } from './mikrotik.adapter';
import { MerakiTrafficEnforcementAdapter } from './meraki.adapter';
import { NetworkDeviceAdapterRegistry } from './network-device.adapter';
import { TrafficSamplesController } from './traffic-samples.controller';
import { TrafficSamplesService } from './traffic-samples.service';
import { TrafficOrchestratorService } from './traffic-orchestrator.service';
import { TrafficOrchestratorController } from './traffic-orchestrator.controller';
import { TrafficCollectorService } from './traffic-collector.service';
import { NetworkCommandService } from './network-command.service';
import { NetworkCommandController } from './network-command.controller';
import { NetworkCommandWorkerService } from './network-command-worker.service';
import { LoadBalancingController } from './load-balancing.controller';
import { LoadBalancingService } from './load-balancing.service';
import { LoadBalancingEngine } from './load-balancing.engine';

@Module({
  imports: [AuditModule],
  controllers: [TrafficSamplesController, TrafficOrchestratorController, NetworkCommandController, LoadBalancingController],
  providers: [
    SecureNetworkCredentials,
    FairnessService,
    TrafficSamplesService,
    NetworkCommandService,
    MikroTikTrafficEnforcementAdapter,
    MerakiTrafficEnforcementAdapter,
    NetworkDeviceAdapterRegistry,
    {
      provide: TrafficEnforcementService,
      useFactory: (
        fairnessService: FairnessService,
        mikrotik: MikroTikTrafficEnforcementAdapter,
        meraki: MerakiTrafficEnforcementAdapter,
        networkCommands: NetworkCommandService,
      ) => new TrafficEnforcementService(fairnessService, {
        MIKROTIK_REST: mikrotik,
        MERAKI_DASHBOARD_API: meraki,
      }, networkCommands),
      inject: [FairnessService, MikroTikTrafficEnforcementAdapter, MerakiTrafficEnforcementAdapter, NetworkCommandService],
    },
    TrafficOrchestratorService,
    TrafficCollectorService,
    NetworkCommandWorkerService,
    LoadBalancingEngine,
    LoadBalancingService,
  ],
  exports: [FairnessService, TrafficEnforcementService, TrafficSamplesService, TrafficOrchestratorService, NetworkDeviceAdapterRegistry, NetworkCommandService, LoadBalancingService],
})
export class TrafficModule {}
