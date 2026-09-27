import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommunicationCommandService } from './communication.command';
import { CommunicationBotService } from './communication.bot';
import { CommunicationController } from './communication.controller';
import { CommunicationRealtime } from './communication.realtime';
import { CommunicationScheduler } from './communication.scheduler';
import { CommunicationService } from './communication.service';
import { CommunicationWebSocket } from './communication.websocket';
import { CommunicationPlatformService } from './communication.platform';
import { CommunicationAttachmentService } from './communication.attachments';

@Module({
  imports: [AuditModule],
  controllers: [CommunicationController],
  providers: [
    CommunicationService,
    CommunicationPlatformService,
    CommunicationCommandService,
    CommunicationBotService,
    CommunicationRealtime,
    CommunicationScheduler,
    CommunicationWebSocket,
    CommunicationAttachmentService,
  ],
  exports: [
    CommunicationService,
    CommunicationPlatformService,
    CommunicationCommandService,
    CommunicationBotService,
    CommunicationRealtime,
    CommunicationScheduler,
    CommunicationWebSocket,
    CommunicationAttachmentService,
  ],
})
export class CommunicationModule {}
