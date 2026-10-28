import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommunicationModule } from '../communication/communication.module';
import { RoutersModule } from '../routers/routers.module';
import { TrafficModule } from '../modules/traffic/traffic.module';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';
import { ReconciliationWorker } from './reconciliation.worker';

@Module({
  imports: [AuditModule, RoutersModule, TrafficModule, CommunicationModule],
  controllers: [SessionsController],
  providers: [SessionsService, ReconciliationWorker],
  exports: [SessionsService],
})
export class SessionsModule {}
