import { Module } from '@nestjs/common';
import { SecureNetworkCredentials } from '../../common/secure-network-credentials';
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

@Module({
  controllers: [TrafficSamplesController, TrafficOrchestratorController],
  providers: [
    SecureNetworkCredentials,
    FairnessService,
    TrafficSamplesService,
    MikroTikTrafficEnforcementAdapter,
    MerakiTrafficEnforcementAdapter,
    NetworkDeviceAdapterRegistry,
    {
      provide: TrafficEnforcementService,
      useFactory: (
        fairnessService: FairnessService,
        mikrotik: MikroTikTrafficEnforcementAdapter,
        meraki: MerakiTrafficEnforcementAdapter,
      ) => new TrafficEnforcementService(fairnessService, {
        MIKROTIK_REST: mikrotik,
        MERAKI_DASHBOARD_API: meraki,
      }),
      inject: [FairnessService, MikroTikTrafficEnforcementAdapter, MerakiTrafficEnforcementAdapter],
    },
    TrafficOrchestratorService,
    TrafficCollectorService,
  ],
  exports: [FairnessService, TrafficEnforcementService, TrafficSamplesService, TrafficOrchestratorService, NetworkDeviceAdapterRegistry],
})
export class TrafficModule {}
