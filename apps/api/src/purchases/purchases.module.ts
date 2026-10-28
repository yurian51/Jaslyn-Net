import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { CommunicationModule } from '../communication/communication.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';

@Module({
  imports: [PaymentsModule, PromotionsModule, CommunicationModule],
  controllers: [PurchasesController],
  providers: [PurchasesService],
  exports: [PurchasesService],
})
export class PurchasesModule {}
