import { Module } from '@nestjs/common';
import { FairnessService } from './fairness.service';
import { TrafficEnforcementService } from './enforcement.service';
import { MikroTikTrafficEnforcementAdapter } from './mikrotik.adapter';
import { NetworkDeviceAdapterRegistry } from './network-device.adapter';
import { TrafficSamplesController } from './traffic-samples.controller';
import { TrafficSamplesService } from './traffic-samples.service';
import { TrafficOrchestratorService } from './traffic-orchestrator.service';
import { TrafficOrchestratorController } from './traffic-orchestrator.controller';
import { TrafficCollectorService } from './traffic-collector.service';

@Module({
  controllers: [TrafficSamplesController, TrafficOrchestratorController],
  providers: [
    FairnessService,
    TrafficSamplesService,
    MikroTikTrafficEnforcementAdapter,
    NetworkDeviceAdapterRegistry,
    {
      provide: TrafficEnforcementService,
      useFactory: (fairnessService: FairnessService, adapter: MikroTikTrafficEnforcementAdapter) =>
        new TrafficEnforcementService(fairnessService, adapter),
      inject: [FairnessService, MikroTikTrafficEnforcementAdapter],
    },
    TrafficOrchestratorService,
    TrafficCollectorService,
  ],
  exports: [FairnessService, TrafficEnforcementService, TrafficSamplesService, TrafficOrchestratorService, NetworkDeviceAdapterRegistry],
})
export class TrafficModule {}
