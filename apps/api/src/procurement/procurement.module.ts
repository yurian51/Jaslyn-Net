import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ProcurementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';
import { PlatformIntegrationsController } from './platform-integrations.controller';
import { PlatformIntegrationsService } from './platform-integrations.service';
import { ApiKeyGuard } from './api-key.guard';
import { PublicApiController } from './public-api.controller';

@Module({
  imports:[AuditModule],
  controllers:[ProcurementController,PlatformIntegrationsController,PublicApiController],
  providers:[ProcurementService,PlatformIntegrationsService,ApiKeyGuard],
  exports:[ProcurementService],
})
export class ProcurementModule {}
