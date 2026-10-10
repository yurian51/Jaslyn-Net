import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { BeemSmsProvider } from './sms.provider';
import { NotificationsWorker } from './notifications.worker';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, BeemSmsProvider, NotificationsWorker],
  exports: [NotificationsService],
})
export class NotificationsModule {}
