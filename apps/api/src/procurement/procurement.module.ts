import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ProcurementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';

@Module({
  imports:[AuditModule],
  controllers:[ProcurementController],
  providers:[ProcurementService],
  exports:[ProcurementService],
})
export class ProcurementModule {}
