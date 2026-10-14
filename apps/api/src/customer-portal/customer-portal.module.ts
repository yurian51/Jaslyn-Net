import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CustomerCommerceModule } from '../customer-commerce/customer-commerce.module';
import { PaymentsModule } from '../payments/payments.module';
import { PurchasesModule } from '../purchases/purchases.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CustomerPortalController } from './customer-portal.controller';
import { CustomerPortalGuard } from './customer-portal.guard';
import { CustomerPortalService } from './customer-portal.service';

@Module({imports:[AuditModule,CustomerCommerceModule,PaymentsModule,PurchasesModule,NotificationsModule],controllers:[CustomerPortalController],providers:[CustomerPortalService,CustomerPortalGuard],exports:[CustomerPortalService]})
export class CustomerPortalModule {}
