import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { WorkflowsController, WorkflowWebhookController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import { WorkflowsWorker } from './workflows.worker';

@Module({
  imports:[AuditModule],
  controllers:[WorkflowsController,WorkflowWebhookController],
  providers:[WorkflowsService,WorkflowsWorker],
  exports:[WorkflowsService],
})
export class WorkflowsModule {}
