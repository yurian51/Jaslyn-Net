import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommunicationController } from './communication.controller';
import { CommunicationRealtime } from './communication.realtime';
import { CommunicationService } from './communication.service';
import { CommunicationWebSocket } from './communication.websocket';

@Module({
  imports: [AuditModule],
  controllers: [CommunicationController],
  providers: [CommunicationService, CommunicationRealtime, CommunicationWebSocket],
  exports: [CommunicationService, CommunicationRealtime, CommunicationWebSocket],
})
export class CommunicationModule {}
