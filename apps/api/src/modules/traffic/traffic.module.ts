import { Module } from '@nestjs/common';
import { FairnessService } from './fairness.service';
import { TrafficEnforcementService } from './enforcement.service';
import { NoopTrafficEnforcementAdapter } from './enforcement.adapter';
import { TrafficSamplesService } from './traffic-samples.service';

@Module({
  providers: [
    FairnessService,
    TrafficSamplesService,
    NoopTrafficEnforcementAdapter,
    {
      provide: TrafficEnforcementService,
      useFactory: (fairnessService: FairnessService, adapter: NoopTrafficEnforcementAdapter) =>
        new TrafficEnforcementService(fairnessService, adapter),
      inject: [FairnessService, NoopTrafficEnforcementAdapter],
    },
  ],
  exports: [FairnessService, TrafficEnforcementService, TrafficSamplesService],
})
export class TrafficModule {}
