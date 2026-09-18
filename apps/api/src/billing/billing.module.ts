import { Module } from '@nestjs/common';
import { PurchasesModule } from '../purchases/purchases.module';
import { PaymentsModule } from '../payments/payments.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

@Module({
  imports: [PurchasesModule, PaymentsModule],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
