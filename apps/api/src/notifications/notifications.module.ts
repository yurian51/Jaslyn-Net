import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { BeemSmsProvider } from './sms.provider';
import { SmsGatewayService } from './sms-gateway.service';
import { NotificationsWorker } from './notifications.worker';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, BeemSmsProvider, SmsGatewayService, NotificationsWorker],
  exports: [NotificationsService, SmsGatewayService],
})
export class NotificationsModule {}
