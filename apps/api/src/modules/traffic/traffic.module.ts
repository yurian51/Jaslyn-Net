import { Module } from '@nestjs/common';
import { FairnessService } from './fairness.service';
import { TrafficEnforcementService } from './enforcement.service';
import { MikroTikTrafficEnforcementAdapter } from './mikrotik.adapter';
import { TrafficSamplesController } from './traffic-samples.controller';
import { TrafficSamplesService } from './traffic-samples.service';
import { TrafficOrchestratorService } from './traffic-orchestrator.service';
import { TrafficOrchestratorController } from './traffic-orchestrator.controller';

@Module({
  controllers: [TrafficSamplesController, TrafficOrchestratorController],
  providers: [
    FairnessService,
    TrafficSamplesService,
    MikroTikTrafficEnforcementAdapter,
    {
      provide: TrafficEnforcementService,
      useFactory: (fairnessService: FairnessService, adapter: MikroTikTrafficEnforcementAdapter) =>
        new TrafficEnforcementService(fairnessService, adapter),
      inject: [FairnessService, MikroTikTrafficEnforcementAdapter],
    },
    TrafficOrchestratorService,
  ],
  exports: [FairnessService, TrafficEnforcementService, TrafficSamplesService, TrafficOrchestratorService],
})
export class TrafficModule {}
