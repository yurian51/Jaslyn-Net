import { Module } from '@nestjs/common';
import { VouchersModule } from '../vouchers/vouchers.module';
import { CaptivePortalController } from './captive-portal.controller';
import { CaptivePortalService } from './captive-portal.service';

@Module({
  imports: [VouchersModule],
  controllers: [CaptivePortalController],
  providers: [CaptivePortalService],
  exports: [CaptivePortalService],
})
export class CaptivePortalModule {}
