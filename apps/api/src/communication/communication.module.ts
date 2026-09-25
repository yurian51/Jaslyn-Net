import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommunicationController } from './communication.controller';
import { CommunicationRealtime } from './communication.realtime';
import { CommunicationService } from './communication.service';

@Module({
  imports: [AuditModule],
  controllers: [CommunicationController],
  providers: [CommunicationService, CommunicationRealtime],
  exports: [CommunicationService, CommunicationRealtime],
})
export class CommunicationModule {}
