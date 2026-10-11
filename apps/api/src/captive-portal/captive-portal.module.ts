import { Module } from '@nestjs/common';
import { CaptivePortalController } from './captive-portal.controller';
import { CaptivePortalService } from './captive-portal.service';

@Module({ controllers: [CaptivePortalController], providers: [CaptivePortalService], exports: [CaptivePortalService] })
export class CaptivePortalModule {}
