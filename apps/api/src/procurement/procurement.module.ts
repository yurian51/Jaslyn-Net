import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ProcurementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';
import { PlatformIntegrationsController } from './platform-integrations.controller';
import { PlatformIntegrationsService } from './platform-integrations.service';
import { ApiKeyGuard } from './api-key.guard';
import { PublicApiController } from './public-api.controller';
import { WebhookDeliveryWorker } from './webhook-delivery.worker';
import { TenantHierarchyController } from './tenant-hierarchy.controller';
import { TenantHierarchyService } from './tenant-hierarchy.service';
import { SecretsVaultModule } from '../secrets-vault/secrets-vault.module';

@Module({
  imports:[AuditModule,SecretsVaultModule],
  controllers:[ProcurementController,PlatformIntegrationsController,PublicApiController,TenantHierarchyController],
  providers:[ProcurementService,PlatformIntegrationsService,ApiKeyGuard,WebhookDeliveryWorker,TenantHierarchyService],
  exports:[ProcurementService],
})
export class ProcurementModule {}
