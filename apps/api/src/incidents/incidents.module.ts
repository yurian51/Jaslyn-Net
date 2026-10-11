import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommunicationModule } from '../communication/communication.module';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';
import { PublicStatusController } from './public-status.controller';
import { IncidentEscalationWorker } from './incident-escalation.worker';

@Module({
  imports: [AuditModule, CommunicationModule],
  controllers: [IncidentsController, PublicStatusController],
  providers: [IncidentsService, IncidentEscalationWorker],
  exports: [IncidentsService],
})
export class IncidentsModule {}
