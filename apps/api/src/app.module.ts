import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AccountModule } from './account/account.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { CustomersModule } from './customers/customers.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { FinanceModule } from './finance/finance.module';
import { IncidentsModule } from './incidents/incidents.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OverviewModule } from './overview/overview.module';
import { PackagesModule } from './packages/packages.module';
import { PurchasesModule } from './purchases/purchases.module';
import { PaymentsModule } from './payments/payments.module';
import { PromotionsModule } from './promotions/promotions.module';
import { RoutersModule } from './routers/routers.module';
import { SalesModule } from './sales/sales.module';
import { SessionsModule } from './sessions/sessions.module';
import { VouchersModule } from './vouchers/vouchers.module';
import { UpesiPayModule } from './upesipay/upesipay.module';
import { UpesiLipaModule } from './upesilipa/upesilipa.module';
import { TrafficModule } from './modules/traffic/traffic.module';
import { IspOperationsModule } from './isp-operations/isp-operations.module';
import { IpamModule } from './ipam/ipam.module';
import { RadiusModule } from './radius/radius.module';
import { CommunicationModule } from './communication/communication.module';
import { CustomerCommerceModule } from './customer-commerce/customer-commerce.module';
import { RequestIdMiddleware } from './common/request-id.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, AccountModule, AuditModule, AuthModule,
    HealthModule, FinanceModule, IncidentsModule, NotificationsModule, CommunicationModule, OverviewModule,
    CustomersModule, BillingModule, PackagesModule, PurchasesModule, PaymentsModule, PromotionsModule,
    RoutersModule, SessionsModule, SalesModule, VouchersModule, UpesiPayModule, UpesiLipaModule,
    TrafficModule, IspOperationsModule, IpamModule, RadiusModule, CustomerCommerceModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) { consumer.apply(RequestIdMiddleware).forRoutes('*'); }
}
