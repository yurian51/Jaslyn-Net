import { Module } from '@nestjs/common';
import { PurchasesModule } from '../purchases/purchases.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CustomerCommerceController } from './customer-commerce.controller';
import { CustomerCommerceService } from './customer-commerce.service';

@Module({imports:[PurchasesModule,NotificationsModule],controllers:[CustomerCommerceController],providers:[CustomerCommerceService],exports:[CustomerCommerceService]})
export class CustomerCommerceModule {}
