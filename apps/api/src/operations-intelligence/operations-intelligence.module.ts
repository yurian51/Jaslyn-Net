import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OperationsIntelligenceController } from './operations-intelligence.controller';
import { OperationsIntelligenceService } from './operations-intelligence.service';

@Module({
  imports:[AuditModule],
  controllers:[OperationsIntelligenceController],
  providers:[OperationsIntelligenceService],
  exports:[OperationsIntelligenceService],
})
export class OperationsIntelligenceModule {}
