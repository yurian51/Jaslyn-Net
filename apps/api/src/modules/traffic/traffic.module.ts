import { Module } from '@nestjs/common';
import { FairnessService } from './fairness.service';

@Module({
  providers: [FairnessService],
  exports: [FairnessService],
})
export class TrafficModule {}
