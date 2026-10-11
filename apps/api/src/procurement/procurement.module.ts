import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ProcurementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';
import { PlatformIntegrationsController } from './platform-integrations.controller';
import { PlatformIntegrationsService } from './platform-integrations.service';

@Module({
  imports:[AuditModule],
  controllers:[ProcurementController,PlatformIntegrationsController],
  providers:[ProcurementService,PlatformIntegrationsService],
  exports:[ProcurementService],
})
export class ProcurementModule {}
