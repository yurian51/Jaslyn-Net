import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { TrafficModule } from '../modules/traffic/traffic.module';
import { CommunicationCommandService } from './communication.command';
import { CommunicationAiService } from './communication.ai';
import { CommunicationBotService } from './communication.bot';
import { CommunicationController } from './communication.controller';
import { CommunicationRealtime } from './communication.realtime';
import { CommunicationScheduler } from './communication.scheduler';
import { CommunicationService } from './communication.service';
import { CommunicationWebSocket } from './communication.websocket';
import { CommunicationPlatformService } from './communication.platform';
import { CommunicationSuperAppService } from './communication.superapp';
import { CommunicationDomainEventsService } from './communication.domain-events';
import { CommunicationDomainBridge } from './communication.domain-bridge';
import { NetworkAiToolsService } from './network-ai-tools';

@Module({
  imports: [AuditModule, TrafficModule],
  controllers: [CommunicationController],
  providers: [
    CommunicationService,
    CommunicationPlatformService,
    CommunicationCommandService,
    CommunicationAiService,
    NetworkAiToolsService,
    CommunicationBotService,
    CommunicationRealtime,
    CommunicationScheduler,
    CommunicationWebSocket,
    CommunicationSuperAppService,
    CommunicationDomainEventsService,
    CommunicationDomainBridge,
  ],
  exports: [
    CommunicationService,
    CommunicationPlatformService,
    CommunicationCommandService,
    CommunicationAiService,
    CommunicationBotService,
    CommunicationRealtime,
    CommunicationScheduler,
    CommunicationWebSocket,
    CommunicationSuperAppService,
    CommunicationDomainEventsService,
  ],
})
export class CommunicationModule {}
