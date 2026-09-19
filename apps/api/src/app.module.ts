import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AccountModule } from './account/account.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { CustomersModule } from './customers/customers.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { IncidentsModule } from './incidents/incidents.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OverviewModule } from './overview/overview.module';
import { PackagesModule } from './packages/packages.module';
import { PurchasesModule } from './purchases/purchases.module';
import { PaymentsModule } from './payments/payments.module';
import { RoutersModule } from './routers/routers.module';
import { SalesModule } from './sales/sales.module';
import { SessionsModule } from './sessions/sessions.module';
import { VouchersModule } from './vouchers/vouchers.module';
import { TrafficModule } from './modules/traffic/traffic.module';
import { IspOperationsModule } from './isp-operations/isp-operations.module';
import { IpamModule } from './ipam/ipam.module';
import { RadiusModule } from './radius/radius.module';
import { RequestIdMiddleware } from './common/request-id.middleware';
import { LifecycleMaintenanceModule } from './maintenance/lifecycle-maintenance.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AccountModule,
    AuditModule,
    AuthModule,
    HealthModule,
    IncidentsModule,
    NotificationsModule,
    OverviewModule,
    CustomersModule,
    BillingModule,
    PackagesModule,
    PurchasesModule,
    PaymentsModule,
    RoutersModule,
    SessionsModule,
    SalesModule,
    VouchersModule,
    TrafficModule,
    IspOperationsModule,
    IpamModule,
    RadiusModule,
    LifecycleMaintenanceModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
